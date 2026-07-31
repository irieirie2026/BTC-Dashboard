"""Homepage motto speech via xAI Grok Text-to-Speech (cached MP3)."""

from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / "data" / "tts-cache"

HOME_MOTTO = "Fuck the system, and don't forget to stack satoshis."

# Buccaneers deck voice — fluid, rebellious cadence (xAI speech tags).
# Cache key includes this string; change it to force a new render.
MOTTO_TTS_TEXT = (
    "[style: smooth rebellious Buccaneer, fluid confident swagger, "
    "anti-establishment, natural rhythm, never robotic] "
    "<intense>Fuck the system.</intense> "
    "[pause] "
    "And don't forget to "
    "<emphasis>stack satoshis.</emphasis>"
)

# Smoother, more fluid default; override with HOME_TTS_VOICE
DEFAULT_VOICE = "ara"


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


def motto_tts_payload(*, refresh: bool = False) -> dict:
    """
    Return either:
      {"ok": True, "bytes": <mp3 bytes>, "contentType": "audio/mpeg", "cached": bool, "voice": str}
      {"ok": False, "error": str, "fallback": "browser"}
    """
    key = _api_key()
    if not key:
        return {
            "ok": False,
            "error": "XAI_API_KEY not set",
            "fallback": "browser",
        }

    voice = (os.environ.get("HOME_TTS_VOICE") or DEFAULT_VOICE).strip() or DEFAULT_VOICE
    base = (os.environ.get("XAI_BASE_URL") or "https://api.x.ai/v1").rstrip("/")
    text = MOTTO_TTS_TEXT
    speed = float(os.environ.get("HOME_TTS_SPEED") or "1.08")
    speed = max(0.7, min(1.5, speed))
    digest = hashlib.sha256(f"{voice}|{speed}|{text}".encode("utf-8")).hexdigest()[:20]
    cache_path = CACHE_DIR / f"home-motto-{digest}.mp3"

    if not refresh and cache_path.is_file() and cache_path.stat().st_size > 200:
        return {
            "ok": True,
            "bytes": cache_path.read_bytes(),
            "contentType": "audio/mpeg",
            "cached": True,
            "voice": voice,
            "model": "grok-tts",
        }

    body = json.dumps(
        {
            "text": text,
            "voice_id": voice,
            "language": "en",
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
            "User-Agent": "BTC-Dashboard-HomeTTS/1.1",
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
        "model": "grok-tts",
    }
