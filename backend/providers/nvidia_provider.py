"""
NVIDIA NIM Provider — connection, model listing, connection test, retry logic.

Handles all NVIDIA-specific API interactions with robust error handling,
exponential backoff retry, and a connection validation utility.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, Optional

from privacy import build_httpx_async_client

logger = logging.getLogger(__name__)

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"

# Well-known NVIDIA NIM models (fallback when /models endpoint is unavailable)
NVIDIA_KNOWN_MODELS = [
    "nvidia/llama-3.1-nemotron-70b-instruct",
    "meta/llama-3.1-8b-instruct",
    "meta/llama-3.1-70b-instruct",
    "meta/llama-3.1-405b-instruct",
    "mistralai/mistral-7b-instruct-v0.3",
    "mistralai/mixtral-8x7b-instruct-v0.1",
    "google/gemma-2-9b-it",
    "microsoft/phi-3-mini-128k-instruct",
    "nvidia/nemotron-4-340b-instruct",
]

# Retry configuration
MAX_RETRIES = 3
RETRY_BASE_DELAY = 1.0  # seconds
RETRY_MAX_DELAY = 10.0  # seconds
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


def _base_url(base_url: str | None = None) -> str:
    """Get the NVIDIA base URL, properly normalized."""
    raw = (base_url or os.getenv("NVIDIA_BASE_URL", NVIDIA_BASE_URL)).strip().strip("'\"")
    url = raw.rstrip("/")
    # Don't append /v1 if already present
    if not url.endswith("/v1"):
        url = f"{url}/v1"
    return url


def _api_key(api_key: str | None = None) -> str:
    """Get the NVIDIA API key from environment."""
    return (api_key or os.getenv("NVIDIA_API_KEY", "")).strip().strip("'\"")


async def _retry_request(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    json_body: dict[str, Any] | None = None,
    timeout: float = 30.0,
    max_retries: int = MAX_RETRIES,
) -> dict[str, Any]:
    """Execute an HTTP request with exponential backoff retry.

    Returns the parsed JSON response body.
    Raises RuntimeError with a human-readable message on permanent failure.
    """
    import httpx

    last_error: Exception | None = None
    last_status: int | None = None

    for attempt in range(max_retries + 1):
        try:
            async with build_httpx_async_client(timeout=timeout) as client:
                if method.upper() == "GET":
                    resp = await client.get(url, headers=headers)
                else:
                    resp = await client.post(url, headers=headers, json=json_body)

                if resp.status_code < 300:
                    return resp.json()

                last_status = resp.status_code

                # Non-retryable client errors
                if resp.status_code < 500 and resp.status_code != 429:
                    body = resp.text[:300]
                    raise RuntimeError(
                        f"NVIDIA API error {resp.status_code}: {body}"
                    )

                # Retryable — wait and try again
                if attempt < max_retries and resp.status_code in RETRYABLE_STATUS_CODES:
                    delay = min(RETRY_BASE_DELAY * (2 ** attempt), RETRY_MAX_DELAY)
                    logger.warning(
                        "NVIDIA API %s (attempt %d/%d), retrying in %.1fs",
                        resp.status_code, attempt + 1, max_retries + 1, delay,
                    )
                    await asyncio.sleep(delay)
                    continue

                raise RuntimeError(
                    f"NVIDIA API error {resp.status_code} after {attempt + 1} attempts"
                )

        except (httpx.ConnectError, httpx.TimeoutException, httpx.ConnectTimeout) as e:
            last_error = e
            if attempt < max_retries:
                delay = min(RETRY_BASE_DELAY * (2 ** attempt), RETRY_MAX_DELAY)
                logger.warning(
                    "NVIDIA connection failed (attempt %d/%d): %s, retrying in %.1fs",
                    attempt + 1, max_retries + 1, type(e).__name__, delay,
                )
                await asyncio.sleep(delay)
                continue
            raise RuntimeError(
                f"NVIDIA connection failed after {max_retries + 1} attempts: {e}"
            ) from e
        except RuntimeError:
            raise
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                delay = min(RETRY_BASE_DELAY * (2 ** attempt), RETRY_MAX_DELAY)
                await asyncio.sleep(delay)
                continue
            raise RuntimeError(f"NVIDIA request failed: {e}") from e

    raise RuntimeError(
        f"NVIDIA API exhausted {max_retries + 1} retries"
        + (f" (last status: {last_status})" if last_status else "")
        + (f" (last error: {last_error})" if last_error else "")
    )


async def list_nvidia_models(api_key: str | None = None, base_url: str | None = None) -> list[str]:
    """List available models from the NVIDIA NIM endpoint.

    Falls back to a curated list of known models if the API is unreachable.
    """
    resolved_key = _api_key(api_key)
    if not resolved_key:
        logger.warning("NVIDIA_API_KEY not configured")
        return []

    try:
        data = await _retry_request(
            "GET",
            f"{_base_url(base_url)}/models",
            headers={"Authorization": f"Bearer {resolved_key}"},
            timeout=20.0,
            max_retries=2,
        )

        models: list[str] = []
        if isinstance(data, dict):
            model_list = data.get("data", [])
            if isinstance(model_list, list):
                for m in model_list:
                    if isinstance(m, dict):
                        model_id = str(m.get("id", "")).strip()
                        if model_id:
                            models.append(model_id)

        return sorted(models) if models else list(NVIDIA_KNOWN_MODELS)

    except Exception as exc:
        logger.warning("Could not list NVIDIA models: %s — using known models", exc)
        return list(NVIDIA_KNOWN_MODELS)


async def check_nvidia_configured() -> bool:
    """Check if NVIDIA API key is configured."""
    return bool(_api_key())


async def test_nvidia_connection(
    model: str | None = None,
    timeout: float = 15.0,
    api_key: str | None = None,
    base_url: str | None = None,
) -> dict[str, Any]:
    """Test the NVIDIA NIM connection end-to-end.

    Sends a minimal chat completion request and returns a diagnostic result:
      {"ok": True, "latency_ms": 1234, "model": "...", "message": "Connected"}
    or
      {"ok": False, "error": "...", "error_type": "auth|network|model|unknown"}
    """
    resolved_key = _api_key(api_key)
    if not resolved_key:
        return {
            "ok": False,
            "error": "NVIDIA_API_KEY is not set. Add it to your .env file.",
            "error_type": "auth",
        }

    base = _base_url(base_url)
    test_model = model or "meta/llama-3.1-8b-instruct"

    t0 = time.time()
    try:
        data = await _retry_request(
            "POST",
            f"{base}/chat/completions",
            headers={
                "Authorization": f"Bearer {resolved_key}",
                "Content-Type": "application/json",
            },
            json_body={
                "model": test_model,
                "messages": [{"role": "user", "content": "Say OK"}],
                "max_tokens": 5,
                "temperature": 0.1,
            },
            timeout=timeout,
            max_retries=2,
        )
        latency_ms = int((time.time() - t0) * 1000)

        # Verify we got a real response
        choices = data.get("choices", [])
        if choices:
            return {
                "ok": True,
                "latency_ms": latency_ms,
                "model": test_model,
                "message": f"Connected to NVIDIA NIM ({latency_ms}ms)",
            }
        return {
            "ok": False,
            "error": "NVIDIA returned empty response",
            "error_type": "model",
            "raw": data,
        }

    except RuntimeError as e:
        err_str = str(e)
        error_type = "unknown"
        if "401" in err_str or "403" in err_str or "Unauthorized" in err_str:
            error_type = "auth"
        elif "404" in err_str:
            error_type = "model"
        elif "connection" in err_str.lower() or "timeout" in err_str.lower():
            error_type = "network"
        elif "429" in err_str:
            error_type = "rate_limit"

        return {
            "ok": False,
            "error": err_str,
            "error_type": error_type,
            "latency_ms": int((time.time() - t0) * 1000),
        }
    except Exception as e:
        return {
            "ok": False,
            "error": f"Unexpected error: {e}",
            "error_type": "unknown",
            "latency_ms": int((time.time() - t0) * 1000),
        }
