"""
Super Summary paywall — 1 USDT or 1 USDC access gate.

Wallet addresses are configured via env (owner will set them later).
Unlock is a signed access token stored client-side after payment proof is accepted.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
PAYMENTS_PATH = ROOT / "data" / "ss-payments.json"

AMOUNT = float(os.environ.get("SS_PAY_AMOUNT", "1"))
# Days of access after unlock
ACCESS_DAYS = int(os.environ.get("SS_PAY_ACCESS_DAYS", "30"))


def _secret() -> str:
    return (
        os.environ.get("SS_PAYWALL_SECRET")
        or os.environ.get("XAI_API_KEY")
        or "btc-dashboard-ss-paywall-dev"
    ).strip()


def paywall_enabled() -> bool:
    raw = (os.environ.get("SS_PAYWALL_ENABLED") or "1").strip().lower()
    return raw in ("1", "true", "yes", "on")


def _addr(env_key: str) -> str:
    return (os.environ.get(env_key) or "").strip()


def payment_options() -> list[dict[str, Any]]:
    """Configured payment rails (only options with a non-empty address are payable)."""
    opts = [
        {
            "id": "usdt-erc20",
            "asset": "USDT",
            "network": "Ethereum",
            "networkId": "erc20",
            "address": _addr("SS_PAY_USDT_ERC20"),
            "tokenStandard": "ERC-20",
            "hint": "Send exactly 1 USDT (ERC-20) on Ethereum",
        },
        {
            "id": "usdc-erc20",
            "asset": "USDC",
            "network": "Ethereum",
            "networkId": "erc20",
            "address": _addr("SS_PAY_USDC_ERC20"),
            "tokenStandard": "ERC-20",
            "hint": "Send exactly 1 USDC (ERC-20) on Ethereum",
        },
        {
            "id": "usdt-trc20",
            "asset": "USDT",
            "network": "Tron",
            "networkId": "trc20",
            "address": _addr("SS_PAY_USDT_TRC20"),
            "tokenStandard": "TRC-20",
            "hint": "Send exactly 1 USDT (TRC-20) on Tron",
        },
        {
            "id": "usdc-solana",
            "asset": "USDC",
            "network": "Solana",
            "networkId": "solana",
            "address": _addr("SS_PAY_USDC_SOLANA"),
            "tokenStandard": "SPL",
            "hint": "Send exactly 1 USDC on Solana",
        },
    ]
    return opts


def configured_options() -> list[dict[str, Any]]:
    return [o for o in payment_options() if o.get("address")]


def wallets_ready() -> bool:
    return len(configured_options()) > 0


def get_paywall_public_config() -> dict[str, Any]:
    """Safe config for the client (addresses only when set)."""
    opts = payment_options()
    public_opts = []
    for o in opts:
        public_opts.append(
            {
                "id": o["id"],
                "asset": o["asset"],
                "network": o["network"],
                "networkId": o["networkId"],
                "tokenStandard": o["tokenStandard"],
                "hint": o["hint"],
                "address": o["address"] or None,
                "available": bool(o["address"]),
            }
        )
    dev_configured = bool((os.environ.get("SS_PAYWALL_DEV_CODE") or "").strip())
    return {
        "enabled": paywall_enabled(),
        "amount": AMOUNT,
        "currencyOptions": ["USDT", "USDC"],
        "accessDays": ACCESS_DAYS,
        "walletsReady": wallets_ready(),
        "devUnlockAvailable": dev_configured,
        "options": public_opts,
        "message": (
            "Pay 1 USDT or 1 USDC to unlock the Final Report."
            if wallets_ready()
            else "Paywall is active (1 USDT or 1 USDC). Receiving wallet addresses will be configured soon — the report stays locked until then."
        ),
    }


def _load_payments() -> dict[str, Any]:
    if not PAYMENTS_PATH.is_file():
        return {"unlocks": [], "txHashes": []}
    try:
        return json.loads(PAYMENTS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"unlocks": [], "txHashes": []}


def _save_payments(data: dict[str, Any]) -> None:
    PAYMENTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    PAYMENTS_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _b64url(data: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    import base64

    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def issue_access_token(*, tx_hash: str, option_id: str, asset: str) -> dict[str, Any]:
    exp = int(time.time()) + ACCESS_DAYS * 86400
    payload = {
        "v": 1,
        "scope": "super-summary",
        "tx": tx_hash[:128],
        "option": option_id,
        "asset": asset,
        "exp": exp,
        "iat": int(time.time()),
    }
    body = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64url(
        hmac.new(_secret().encode(), body.encode(), hashlib.sha256).digest()
    )
    token = f"{body}.{sig}"
    return {"token": token, "expiresAt": exp, "accessDays": ACCESS_DAYS}


def verify_access_token(token: str | None) -> dict[str, Any]:
    if not token or not isinstance(token, str) or "." not in token:
        return {"ok": False, "error": "missing_token"}
    if not paywall_enabled():
        return {"ok": True, "bypassed": True}
    try:
        body, sig = token.strip().split(".", 1)
        expect = _b64url(
            hmac.new(_secret().encode(), body.encode(), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(sig, expect):
            return {"ok": False, "error": "invalid_signature"}
        payload = json.loads(_b64url_decode(body).decode())
        if payload.get("scope") != "super-summary":
            return {"ok": False, "error": "invalid_scope"}
        exp = int(payload.get("exp") or 0)
        if exp < int(time.time()):
            return {"ok": False, "error": "expired"}
        return {"ok": True, "payload": payload, "expiresAt": exp}
    except Exception:
        return {"ok": False, "error": "malformed_token"}


def _normalize_tx(tx: str) -> str:
    return (tx or "").strip()


def _tx_looks_valid(tx: str, network_id: str) -> bool:
    t = _normalize_tx(tx)
    if network_id == "erc20":
        return bool(re.fullmatch(r"0x[a-fA-F0-9]{64}", t))
    if network_id == "trc20":
        # Tron tx ids are 64 hex chars (sometimes without 0x)
        return bool(re.fullmatch(r"(0x)?[a-fA-F0-9]{64}", t))
    if network_id == "solana":
        return 32 <= len(t) <= 128 and bool(re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]+", t))
    return len(t) >= 16


def _codes_match(expected: str, provided: str) -> bool:
    """Constant-time-ish compare that never raises on unequal lengths."""
    a = (expected or "").encode("utf-8")
    b = (provided or "").encode("utf-8")
    # Hash first so lengths always match for compare_digest
    return hmac.compare_digest(
        hashlib.sha256(a).digest(),
        hashlib.sha256(b).digest(),
    )


def try_unlock(
    *,
    option_id: str,
    tx_hash: str,
    dev_code: str | None = None,
) -> dict[str, Any]:
    """
    Accept payment proof and issue access token.

    When wallets are not configured yet: unlock is rejected (report stays locked).
    Dev unlock: SS_PAYWALL_DEV_CODE in env matches client-supplied code.
    """
    if not paywall_enabled():
        tok = issue_access_token(tx_hash="paywall-off", option_id="off", asset="—")
        return {"ok": True, **tok, "mode": "paywall_disabled", "message": "Paywall disabled — access granted."}

    dev_expected = (os.environ.get("SS_PAYWALL_DEV_CODE") or "").strip()
    dev_provided = str(dev_code or "").strip()
    wants_dev = (option_id or "").strip().lower() in ("dev", "developer") or bool(dev_provided)

    if wants_dev:
        if not dev_expected:
            return {
                "ok": False,
                "error": "dev_not_configured",
                "message": (
                    "Developer unlock is not configured. "
                    "Add SS_PAYWALL_DEV_CODE to .env.local (or Vercel env) and restart the server."
                ),
            }
        if not dev_provided:
            return {
                "ok": False,
                "error": "dev_code_required",
                "message": "Enter the developer unlock code.",
            }
        if not _codes_match(dev_expected, dev_provided):
            return {
                "ok": False,
                "error": "invalid_dev_code",
                "message": "Invalid developer unlock code. Check SS_PAYWALL_DEV_CODE and try again.",
            }
        tok = issue_access_token(tx_hash="dev-unlock", option_id="dev", asset="DEV")
        return {
            "ok": True,
            **tok,
            "mode": "dev",
            "message": f"Developer unlock granted for {ACCESS_DAYS} days. Building the report…",
        }

    if not wallets_ready():
        return {
            "ok": False,
            "error": "wallets_not_configured",
            "message": (
                "Payment wallets are not configured yet. "
                "Use Developer unlock (SS_PAYWALL_DEV_CODE), or set SS_PAY_USDT_* / SS_PAY_USDC_* "
                "in .env.local and restart."
            ),
        }

    opts = {o["id"]: o for o in configured_options()}
    opt = opts.get(option_id)
    if not opt:
        return {
            "ok": False,
            "error": "unknown_option",
            "message": "Choose a payable network (USDT or USDC) that has a configured address.",
        }

    tx = _normalize_tx(tx_hash)
    if not _tx_looks_valid(tx, opt["networkId"]):
        return {
            "ok": False,
            "error": "invalid_tx",
            "message": f"Transaction hash does not look valid for {opt['network']}.",
        }

    store = _load_payments()
    used = set(store.get("txHashes") or [])
    tx_key = tx.lower()
    if tx_key in used:
        return {
            "ok": False,
            "error": "tx_already_used",
            "message": "This transaction was already used to unlock access.",
        }

    # Record payment (on-chain verification can be added once explorers/RPC are wired).
    # For now: unique valid-format tx + configured destination option is enough to issue access.
    # Owner can later flip SS_PAYWALL_REQUIRE_ONCHAIN=1 and implement explorer checks.
    require_onchain = (os.environ.get("SS_PAYWALL_REQUIRE_ONCHAIN") or "").strip().lower() in (
        "1",
        "true",
        "yes",
    )
    if require_onchain:
        return {
            "ok": False,
            "error": "onchain_not_implemented",
            "message": (
                "On-chain verification is enabled but not fully wired yet. "
                "Set SS_PAYWALL_REQUIRE_ONCHAIN=0 until explorer verification is added, "
                "or use SS_PAYWALL_DEV_CODE for testing."
            ),
        }

    used.add(tx_key)
    store["txHashes"] = sorted(used)
    unlocks = store.get("unlocks") or []
    unlocks.append(
        {
            "tx": tx_key,
            "optionId": option_id,
            "asset": opt["asset"],
            "network": opt["network"],
            "address": opt["address"],
            "amount": AMOUNT,
            "at": int(time.time()),
        }
    )
    store["unlocks"] = unlocks[-500:]
    _save_payments(store)

    tok = issue_access_token(tx_hash=tx_key, option_id=option_id, asset=opt["asset"])
    return {
        "ok": True,
        **tok,
        "mode": "payment",
        "message": f"Access granted for {ACCESS_DAYS} days after payment of {AMOUNT} {opt['asset']}.",
    }


def require_super_summary_access(token: str | None) -> dict[str, Any]:
    """Gate for the report API."""
    if not paywall_enabled():
        return {"ok": True, "bypassed": True}
    return verify_access_token(token)
