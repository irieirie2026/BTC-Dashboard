"""Homepage motto speech via TTS (Grok primary; Edge optional).

Default engine: xAI Grok TTS (preferred for this app).
Optional: Microsoft Edge neural via HOME_TTS_ENGINE=edge.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / "data" / "tts-cache"

HOME_MOTTO = "Fuck the system and dont forget to stack satoshis"

# Natural punctuation helps cadence (spoken words stay the same).
MOTTO_TTS_TEXT = "Fuck the system and don't forget to stack satoshis."

# edge-tts neural voice (female, natural US English)
# Other good options: en-US-JennyNeural, en-US-AriaNeural, en-US-EmmaNeural
DEFAULT_EDGE_VOICE = "en-US-AvaNeural"
# Slightly assertive without cartoon pacing
DEFAULT_EDGE_RATE = "+8%"
DEFAULT_EDGE_PITCH = "+2Hz"

# Grok primary voice (female — previous preferred take)
DEFAULT_GROK_VOICE = "luna"
DEFAULT_GROK_MODEL = "grok-tts"


def _load_env() -> None:
    for name in (".env.local", ".env"):
        path = ROOT / name
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            if not key:
                continue
            val = val.strip()
            if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
                val = val[1:-1]
            os.environ.setdefault(key, val)


def _api_key() -> str | None:
    _load_env()
    key = (os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY") or "").strip()
    return key or None


def _engine() -> str:
    """grok | edge — default grok (user preference)."""
    _load_env()
    eng = (os.environ.get("HOME_TTS_ENGINE") or "grok").strip().lower()
    if eng in ("edge", "edge-tts", "microsoft", "azure"):
        return "edge"
    return "grok"


def _tts_text() -> str:
    return (os.environ.get("HOME_TTS_TEXT") or MOTTO_TTS_TEXT).strip() or MOTTO_TTS_TEXT


async def _edge_tts_bytes(text: str, voice: str, rate: str, pitch: str) -> bytes:
    import edge_tts  # type: ignore

    communicate = edge_tts.Communicate(text, voice=voice, rate=rate, pitch=pitch)
    chunks: list[bytes] = []
    async for chunk in communicate.stream():
        if chunk.get("type") == "audio" and chunk.get("data"):
            chunks.append(chunk["data"])
    if not chunks:
        raise RuntimeError("edge-tts returned no audio")
    return b"".join(chunks)


def _synthesize_edge() -> dict:
    text = _tts_text()
    voice = (os.environ.get("HOME_TTS_VOICE") or DEFAULT_EDGE_VOICE).strip() or DEFAULT_EDGE_VOICE
    # If user left an old Grok voice id, map to a neural female default
    if voice.lower() in {
        "eve",
        "ara",
        "luna",
        "carina",
        "celeste",
        "iris",
        "ursa",
        "rex",
        "sal",
        "leo",
    }:
        voice = DEFAULT_EDGE_VOICE
    rate = (os.environ.get("HOME_TTS_RATE") or DEFAULT_EDGE_RATE).strip() or DEFAULT_EDGE_RATE
    pitch = (os.environ.get("HOME_TTS_PITCH") or DEFAULT_EDGE_PITCH).strip() or DEFAULT_EDGE_PITCH

    digest = hashlib.sha256(
        f"edge-v1|{voice}|{rate}|{pitch}|{text}".encode("utf-8")
    ).hexdigest()[:20]
    cache_path = CACHE_DIR / f"home-motto-{digest}.mp3"

    if cache_path.is_file() and cache_path.stat().st_size > 200:
        return {
            "ok": True,
            "bytes": cache_path.read_bytes(),
            "contentType": "audio/mpeg",
            "cached": True,
            "voice": voice,
            "model": "edge-tts-neural",
            "engine": "edge",
        }

    try:
        audio = asyncio.run(_edge_tts_bytes(text, voice, rate, pitch))
    except Exception as exc:
        return {
            "ok": False,
            "error": f"edge-tts failed: {exc}",
            "fallback": "grok",
        }

    if not audio or len(audio) < 100:
        return {
            "ok": False,
            "error": "edge-tts returned empty audio",
            "fallback": "grok",
        }

    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(audio)
    except Exception:
        pass

    return {
        "ok": True,
        "bytes": audio,
        "contentType": "audio/mpeg",
        "cached": False,
        "voice": voice,
        "model": "edge-tts-neural",
        "engine": "edge",
    }


def _synthesize_grok() -> dict:
    key = _api_key()
    if not key:
        return {
            "ok": False,
            "error": "XAI_API_KEY not set",
            "fallback": "browser",
        }

    voice = (os.environ.get("HOME_TTS_GROK_VOICE") or DEFAULT_GROK_VOICE).strip() or DEFAULT_GROK_VOICE
    model = (os.environ.get("HOME_TTS_MODEL") or DEFAULT_GROK_MODEL).strip() or DEFAULT_GROK_MODEL
    base = (os.environ.get("XAI_BASE_URL") or "https://api.x.ai/v1").rstrip("/")
    text = _tts_text()
    speed = float(os.environ.get("HOME_TTS_SPEED") or "0.98")
    speed = max(0.7, min(1.5, speed))

    # Cadence-friendly phrasing for Grok only
    if "\n" not in text and "[pause]" not in text:
        # two beats improve Grok prosody without changing wording
        if text.endswith("."):
            core = text[:-1]
        else:
            core = text
        if " and don't " in core.lower() or " and dont " in core.lower():
            # "Fuck the system. [pause] And don't forget…"
            parts = core.split(" and ", 1)
            if len(parts) == 2:
                text = f"{parts[0].rstrip('.,!')}. [pause] And {parts[1]}."

    digest = hashlib.sha256(
        f"grok-v4|{model}|{voice}|{speed}|{text}".encode("utf-8")
    ).hexdigest()[:20]
    cache_path = CACHE_DIR / f"home-motto-{digest}.mp3"

    if cache_path.is_file() and cache_path.stat().st_size > 200:
        return {
            "ok": True,
            "bytes": cache_path.read_bytes(),
            "contentType": "audio/mpeg",
            "cached": True,
            "voice": voice,
            "model": model,
            "engine": "grok",
        }

    body = json.dumps(
        {
            "text": text,
            "voice_id": voice,
            "language": "en",
            "model": model,
            "speed": speed,
            "text_normalization": True,
            "output_format": {
                "codec": "mp3",
                "sample_rate": 44100,
                "bit_rate": 192000,
            },
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{base}/tts",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "User-Agent": "BTC-Dashboard-HomeTTS/4.0",
            "Accept": "audio/mpeg, application/octet-stream, */*",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            audio = resp.read()
            ctype = (resp.headers.get("Content-Type") or "audio/mpeg").split(";")[0].strip()
    except urllib.error.HTTPError as exc:
        try:
            detail = exc.read().decode("utf-8", errors="replace")[:400]
        except Exception:
            detail = ""
        return {
            "ok": False,
            "error": f"xAI TTS HTTP {exc.code}: {detail or exc.reason}",
            "fallback": "browser",
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": f"xAI TTS failed: {exc}",
            "fallback": "browser",
        }

    if not audio or len(audio) < 100:
        return {
            "ok": False,
            "error": "xAI TTS returned empty audio",
            "fallback": "browser",
        }

    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(audio)
    except Exception:
        pass

    return {
        "ok": True,
        "bytes": audio,
        "contentType": ctype if "audio" in ctype else "audio/mpeg",
        "cached": False,
        "voice": voice,
        "model": model,
        "engine": "grok",
    }


def motto_tts_payload(*, refresh: bool = False) -> dict:
    """
    Return either:
      {"ok": True, "bytes": <mp3 bytes>, "contentType": "audio/mpeg", ...}
      {"ok": False, "error": str, "fallback": "browser"|"grok"}
    """
    _load_env()
    eng = _engine()

    # Optional force-refresh: skip disk cache by deleting matching is complex;
    # callers pass refresh=True and we regenerate by not short-circuiting on
    # edge path when refresh — handled by writing new digest or deleting dir.
    if refresh:
        try:
            if CACHE_DIR.is_dir():
                for p in CACHE_DIR.glob("home-motto-*.mp3"):
                    p.unlink(missing_ok=True)
        except Exception:
            pass

    if eng == "edge":
        result = _synthesize_edge()
        if result.get("ok"):
            return result
        grok = _synthesize_grok()
        if grok.get("ok"):
            grok["note"] = f"edge failed ({result.get('error')}); used grok"
            return grok
        return {
            "ok": False,
            "error": f"edge: {result.get('error')}; grok: {grok.get('error')}",
            "fallback": "browser",
        }

    # Default: Grok first, Edge only if Grok fails
    grok = _synthesize_grok()
    if grok.get("ok"):
        return grok
    edge = _synthesize_edge()
    if edge.get("ok"):
        edge["note"] = f"grok failed ({grok.get('error')}); used edge"
        return edge
    return {
        "ok": False,
        "error": f"grok: {grok.get('error')}; edge: {edge.get('error')}",
        "fallback": "browser",
    }
