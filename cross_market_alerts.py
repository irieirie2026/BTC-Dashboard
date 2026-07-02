"""Outbound alert dispatch: webhook, Telegram, Resend email."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

USER_AGENT = "BTC-Dashboard/1.0 (+cross-market-alerts)"


def _post_json(url: str, payload: dict, headers: dict | None = None) -> tuple[bool, str]:
    body = json.dumps(payload).encode()
    hdrs = {"User-Agent": USER_AGENT, "Content-Type": "application/json", **(headers or {})}
    req = urllib.request.Request(url, data=body, headers=hdrs, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return True, resp.read().decode()[:200]
    except Exception as exc:
        return False, str(exc)


def send_webhook(url: str, alert: dict) -> dict:
    if not url:
        return {"ok": False, "error": "no webhook url"}
    ok, detail = _post_json(url, {"source": "btc-dashboard", "alert": alert})
    return {"ok": ok, "detail": detail}


def send_telegram(alert: dict) -> dict:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        return {"ok": False, "skipped": True, "reason": "telegram not configured"}
    text = f"*{alert.get('title', 'Alert')}*\n{alert.get('body', '')}"
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    ok, detail = _post_json(url, {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"})
    return {"ok": ok, "detail": detail}


def send_email(alert: dict) -> dict:
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    to_addr = os.environ.get("ALERT_EMAIL_TO", "").strip()
    from_addr = os.environ.get("ALERT_EMAIL_FROM", "alerts@btc-dashboard.local").strip()
    if not api_key or not to_addr:
        return {"ok": False, "skipped": True, "reason": "email not configured"}
    ok, detail = _post_json(
        "https://api.resend.com/emails",
        {
            "from": from_addr,
            "to": [to_addr],
            "subject": f"BTC Cross-Market: {alert.get('title', 'Alert')}",
            "text": alert.get("body", ""),
        },
        headers={"Authorization": f"Bearer {api_key}"},
    )
    return {"ok": ok, "detail": detail}


def dispatch_alert(body: dict | None) -> dict:
    body = body or {}
    alert = body.get("alert") or {}
    settings = body.get("settings") or {}
    results = {
        "webhook": send_webhook((settings.get("webhookUrl") or "").strip(), alert),
        "telegram": send_telegram(alert),
        "email": send_email(alert),
    }
    return {"alert": alert, "results": results}