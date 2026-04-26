"""
CDN proxy for sandboxed artifact iframes.

Sandboxed iframes (sandbox="allow-scripts") get a null origin.
Some browsers/networks fail to resolve external CDN hostnames from null-origin
contexts. This proxy fetches CDN resources server-side (where DNS works fine)
and serves them with CORS headers so the iframe can load them from localhost.

Allowed hosts are explicitly allowlisted — no arbitrary SSRF.
"""

from __future__ import annotations

import hashlib
import logging
import urllib.request
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

router = APIRouter(prefix="/api/cdn-proxy", tags=["cdn-proxy"])
logger = logging.getLogger(__name__)

# Allowlisted CDN hostnames — only these can be proxied
# Only static-asset CDNs — no ES-module CDNs (esm.sh, skypack, unpkg, jsdelivr)
# because those serve files with relative imports that break when the base URL
# changes from the CDN origin to our proxy URL.
ALLOWED_HOSTS = frozenset({
    "cdn.tailwindcss.com",
    "cdnjs.cloudflare.com",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "ajax.googleapis.com",
    "code.jquery.com",
    "cdn.plot.ly",
    "d3js.org",
})

# Simple in-process LRU-style cache (url → bytes). Bounded to 50 entries.
_CACHE: dict[str, bytes] = {}
_CACHE_CONTENT_TYPE: dict[str, str] = {}
MAX_CACHE = 50


def _mime_for_url(url: str, default: str = "application/octet-stream") -> str:
    u = url.lower().split("?")[0]
    if u.endswith(".css"):
        return "text/css"
    if u.endswith(".js") or u.endswith(".mjs"):
        return "application/javascript"
    if u.endswith(".woff2"):
        return "font/woff2"
    if u.endswith(".woff"):
        return "font/woff"
    if u.endswith(".ttf"):
        return "font/ttf"
    if u.endswith(".svg"):
        return "image/svg+xml"
    if u.endswith(".png"):
        return "image/png"
    return default


def _fetch(url: str, timeout: float = 10.0) -> tuple[bytes, str]:
    """Fetch URL server-side. Returns (body_bytes, content_type)."""
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Kodo CDN Proxy)",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        ct = resp.headers.get("Content-Type", _mime_for_url(url))
        # Strip charset and extra params from Content-Type for JS/CSS
        ct_base = ct.split(";")[0].strip()
        data = resp.read()
    return data, ct_base


@router.get("")
@router.get("/")
async def proxy_cdn(url: str = Query(..., description="CDN URL to proxy")):
    """Fetch a CDN resource server-side and return it with CORS headers.
    Only allowlisted CDN hostnames are permitted."""
    parsed = urlparse(url)
    host = parsed.netloc.lower()

    # Security: only allowlisted hosts
    if host not in ALLOWED_HOSTS:
        raise HTTPException(
            status_code=403,
            detail=f"Host '{host}' is not in the CDN proxy allowlist.",
        )

    # Normalise to https
    safe_url = "https://" + host + parsed.path
    if parsed.query:
        safe_url += "?" + parsed.query

    cache_key = hashlib.sha256(safe_url.encode()).hexdigest()

    if cache_key in _CACHE:
        data = _CACHE[cache_key]
        ct = _CACHE_CONTENT_TYPE.get(cache_key, "application/octet-stream")
    else:
        try:
            data, ct = _fetch(safe_url)
        except Exception as exc:
            logger.warning("CDN proxy failed for %s: %s", safe_url, exc)
            raise HTTPException(status_code=502, detail=f"Failed to fetch {safe_url}: {exc}")

        # Evict oldest if full
        if len(_CACHE) >= MAX_CACHE:
            oldest = next(iter(_CACHE))
            _CACHE.pop(oldest, None)
            _CACHE_CONTENT_TYPE.pop(oldest, None)

        _CACHE[cache_key] = data
        _CACHE_CONTENT_TYPE[cache_key] = ct

    return Response(
        content=data,
        media_type=ct,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET",
            "Cache-Control": "public, max-age=86400",
            "X-CDN-Proxy": host,
        },
    )
