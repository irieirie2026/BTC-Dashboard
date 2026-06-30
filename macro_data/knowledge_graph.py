"""Knowledge Graph ingest + RAG helpers for Misc → Knowledge Graph.

Routes:
  POST /api/misc/knowledge-graph/ingest
  POST /api/misc/knowledge-graph/rag
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html.parser import HTMLParser

USER_AGENT = "BTC-Dashboard/1.0 (+knowledge-graph)"
CHUNK_SIZE = 900
CHUNK_OVERLAP = 120

BTC_TERMS = {
    "bitcoin", "btc", "satoshi", "halving", "mining", "hashrate", "lightning",
    "etf", "sopr", "mvrv", "exchange", "mempool", "blockchain", "defi",
    "stablecoin", "fed", "inflation", "sec", "regulation",
}


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts: list[str] = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        self._skip = tag in ("script", "style", "noscript")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self._skip = False
        if tag in ("p", "div", "br", "li", "h1", "h2", "h3", "h4"):
            self._parts.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self._parts.append(data)

    def text(self) -> str:
        return re.sub(r"\n{3,}", "\n\n", "".join(self._parts)).strip()


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _fetch_bytes(url: str, *, timeout: int = 35) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _fetch_text(url: str, *, timeout: int = 35) -> str:
    raw = _fetch_bytes(url, timeout=timeout)
    return raw.decode("utf-8", errors="replace")


def _slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")
    return s[:48] or "entity"


def _chunk_text(text: str, *, timestamps: list[dict] | None = None) -> list[dict]:
    text = (text or "").strip()
    if not text:
        return []
    chunks: list[dict] = []
    if timestamps:
        buf = ""
        start_ts = timestamps[0].get("start") if timestamps else None
        for seg in timestamps:
            line = (seg.get("text") or "").strip()
            if not line:
                continue
            if len(buf) + len(line) > CHUNK_SIZE and buf:
                chunks.append({"text": buf.strip(), "timestamp": seg.get("start"), "end": seg.get("end")})
                buf = line
            else:
                buf = f"{buf} {line}".strip() if buf else line
            start_ts = start_ts or seg.get("start")
        if buf:
            chunks.append({"text": buf.strip(), "timestamp": start_ts})
        return chunks

    i = 0
    idx = 0
    while i < len(text):
        piece = text[i : i + CHUNK_SIZE].strip()
        if piece:
            chunks.append({"id": f"chunk-{idx}", "text": piece, "offset": i})
            idx += 1
        i += max(CHUNK_SIZE - CHUNK_OVERLAP, 1)
    return chunks


def _parse_srt_vtt(raw: str) -> tuple[str, list[dict]]:
    segments: list[dict] = []
    blocks = re.split(r"\n\s*\n", raw.strip())
    for block in blocks:
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        if len(lines) < 2:
            continue
        time_line = lines[1] if "-->" in lines[1] else (lines[0] if "-->" in lines[0] else "")
        if "-->" not in time_line:
            continue
        start, end = [p.strip() for p in time_line.split("-->")[:2]]
        text_lines = lines[2:] if "-->" in lines[1] else lines[1:]
        text = " ".join(text_lines).strip()
        if text:
            segments.append({"start": start, "end": end, "text": text})
    full = "\n".join(s["text"] for s in segments)
    return full, segments


def _parse_rss(xml_text: str) -> list[dict]:
    items: list[dict] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return items
    for item in root.iter():
        if not item.tag.endswith("item") and not item.tag.endswith("entry"):
            continue
        title = link = desc = pub = ""
        for child in item:
            tag = child.tag.split("}")[-1].lower()
            if tag == "title":
                title = (child.text or "").strip()
            elif tag == "link":
                link = (child.text or child.get("href") or "").strip()
            elif tag in ("description", "summary", "content"):
                desc = (child.text or "").strip()
            elif tag in ("pubdate", "published", "updated"):
                pub = (child.text or "").strip()
        if title or desc:
            items.append({"title": title, "link": link, "description": desc, "published": pub})
    return items


def _youtube_id(url: str) -> str | None:
    m = re.search(r"(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None


def _youtube_transcript(video_id: str) -> tuple[str, list[dict]]:
    url = f"https://www.youtube.com/api/timedtext?lang=en&v={video_id}"
    try:
        raw = _fetch_text(url)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        return "", []
    segments: list[dict] = []
    try:
        root = ET.fromstring(raw)
        for node in root.iter():
            if node.tag.endswith("text"):
                start = node.get("start", "")
                dur = node.get("dur", "0")
                text = (node.text or "").replace("\n", " ").strip()
                if text:
                    end = str(float(start or 0) + float(dur or 0))
                    segments.append({"start": start, "end": end, "text": text})
    except ET.ParseError:
        return "", []
    return " ".join(s["text"] for s in segments), segments


def _extract_entities(text: str) -> tuple[list[dict], list[dict]]:
    nodes: dict[str, dict] = {}
    edges: list[dict] = []

    for term in BTC_TERMS:
        if re.search(rf"\b{re.escape(term)}\b", text, re.I):
            nid = _slug(term)
            nodes[nid] = {"id": nid, "label": term.title() if term != "btc" else "BTC", "type": "concept"}

    for match in re.finditer(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b", text):
        phrase = match.group(1).strip()
        if len(phrase) < 3 or phrase.lower() in BTC_TERMS:
            continue
        nid = _slug(phrase)
        if nid not in nodes:
            nodes[nid] = {"id": nid, "label": phrase, "type": "entity"}

    for m in re.finditer(
        r"(\b(?:Bitcoin|BTC)\b).{0,80}?\b(halving|mining|ETF|regulation|adoption)\b",
        text,
        re.I,
    ):
        a, b = _slug(m.group(1)), _slug(m.group(2))
        nodes.setdefault(a, {"id": a, "label": m.group(1), "type": "asset"})
        nodes.setdefault(b, {"id": b, "label": m.group(2).title(), "type": "concept"})
        edges.append({"id": f"{a}->{b}", "source": a, "target": b, "label": "relates_to"})

    dollar = re.findall(r"\$[\d,]+(?:\.\d+)?[kKmMbB]?", text)
    for d in dollar[:8]:
        nid = _slug(d)
        nodes[nid] = {"id": nid, "label": d, "type": "price_level"}
        if "bitcoin" in nodes or "btc" in nodes:
            src = "bitcoin" if "bitcoin" in nodes else "btc"
            edges.append({"id": f"{src}->{nid}", "source": src, "target": nid, "label": "price_target"})

    return list(nodes.values()), edges


def _llm_answer(query: str, context: str) -> str | None:
    import os

    key = os.environ.get("OPENAI_API_KEY") or os.environ.get("GROK_API_KEY")
    if not key:
        return None
    base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
    payload = {
        "model": os.environ.get("KG_LLM_MODEL", "gpt-4o-mini"),
        "messages": [
            {
                "role": "system",
                "content": "You answer using only the provided knowledge graph and document context about Bitcoin and markets. Cite timestamps when present.",
            },
            {"role": "user", "content": f"Question: {query}\n\nContext:\n{context[:12000]}"},
        ],
        "temperature": 0.2,
        "max_tokens": 600,
    }
    req = urllib.request.Request(
        f"{base.rstrip('/')}/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode())
        return data["choices"][0]["message"]["content"].strip()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, KeyError, json.JSONDecodeError):
        return None


def process_ingest(body: dict) -> dict:
    kind = (body.get("type") or "auto").lower()
    url = (body.get("url") or "").strip()
    text = (body.get("text") or "").strip()
    title = (body.get("title") or "").strip()
    b64 = body.get("base64") or ""
    filename = (body.get("filename") or "").strip()

    if kind == "auto":
        if url:
            if "youtube.com" in url or "youtu.be" in url:
                kind = "youtube"
            elif filename.endswith((".rss", ".xml")) or "feed" in url.lower():
                kind = "rss"
            else:
                kind = "url"
        elif filename.endswith(".pdf"):
            kind = "pdf"
        elif filename.endswith((".srt", ".vtt")):
            kind = "transcript"
        elif filename.endswith((".mp3", ".wav", ".m4a", ".mp4", ".webm", ".mov")):
            kind = "media"
        elif text:
            kind = "text"
        else:
            kind = "text"

    metadata: dict = {"type": kind, "source": url or filename or "paste", "ingestedAt": _now_iso()}
    segments: list[dict] = []
    items: list[dict] = []

    if kind == "url" and url:
        html = _fetch_text(url)
        parser = _TextExtractor()
        parser.feed(html)
        text = parser.text()
        title = title or re.search(r"<title[^>]*>([^<]+)", html, re.I)
        title = title.group(1).strip() if title else url
        metadata["url"] = url

    elif kind == "youtube" and url:
        vid = _youtube_id(url)
        if not vid:
            raise ValueError("Invalid YouTube URL")
        text, segments = _youtube_transcript(vid)
        metadata["videoId"] = vid
        metadata["url"] = url
        title = title or f"YouTube {vid}"

    elif kind == "rss" and url:
        xml_text = _fetch_text(url)
        items = _parse_rss(xml_text)
        text = "\n\n".join(
            f"{it.get('title', '')}\n{it.get('description', '')}" for it in items[:40]
        )
        metadata["itemCount"] = len(items)
        title = title or url

    elif kind == "transcript":
        raw = text
        if b64:
            import base64

            raw = base64.b64decode(b64).decode("utf-8", errors="replace")
        text, segments = _parse_srt_vtt(raw)
        title = title or filename or "Transcript"

    elif kind == "pdf" and b64:
        import base64

        pdf_bytes = base64.b64decode(b64)
        try:
            from pypdf import PdfReader
            import io

            reader = PdfReader(io.BytesIO(pdf_bytes))
            text = "\n".join((p.extract_text() or "") for p in reader.pages)
        except ImportError:
            raise ValueError("PDF parsing requires pypdf on server")
        title = title or filename or "PDF document"

    elif kind == "media":
        text = text or "[Media file registered — attach transcript or enable speech-to-text for full text extraction]"
        metadata["note"] = "Audio/video binary stored client-side; text extraction needs transcript"
        title = title or filename or "Media"

    elif kind in ("text", "markdown"):
        title = title or filename or "Text note"

    else:
        if not text and not url:
            raise ValueError("No ingest input provided")
        if not text and url:
            return process_ingest({**body, "type": "url"})

    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        raise ValueError("No extractable text from source")

    chunks = _chunk_text(text, timestamps=segments or None)
    nodes, edges = _extract_entities(text)

    return {
        "title": title or metadata.get("source", "Document"),
        "text": text[:50000],
        "chunks": chunks,
        "segments": segments,
        "metadata": metadata,
        "entities": nodes,
        "relationships": edges,
        "rssItems": items,
    }


def process_rag(body: dict) -> dict:
    query = (body.get("query") or "").strip()
    if not query:
        raise ValueError("Missing query")

    chunks = body.get("chunks") or []
    graph = body.get("graph") or {}
    nodes = {n["id"]: n for n in (graph.get("nodes") or []) if n.get("id")}
    edges = graph.get("edges") or []

    q_tokens = set(re.findall(r"[a-z0-9]{3,}", query.lower()))

    scored: list[tuple[float, dict]] = []
    for ch in chunks:
        text = (ch.get("text") or "").lower()
        tokens = set(re.findall(r"[a-z0-9]{3,}", text))
        if not tokens:
            continue
        overlap = len(q_tokens & tokens)
        if overlap == 0:
            continue
        score = overlap / (len(q_tokens) ** 0.5)
        scored.append((score, ch))
    scored.sort(key=lambda x: -x[0])
    top_chunks = [c for _, c in scored[:8]]

    hit_nodes = []
    for nid, node in nodes.items():
        label = (node.get("label") or "").lower()
        if any(t in label for t in q_tokens):
            hit_nodes.append(node)
    hit_ids = {n["id"] for n in hit_nodes[:6]}

    paths: list[list[str]] = []
    adj: dict[str, list[tuple[str, str]]] = {}
    for e in edges:
        s, t, lbl = e.get("source"), e.get("target"), e.get("label", "relates")
        if s and t:
            adj.setdefault(s, []).append((t, lbl))

    for start in list(hit_ids)[:4]:
        path = [start]
        cur = start
        for _ in range(4):
            nxts = adj.get(cur) or []
            if not nxts:
                break
            nxt, lbl = nxts[0]
            path.append(f"—{lbl}→{nxt}")
            cur = nxt
        paths.append(path)

    context_parts = []
    for ch in top_chunks:
        ts = ch.get("timestamp")
        prefix = f"[{ts}] " if ts else ""
        context_parts.append(prefix + (ch.get("text") or "")[:600])
    for p in paths[:5]:
        context_parts.append("PATH: " + " ".join(p))

    context = "\n\n".join(context_parts)
    llm_raw = _llm_answer(query, context)
    if llm_raw:
        answer = llm_raw
        used_llm = True
    elif top_chunks:
        answer = (
            f"Found {len(top_chunks)} relevant passage(s) and {len(hit_nodes)} graph node(s) matching "
            f"\"{query}\". Top excerpt: \"{(top_chunks[0].get('text') or '')[:280]}…\" "
            "(Set OPENAI_API_KEY for LLM synthesis.)"
        )
        used_llm = False
    else:
        answer = f"No strong document matches for \"{query}\". Try ingesting more sources or add schema nodes."
        used_llm = False

    return {
        "query": query,
        "answer": answer,
        "chunks": top_chunks,
        "paths": paths,
        "nodes": hit_nodes[:8],
        "usedLlm": used_llm,
    }