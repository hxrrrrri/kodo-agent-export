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

            effective_max_pages = max(1, min(200, int(max_pages or self._default_max_pages)))
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
                max_pages=effective_max_pages,
                max_depth=effective_max_depth,
                same_origin=bool(same_origin),
                obey_robots=bool(obey_robots),
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
                    "pages_fetched": len(pages),
                    "visited_urls": len(visited),
                    "blocked_urls": len(blocked),
                    "errors": len(errors),
                },
            }

            success = len(pages) > 0
            error = None if success else "Crawl finished with no pages fetched"

            log_audit_event(
                "krawlx_completed",
                seed_url=seed_url,
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
                    "same_origin": bool(same_origin),
                    "obey_robots": bool(obey_robots),
                },
            )

        except Exception as exc:
            message = _normalize_space(str(exc)) or "KrawlX crawl failed"
            log_audit_event("krawlx_failed", seed_url=(url or "").strip(), error=message)
            return ToolResult(success=False, output="", error=message)
