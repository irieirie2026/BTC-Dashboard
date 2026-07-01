"""Semantic merge via xAI embeddings."""

from __future__ import annotations

import json
import math
import os
import urllib.error
import urllib.request

USER_AGENT = "BTC-Dashboard/1.0 (+knowledge-graph)"
DEFAULT_EMBED_MODEL = "text-embedding-3-small"


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def embed_texts(texts: list[str]) -> list[list[float]] | None:
    key = os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY")
    if not key or not texts:
        return None
    base = os.environ.get("XAI_BASE_URL", "https://api.x.ai/v1").rstrip("/")
    model = os.environ.get("KG_EMBED_MODEL", DEFAULT_EMBED_MODEL)
    payload = {"model": model, "input": texts[:32]}
    req = urllib.request.Request(
        f"{base}/embeddings",
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
        items = data.get("data") or []
        items.sort(key=lambda x: x.get("index", 0))
        return [item["embedding"] for item in items if item.get("embedding")]
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, KeyError, json.JSONDecodeError):
        return None


def _node_embed_text(node: dict) -> str:
    return f"{node.get('label') or ''} | {node.get('type') or ''} | {(node.get('description') or '')[:200]}"


def _types_compatible(a: str, b: str) -> bool:
    if a == b:
        return True
    compat = {
        frozenset({"org", "financial_institution"}),
        frozenset({"concept", "indicator", "metric"}),
        frozenset({"asset", "product"}),
    }
    for group in compat:
        if a in group and b in group:
            return True
    return False


def semantic_align_node(
    label: str,
    ntype: str,
    description: str,
    existing_nodes: list[dict],
    *,
    threshold: float = 0.88,
) -> str | None:
    """Return existing node id if semantically similar, else None."""
    if not existing_nodes:
        return None
    probe = {"label": label, "type": ntype, "description": description}
    probe_text = _node_embed_text(probe)
    existing_texts = [_node_embed_text(n) for n in existing_nodes[:40]]
    vectors = embed_texts([probe_text] + existing_texts)
    if not vectors or len(vectors) < 2:
        return None
    probe_vec = vectors[0]
    best_id = None
    best_score = 0.0
    for node, vec in zip(existing_nodes[:40], vectors[1:]):
        score = _cosine_similarity(probe_vec, vec)
        if score > best_score and score >= threshold:
            if _types_compatible(ntype, node.get("type") or "entity"):
                best_score = score
                best_id = node.get("id")
    return best_id


def semantic_merge_nodes(
    new_nodes: list[dict],
    existing_nodes: list[dict],
    *,
    threshold: float = 0.88,
) -> list[dict]:
    """Attach mergeTargetId on new nodes that semantically match existing graph nodes."""
    if not new_nodes or not existing_nodes:
        return new_nodes
    out: list[dict] = []
    for node in new_nodes:
        n = dict(node)
        if n.get("mergeTargetId"):
            out.append(n)
            continue
        hit = semantic_align_node(
            n.get("label") or "",
            n.get("type") or "entity",
            n.get("description") or "",
            existing_nodes,
            threshold=threshold,
        )
        if hit and hit != n.get("id"):
            n["mergeTargetId"] = hit
            n["semanticMatch"] = True
        out.append(n)
    return out