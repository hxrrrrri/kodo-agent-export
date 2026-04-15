from __future__ import annotations

import asyncio
import ipaddress
import json
import os
import re
import socket
import time
from collections import deque
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser

import httpx

from observability.audit import log_audit_event
from privacy import build_httpx_async_client

from .base import BaseTool, ToolResult

_ALLOWED_SCHEMES = {"http", "https"}

_DEFAULT_BLOCKED_HOSTS = {
    "localhost",
    "metadata.google.internal",
    "instance-data.ec2.internal",
}

_SSRF_BLOCKED_NETWORKS = tuple(
    ipaddress.ip_network(value)
    for value in (
        "0.0.0.0/8",
        "10.0.0.0/8",
        "100.64.0.0/10",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "172.16.0.0/12",
        "192.0.0.0/24",
        "192.0.2.0/24",
        "192.168.0.0/16",
        "198.18.0.0/15",
        "224.0.0.0/4",
        "240.0.0.0/4",
        "::1/128",
        "fc00::/7",
        "fe80::/10",
        "ff00::/8",
    )
)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int, *, min_value: int, max_value: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(min_value, min(max_value, value))


def _split_csv(raw: str) -> list[str]:
    parts: list[str] = []
    for item in (raw or "").split(","):
        value = item.strip()
        if value:
            parts.append(value)
    return parts


def _normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _strip_html_tags(text: str) -> str:
    without_tags = re.sub(r"<[^>]+>", " ", text or "")
    return _normalize_space(without_tags)


def _canonical_host(host: str) -> str:
    lowered = (host or "").strip().rstrip(".").lower()
    if not lowered:
        return ""
    try:
        return lowered.encode("idna").decode("ascii")
    except UnicodeError:
        return lowered


def _host_matches(host: str, pattern: str) -> bool:
    normalized_pattern = _canonical_host(pattern)
    if not normalized_pattern:
        return False
    return host == normalized_pattern or host.endswith("." + normalized_pattern)


class _HTMLContentParser(HTMLParser):
    def __init__(self, *, max_links: int) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[str] = []
        self.text_chunks: list[str] = []
        self.title = ""
        self._capture_title = False
        self._suppressed_depth = 0
        self._max_links = max_links

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        lowered = tag.lower()
        if lowered in {"script", "style"}:
            self._suppressed_depth += 1
            return

        if lowered == "title":
            self._capture_title = True
            return

        if lowered == "a" and len(self.links) < self._max_links:
            href_value = ""
            for key, value in attrs:
                if key.lower() == "href":
                    href_value = (value or "").strip()
                    break
            if href_value:
                self.links.append(href_value)

    def handle_endtag(self, tag: str) -> None:
        lowered = tag.lower()
        if lowered in {"script", "style"} and self._suppressed_depth > 0:
            self._suppressed_depth -= 1
            return
        if lowered == "title":
            self._capture_title = False

    def handle_data(self, data: str) -> None:
        if self._suppressed_depth > 0:
            return

        normalized = _normalize_space(data)
        if not normalized:
            return

        if self._capture_title:
            if self.title:
                self.title = f"{self.title} {normalized}".strip()
            else:
                self.title = normalized
            return

        self.text_chunks.append(normalized)


class KrawlXTool(BaseTool):
    name = "krawlx_crawl"
    description = (
        "Securely crawl a website with SSRF protections, robots.txt compliance, "
        "domain controls, and bounded recursion."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "Seed URL to crawl.",
            },
            "max_pages": {
                "type": "integer",
                "description": "Maximum number of pages to fetch.",
                "default": 20,
            },
            "max_depth": {
                "type": "integer",
                "description": "Maximum link depth from the seed URL.",
                "default": 2,
            },
            "same_origin": {
                "type": "boolean",
                "description": "Restrict crawl to the seed host.",
                "default": True,
            },
            "obey_robots": {
                "type": "boolean",
                "description": "Respect robots.txt rules.",
                "default": True,
            },
            "include_patterns": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional regex allowlist for candidate URLs.",
            },
            "exclude_patterns": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional regex denylist for candidate URLs.",
            },
            "timeout_seconds": {
                "type": "number",
                "description": "Per-request timeout in seconds.",
                "default": 10,
            },
        },
        "required": ["url"],
    }

    def __init__(self) -> None:
        self._force_https = _env_bool("KRAWLX_FORCE_HTTPS", True)
        self._allow_private_networks = _env_bool("KRAWLX_ALLOW_PRIVATE_NETWORKS", False)
        self._allow_nonstandard_ports = _env_bool("KRAWLX_ALLOW_NONSTANDARD_PORTS", False)

        self._default_max_pages = _env_int(
            "KRAWLX_MAX_PAGES_DEFAULT",
            20,
            min_value=1,
            max_value=200,
        )
        self._hard_max_pages = _env_int(
            "KRAWLX_MAX_PAGES_HARD_LIMIT",
            500,
            min_value=1,
            max_value=5000,
        )
        self._default_max_depth = _env_int(
            "KRAWLX_MAX_DEPTH_DEFAULT",
            2,
            min_value=0,
            max_value=10,
        )
        self._max_page_bytes = _env_int(
            "KRAWLX_MAX_PAGE_KB",
            512,
            min_value=64,
            max_value=4096,
        ) * 1024
        self._max_links_per_page = _env_int(
            "KRAWLX_MAX_LINKS_PER_PAGE",
            500,
            min_value=50,
            max_value=2000,
        )
        self._max_text_chars = _env_int(
            "KRAWLX_MAX_TEXT_CHARS",
            4000,
            min_value=500,
            max_value=20000,
        )
        self._max_redirects = _env_int(
            "KRAWLX_MAX_REDIRECTS",
            5,
            min_value=0,
            max_value=20,
        )
        self._host_delay_seconds = _env_int(
            "KRAWLX_HOST_DELAY_MS",
            200,
            min_value=0,
            max_value=10000,
        ) / 1000.0

        blocked_hosts = set(_DEFAULT_BLOCKED_HOSTS)
        blocked_hosts.update(_canonical_host(item) for item in _split_csv(os.getenv("KRAWLX_BLOCKED_HOSTS", "")))
        self._blocked_hosts = {value for value in blocked_hosts if value}

        self._allowed_hosts = {
            _canonical_host(item)
            for item in _split_csv(os.getenv("KRAWLX_ALLOWED_HOSTS", ""))
            if _canonical_host(item)
        }

        self._user_agent = os.getenv("KRAWLX_USER_AGENT", "KrawlXBot/1.0 (+security-first)").strip() or "KrawlXBot/1.0"
        self._provider_mode = os.getenv("KRAWLX_PROVIDER", "auto").strip().lower() or "auto"
        if self._provider_mode not in {"auto", "native", "firecrawl"}:
            self._provider_mode = "auto"
        self._firecrawl_fallback = _env_bool("KRAWLX_FIRECRAWL_FALLBACK", True)
        self._firecrawl_base_url = os.getenv("FIRECRAWL_BASE_URL", "https://api.firecrawl.dev").strip().rstrip("/") or "https://api.firecrawl.dev"
        self._firecrawl_poll_timeout_seconds = _env_int(
            "KRAWLX_FIRECRAWL_POLL_TIMEOUT_SECONDS",
            120,
            min_value=15,
            max_value=600,
        )

    def _resolve_firecrawl_api_key(
        self,
        *,
        api_key_overrides: dict[str, Any] | None,
        explicit_api_key: str | None,
    ) -> str:
        direct = str(explicit_api_key or "").strip()
        if direct:
            return direct

        overrides = api_key_overrides if isinstance(api_key_overrides, dict) else {}
        from_overrides = str(overrides.get("FIRECRAWL_API_KEY", "")).strip()
        if from_overrides:
            return from_overrides

        return os.getenv("FIRECRAWL_API_KEY", "").strip()

    def _extract_firecrawl_crawl_id(self, payload: Any) -> str:
        if not isinstance(payload, dict):
            return ""

        direct = str(payload.get("id", "") or payload.get("jobId", "")).strip()
        if direct:
            return direct

        data = payload.get("data")
        if isinstance(data, dict):
            nested = str(data.get("id", "") or data.get("jobId", "")).strip()
            if nested:
                return nested
        return ""

    def _extract_firecrawl_rows(self, payload: Any) -> list[dict[str, Any]]:
        if not isinstance(payload, dict):
            return []

        data = payload.get("data")
        candidates: Any = None
        if isinstance(data, list):
            candidates = data
        elif isinstance(data, dict):
            if isinstance(data.get("data"), list):
                candidates = data.get("data")
            elif isinstance(data.get("pages"), list):
                candidates = data.get("pages")
        elif isinstance(payload.get("pages"), list):
            candidates = payload.get("pages")

        rows: list[dict[str, Any]] = []
        if isinstance(candidates, list):
            for item in candidates:
                if isinstance(item, dict):
                    rows.append(item)
        return rows

    def _firecrawl_row_to_page(self, row: dict[str, Any]) -> dict[str, Any] | None:
        metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}

        url = _normalize_space(
            str(
                metadata.get("sourceURL", "")
                or metadata.get("url", "")
                or row.get("sourceURL", "")
                or row.get("url", "")
            )
        )
        if not url:
            return None

        title = _normalize_space(str(metadata.get("title", "") or row.get("title", "")))

        raw_excerpt = str(
            row.get("markdown", "")
            or row.get("content", "")
            or row.get("extract", "")
            or row.get("text", "")
            or row.get("html", "")
        )
        excerpt = _normalize_space(raw_excerpt)
        if "<" in excerpt and ">" in excerpt:
            excerpt = _strip_html_tags(excerpt)
        if len(excerpt) > self._max_text_chars:
            excerpt = excerpt[: self._max_text_chars].rstrip() + "..."

        raw_depth = metadata.get("depth", row.get("depth", 0))
        try:
            depth = int(raw_depth)
        except (TypeError, ValueError):
            depth = 0

        raw_status = row.get("statusCode", metadata.get("statusCode", 200))
        try:
            status_code = int(raw_status)
        except (TypeError, ValueError):
            status_code = 200

        return {
            "url": url,
            "title": title,
            "status_code": status_code,
            "depth": max(0, depth),
            "text_excerpt": excerpt,
        }

    async def _crawl_with_firecrawl(
        self,
        *,
        seed_url: str,
        api_key: str,
        max_pages: int,
        max_depth: int,
        timeout_seconds: float,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        start_payload = {
            "url": seed_url,
            "limit": max_pages,
            "maxDiscoveryDepth": max_depth,
        }

        base_timeout = max(20.0, min(120.0, timeout_seconds * 3))
        async with build_httpx_async_client(timeout=base_timeout, headers=headers) as client:
            start_response = await client.post(f"{self._firecrawl_base_url}/v1/crawl", json=start_payload)
            if start_response.status_code >= 400:
                detail = _normalize_space(str(getattr(start_response, "text", "")))[:500]
                raise ValueError(
                    (
                        f"Firecrawl crawl start failed: HTTP {start_response.status_code}. {detail}"
                        if detail
                        else f"Firecrawl crawl start failed: HTTP {start_response.status_code}"
                    )
                )

            start_data = start_response.json() if start_response.content else {}
            crawl_id = self._extract_firecrawl_crawl_id(start_data)

            if not crawl_id:
                rows = self._extract_firecrawl_rows(start_data)
                pages: list[dict[str, Any]] = []
                for row in rows:
                    page = self._firecrawl_row_to_page(row)
                    if page is not None:
                        pages.append(page)

                pages = pages[:max_pages]
                return {
                    "seed_url": seed_url,
                    "pages": pages,
                    "blocked": [],
                    "errors": [],
                    "stats": {
                        "provider": "firecrawl",
                        "pages_fetched": len(pages),
                        "visited_urls": len(pages),
                        "blocked_urls": 0,
                        "errors": 0,
                    },
                }

            deadline = time.monotonic() + self._firecrawl_poll_timeout_seconds
            while time.monotonic() < deadline:
                status_response = await client.get(f"{self._firecrawl_base_url}/v1/crawl/{crawl_id}")
                if status_response.status_code >= 400:
                    detail = _normalize_space(str(getattr(status_response, "text", "")))[:500]
                    raise ValueError(
                        (
                            f"Firecrawl status check failed: HTTP {status_response.status_code}. {detail}"
                            if detail
                            else f"Firecrawl status check failed: HTTP {status_response.status_code}"
                        )
                    )

                payload = status_response.json() if status_response.content else {}
                status = _normalize_space(str(payload.get("status", ""))).lower()
                rows = self._extract_firecrawl_rows(payload)

                if status in {"failed", "error", "cancelled"}:
                    raise ValueError(f"Firecrawl crawl ended with status: {status}")

                if status in {"completed", "done", "success"} or (rows and not status):
                    pages: list[dict[str, Any]] = []
                    for row in rows:
                        page = self._firecrawl_row_to_page(row)
                        if page is not None:
                            pages.append(page)

                    pages = pages[:max_pages]
                    return {
                        "seed_url": seed_url,
                        "pages": pages,
                        "blocked": [],
                        "errors": [],
                        "stats": {
                            "provider": "firecrawl",
                            "crawl_id": crawl_id,
                            "pages_fetched": len(pages),
                            "visited_urls": len(pages),
                            "blocked_urls": 0,
                            "errors": 0,
                        },
                    }

                await asyncio.sleep(1.0)

        raise ValueError("Firecrawl crawl polling timed out")

    def _normalize_url(self, raw_url: str) -> str:
        candidate = (raw_url or "").strip()
        if not candidate:
            raise ValueError("url is required")

        if "://" not in candidate:
            candidate = f"https://{candidate}"

        parsed = urlparse(candidate)
        scheme = parsed.scheme.lower()
        if scheme not in _ALLOWED_SCHEMES:
            raise ValueError("Only http and https URLs are supported")

        if self._force_https and scheme != "https":
            raise ValueError("Only HTTPS URLs are allowed by policy")

        if parsed.username or parsed.password:
            raise ValueError("URLs with embedded credentials are not allowed")

        host = _canonical_host(parsed.hostname or "")
        if not host:
            raise ValueError("URL host is required")

        port = parsed.port
        if port is not None and not self._allow_nonstandard_ports:
            if not ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
                raise ValueError("Non-standard ports are blocked by policy")

        netloc_host = host
        if ":" in host and not host.startswith("["):
            netloc_host = f"[{host}]"

        netloc = netloc_host
        if port is not None and not ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
            netloc = f"{netloc}:{port}"

        path = parsed.path or "/"
        return urlunparse((scheme, netloc, path, "", parsed.query, ""))

    def _compile_patterns(self, patterns: list[str] | None) -> list[re.Pattern[str]]:
        compiled: list[re.Pattern[str]] = []
        for pattern in patterns or []:
            value = (pattern or "").strip()
            if not value:
                continue
            try:
                compiled.append(re.compile(value, re.IGNORECASE))
            except re.error as exc:
                raise ValueError(f"Invalid regex pattern '{value}': {exc}") from exc
        return compiled

    def _url_allowed_by_patterns(
        self,
        url: str,
        include_patterns: list[re.Pattern[str]],
        exclude_patterns: list[re.Pattern[str]],
    ) -> bool:
        if include_patterns and not any(pattern.search(url) for pattern in include_patterns):
            return False
        if exclude_patterns and any(pattern.search(url) for pattern in exclude_patterns):
            return False
        return True

    def _host_policy_error(self, host: str) -> str | None:
        if host in self._blocked_hosts:
            return f"Host is blocked by policy: {host}"

        if self._allowed_hosts and not any(_host_matches(host, allowed) for allowed in self._allowed_hosts):
            return f"Host is not in allowlist: {host}"

        if host in {"127.0.0.1", "::1", "0.0.0.0"}:
            return f"Host is blocked by policy: {host}"

        return None

    async def _resolve_host_ips(self, host: str) -> list[str]:
        try:
            ipaddress.ip_address(host)
            return [host]
        except ValueError:
            pass

        def _lookup() -> list[str]:
            entries = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
            ips: list[str] = []
            for _, _, _, _, sockaddr in entries:
                ip = str(sockaddr[0])
                if ip not in ips:
                    ips.append(ip)
            return ips

        return await asyncio.to_thread(_lookup)

    def _is_ip_blocked(self, ip: str) -> bool:
        if self._allow_private_networks:
            return False

        address = ipaddress.ip_address(ip)
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_multicast
            or address.is_reserved
            or address.is_unspecified
        ):
            return True

        return any(address in blocked for blocked in _SSRF_BLOCKED_NETWORKS)

    async def _validate_target_url(self, url: str) -> str | None:
        parsed = urlparse(url)
        host = _canonical_host(parsed.hostname or "")
        if not host:
            return "URL host is required"

        policy_error = self._host_policy_error(host)
        if policy_error:
            return policy_error

        try:
            ips = await self._resolve_host_ips(host)
        except Exception as exc:
            return f"DNS resolution failed for {host}: {exc}"

        if not ips:
            return f"DNS resolution returned no addresses for {host}"

        for ip in ips:
            if self._is_ip_blocked(ip):
                return f"Resolved IP is blocked for SSRF safety: {ip}"

        return None

    async def _apply_host_delay(self, host: str, last_seen: dict[str, float]) -> None:
        if self._host_delay_seconds <= 0:
            return

        now = time.monotonic()
        previous = last_seen.get(host)
        if previous is None:
            last_seen[host] = now
            return

        remaining = self._host_delay_seconds - (now - previous)
        if remaining > 0:
            await asyncio.sleep(remaining)
        last_seen[host] = time.monotonic()

    async def _request_with_redirect_guards(
        self,
        client: httpx.AsyncClient,
        url: str,
        timeout_seconds: float,
        last_seen: dict[str, float],
    ) -> tuple[str, httpx.Response]:
        current_url = url

        for _ in range(self._max_redirects + 1):
            target_error = await self._validate_target_url(current_url)
            if target_error:
                raise ValueError(target_error)

            host = _canonical_host(urlparse(current_url).hostname or "")
            await self._apply_host_delay(host, last_seen)

            response = await client.get(current_url, timeout=timeout_seconds, follow_redirects=False)

            if response.status_code in {301, 302, 303, 307, 308}:
                location = response.headers.get("location", "").strip()
                if not location:
                    return current_url, response
                current_url = self._normalize_url(urljoin(current_url, location))
                continue

            return current_url, response

        raise ValueError("Too many redirects while fetching target URL")

    async def _fetch_html_page(
        self,
        client: httpx.AsyncClient,
        url: str,
        timeout_seconds: float,
        last_seen: dict[str, float],
    ) -> tuple[str, int, str, str]:
        final_url, response = await self._request_with_redirect_guards(
            client,
            url,
            timeout_seconds,
            last_seen,
        )
        response.raise_for_status()

        content_type = response.headers.get("content-type", "").lower()
        if "html" not in content_type:
            raise ValueError(f"Unsupported content type: {content_type or 'unknown'}")

        body = response.content
        if len(body) > self._max_page_bytes:
            raise ValueError(
                f"Page exceeds size limit ({len(body)} bytes > {self._max_page_bytes} bytes)"
            )

        return final_url, response.status_code, content_type, response.text

    async def _is_robots_allowed(
        self,
        client: httpx.AsyncClient,
        url: str,
        robots_cache: dict[str, RobotFileParser],
        last_seen: dict[str, float],
    ) -> bool:
        parsed = urlparse(url)
        base = f"{parsed.scheme}://{parsed.netloc}"
        parser = robots_cache.get(base)

        if parser is None:
            parser = RobotFileParser()
            robots_url = f"{base}/robots.txt"
            try:
                _, response = await self._request_with_redirect_guards(
                    client,
                    robots_url,
                    5.0,
                    last_seen,
                )
                if response.status_code == 200:
                    parser.parse(response.text.splitlines())
                else:
                    parser.parse([])
            except Exception:
                parser.parse([])
            robots_cache[base] = parser

        try:
            return parser.can_fetch(self._user_agent, url)
        except Exception:
            return True

    def _extract_page(self, url: str, html: str, status_code: int, depth: int) -> tuple[dict[str, Any], list[str]]:
        parser = _HTMLContentParser(max_links=self._max_links_per_page)
        parser.feed(html)

        combined_text = _normalize_space(" ".join(parser.text_chunks))
        if len(combined_text) > self._max_text_chars:
            combined_text = combined_text[: self._max_text_chars].rstrip() + "..."

        title = _normalize_space(parser.title)
        page = {
            "url": url,
            "title": title,
            "status_code": status_code,
            "depth": depth,
            "text_excerpt": combined_text,
        }

        links: list[str] = []
        seen: set[str] = set()
        for href in parser.links:
            try:
                candidate = self._normalize_url(urljoin(url, href))
            except ValueError:
                continue
            if candidate in seen:
                continue
            seen.add(candidate)
            links.append(candidate)

        return page, links

    async def execute(
        self,
        url: str,
        max_pages: int = 20,
        max_depth: int = 2,
        same_origin: bool = True,
        obey_robots: bool = True,
        include_patterns: list[str] | None = None,
        exclude_patterns: list[str] | None = None,
        timeout_seconds: float = 10.0,
        **kwargs: Any,
    ) -> ToolResult:
        try:
            seed_url = self._normalize_url(url)

            provider = _normalize_space(str(kwargs.get("provider", self._provider_mode))).lower() or "auto"
            if provider not in {"auto", "native", "firecrawl"}:
                return ToolResult(
                    success=False,
                    output="",
                    error="provider must be one of: auto|native|firecrawl",
                )

            api_key_overrides = kwargs.get("api_key_overrides")
            firecrawl_api_key = self._resolve_firecrawl_api_key(
                api_key_overrides=api_key_overrides if isinstance(api_key_overrides, dict) else None,
                explicit_api_key=str(kwargs.get("firecrawl_api_key", "")),
            )

            effective_max_pages = max(1, min(self._hard_max_pages, int(max_pages or self._default_max_pages)))
            effective_max_depth = max(0, min(10, int(max_depth if max_depth is not None else self._default_max_depth)))
            effective_timeout = float(timeout_seconds or 10.0)
            if effective_timeout <= 0:
                effective_timeout = 10.0

            include_regex = self._compile_patterns(include_patterns)
            exclude_regex = self._compile_patterns(exclude_patterns)

            seed_error = await self._validate_target_url(seed_url)
            if seed_error:
                return ToolResult(success=False, output="", error=seed_error)

            log_audit_event(
                "krawlx_started",
                seed_url=seed_url,
                provider=provider,
                max_pages=effective_max_pages,
                max_depth=effective_max_depth,
                same_origin=bool(same_origin),
                obey_robots=bool(obey_robots),
            )

            if provider == "firecrawl":
                if not firecrawl_api_key:
                    return ToolResult(
                        success=False,
                        output="",
                        error="FIRECRAWL_API_KEY is required when provider=firecrawl",
                    )

                payload = await self._crawl_with_firecrawl(
                    seed_url=seed_url,
                    api_key=firecrawl_api_key,
                    max_pages=effective_max_pages,
                    max_depth=effective_max_depth,
                    timeout_seconds=effective_timeout,
                )

                stats = payload.get("stats") if isinstance(payload.get("stats"), dict) else {}
                pages_fetched = int(stats.get("pages_fetched", 0) or 0)

                log_audit_event(
                    "krawlx_completed",
                    seed_url=seed_url,
                    provider="firecrawl",
                    pages_fetched=pages_fetched,
                    blocked_urls=0,
                    error_count=0,
                    success=pages_fetched > 0,
                )

                return ToolResult(
                    success=pages_fetched > 0,
                    output=json.dumps(payload, indent=2),
                    error=None if pages_fetched > 0 else "Crawl finished with no pages fetched",
                    metadata={
                        "seed_url": seed_url,
                        "provider": "firecrawl",
                        "same_origin": bool(same_origin),
                        "obey_robots": bool(obey_robots),
                    },
                )

            pages: list[dict[str, Any]] = []
            blocked: list[dict[str, str]] = []
            errors: list[dict[str, str]] = []

            frontier: deque[tuple[str, int]] = deque([(seed_url, 0)])
            queued: set[str] = {seed_url}
            visited: set[str] = set()

            seed_host = _canonical_host(urlparse(seed_url).hostname or "")
            robots_cache: dict[str, RobotFileParser] = {}
            last_seen: dict[str, float] = {}

            async with build_httpx_async_client(
                timeout=effective_timeout,
                headers={"User-Agent": self._user_agent},
            ) as client:
                while frontier and len(pages) < effective_max_pages:
                    current_url, depth = frontier.popleft()
                    queued.discard(current_url)

                    if current_url in visited:
                        continue
                    visited.add(current_url)

                    if not self._url_allowed_by_patterns(current_url, include_regex, exclude_regex):
                        blocked.append({"url": current_url, "reason": "URL excluded by pattern rules"})
                        continue

                    if obey_robots and not await self._is_robots_allowed(client, current_url, robots_cache, last_seen):
                        if current_url == seed_url:
                            return ToolResult(
                                success=False,
                                output="",
                                error="Seed URL is blocked by robots.txt policy",
                            )
                        blocked.append({"url": current_url, "reason": "Blocked by robots.txt policy"})
                        continue

                    try:
                        final_url, status_code, _content_type, html = await self._fetch_html_page(
                            client,
                            current_url,
                            effective_timeout,
                            last_seen,
                        )
                    except Exception as exc:
                        errors.append({"url": current_url, "error": _normalize_space(str(exc))[:300]})
                        continue

                    final_host = _canonical_host(urlparse(final_url).hostname or "")
                    if same_origin and final_host != seed_host:
                        blocked.append(
                            {
                                "url": current_url,
                                "reason": "Cross-origin redirect blocked by same_origin policy",
                            }
                        )
                        continue

                    page, discovered_links = self._extract_page(final_url, html, status_code, depth)
                    pages.append(page)

                    if depth >= effective_max_depth:
                        continue

                    for candidate in discovered_links:
                        if candidate in visited or candidate in queued:
                            continue

                        if not self._url_allowed_by_patterns(candidate, include_regex, exclude_regex):
                            continue

                        candidate_host = _canonical_host(urlparse(candidate).hostname or "")
                        if same_origin and candidate_host != seed_host:
                            continue

                        host_error = self._host_policy_error(candidate_host)
                        if host_error:
                            blocked.append({"url": candidate, "reason": host_error})
                            continue

                        frontier.append((candidate, depth + 1))
                        queued.add(candidate)

            payload = {
                "seed_url": seed_url,
                "pages": pages,
                "blocked": blocked,
                "errors": errors,
                "stats": {
                    "provider": "krawlx_native",
                    "pages_fetched": len(pages),
                    "visited_urls": len(visited),
                    "blocked_urls": len(blocked),
                    "errors": len(errors),
                },
            }

            if provider == "auto" and len(pages) == 0 and self._firecrawl_fallback and firecrawl_api_key:
                try:
                    fallback_payload = await self._crawl_with_firecrawl(
                        seed_url=seed_url,
                        api_key=firecrawl_api_key,
                        max_pages=effective_max_pages,
                        max_depth=effective_max_depth,
                        timeout_seconds=effective_timeout,
                    )
                    fallback_stats = fallback_payload.get("stats")
                    if isinstance(fallback_stats, dict):
                        fallback_stats["fallback_used"] = True
                        fallback_stats["provider"] = "firecrawl"

                    fallback_payload["native_attempt"] = {
                        "errors": errors,
                        "blocked": blocked,
                    }
                    payload = fallback_payload
                    fallback_pages = fallback_payload.get("pages")
                    if isinstance(fallback_pages, list):
                        pages = [row for row in fallback_pages if isinstance(row, dict)]
                    else:
                        pages = []

                    fallback_blocked = fallback_payload.get("blocked")
                    if isinstance(fallback_blocked, list):
                        blocked = [
                            {"url": str(row.get("url", "")), "reason": str(row.get("reason", ""))}
                            for row in fallback_blocked
                            if isinstance(row, dict)
                        ]
                    else:
                        blocked = []

                    fallback_errors = fallback_payload.get("errors")
                    if isinstance(fallback_errors, list):
                        errors = [
                            {"url": str(row.get("url", "")), "error": str(row.get("error", ""))}
                            for row in fallback_errors
                            if isinstance(row, dict)
                        ]
                    else:
                        errors = []
                except Exception as exc:
                    payload["firecrawl_fallback_error"] = _normalize_space(str(exc))[:300]

            success = len(pages) > 0
            error: str | None = None
            if not success:
                first_error = ""
                if errors and isinstance(errors[0], dict):
                    first_error = _normalize_space(str(errors[0].get("error", "")))

                error_parts = ["Crawl finished with no pages fetched."]
                if first_error:
                    error_parts.append(f"First error: {first_error}.")

                lowered_first = first_error.lower()
                blocked_by_site = "403" in first_error or "forbidden" in lowered_first or "cloudflare" in lowered_first
                if provider != "firecrawl" and blocked_by_site and not firecrawl_api_key:
                    error_parts.append(
                        "Tip: configure FIRECRAWL_API_KEY and retry with --provider firecrawl for blocked/JS-heavy sites."
                    )

                error = " ".join(error_parts)

            stats = payload.get("stats") if isinstance(payload.get("stats"), dict) else {}
            provider_used = str(stats.get("provider", "krawlx_native") or "krawlx_native")

            log_audit_event(
                "krawlx_completed",
                seed_url=seed_url,
                provider=provider_used,
                pages_fetched=len(pages),
                blocked_urls=len(blocked),
                error_count=len(errors),
                success=success,
            )

            return ToolResult(
                success=success,
                output=json.dumps(payload, indent=2),
                error=error,
                metadata={
                    "seed_url": seed_url,
                    "provider": provider_used,
                    "same_origin": bool(same_origin),
                    "obey_robots": bool(obey_robots),
                },
            )

        except Exception as exc:
            message = _normalize_space(str(exc)) or "KrawlX crawl failed"
            log_audit_event("krawlx_failed", seed_url=(url or "").strip(), error=message)
            return ToolResult(success=False, output="", error=message)
