from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import time
from dataclasses import asdict, dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from typing import Any
from urllib.parse import urlparse

from privacy import build_httpx_async_client
from tools.krawlx import KrawlXTool


@dataclass
class RunStat:
    latency_seconds: float
    pages_fetched: int
    success: bool
    error: str | None = None


def _percentile(values: list[float], ratio: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int(round((len(ordered) - 1) * ratio))))
    return ordered[index]


def _summarize(stats: list[RunStat]) -> dict[str, Any]:
    success_runs = [item for item in stats if item.success]
    latencies = [item.latency_seconds for item in success_runs]
    pages = [item.pages_fetched for item in success_runs]

    total_latency = sum(latencies)
    total_pages = sum(pages)

    return {
        "iterations": len(stats),
        "successful_runs": len(success_runs),
        "success_rate": (len(success_runs) / len(stats)) if stats else 0.0,
        "avg_latency_seconds": (statistics.mean(latencies) if latencies else 0.0),
        "p95_latency_seconds": _percentile(latencies, 0.95),
        "avg_pages_fetched": (statistics.mean(pages) if pages else 0.0),
        "throughput_pages_per_second": (total_pages / total_latency) if total_latency > 0 else 0.0,
    }


def _build_synthetic_routes(page_count: int, branching: int) -> dict[str, str]:
    routes: dict[str, str] = {}
    safe_page_count = max(1, page_count)
    safe_branching = max(1, branching)

    for index in range(safe_page_count):
        path = "/" if index == 0 else f"/page/{index}"
        links: list[str] = []

        for offset in range(1, safe_branching + 1):
            child = index * safe_branching + offset
            if child >= safe_page_count:
                break
            child_path = "/" if child == 0 else f"/page/{child}"
            links.append(f"<a href='{child_path}'>Page {child}</a>")

        routes[path] = (
            "<html><head><title>"
            f"Synthetic Page {index}"
            "</title></head><body>"
            f"<h1>Page {index}</h1>"
            + " ".join(links)
            + "</body></html>"
        )

    return routes


def _start_synthetic_server(routes: dict[str, str]) -> tuple[ThreadingHTTPServer, Thread, str]:
    class _SyntheticHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            path = urlparse(self.path).path or "/"
            payload = routes.get(path)
            if payload is None:
                self.send_response(404)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                self.wfile.write(b"not-found")
                return

            body = payload.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:  # noqa: A003
            return

    bind_host = os.getenv("KRAWLX_BENCH_SYNTH_HOST", "127.0.0.2").strip() or "127.0.0.2"
    server = ThreadingHTTPServer((bind_host, 0), _SyntheticHandler)
    worker = Thread(target=server.serve_forever, daemon=True)
    worker.start()

    host_value, port = server.server_address
    if isinstance(host_value, bytes):
        host_text = host_value.decode("utf-8", errors="replace")
    else:
        host_text = str(host_value)
    base_url = f"http://{host_text}:{port}/"
    return server, worker, base_url


async def _run_krawlx_once(seed_url: str, max_pages: int, max_depth: int) -> RunStat:
    tool = KrawlXTool()

    started = time.perf_counter()
    result = await tool.execute(
        url=seed_url,
        max_pages=max_pages,
        max_depth=max_depth,
        same_origin=True,
        obey_robots=False,
        timeout_seconds=10.0,
    )
    elapsed = time.perf_counter() - started

    if not result.success:
        return RunStat(latency_seconds=elapsed, pages_fetched=0, success=False, error=result.error)

    try:
        payload = json.loads(result.output)
        pages_fetched = int(((payload.get("stats") or {}).get("pages_fetched", 0)) if isinstance(payload, dict) else 0)
    except Exception:
        pages_fetched = 0

    return RunStat(latency_seconds=elapsed, pages_fetched=pages_fetched, success=True, error=None)


async def benchmark_krawlx(seed_url: str, iterations: int, max_pages: int, max_depth: int) -> list[RunStat]:
    stats: list[RunStat] = []
    for _ in range(max(1, iterations)):
        stats.append(await _run_krawlx_once(seed_url, max_pages, max_depth))
    return stats


async def _run_firecrawl_once(
    *,
    api_key: str,
    seed_url: str,
    max_pages: int,
    max_depth: int,
    poll_timeout_seconds: int = 120,
) -> RunStat:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    start_payload = {
        "url": seed_url,
        "limit": max_pages,
        "maxDiscoveryDepth": max_depth,
    }

    started = time.perf_counter()

    async with build_httpx_async_client(timeout=30.0, headers=headers) as client:
        response = await client.post("https://api.firecrawl.dev/v1/crawl", json=start_payload)
        if response.status_code >= 400:
            return RunStat(
                latency_seconds=time.perf_counter() - started,
                pages_fetched=0,
                success=False,
                error=f"crawl start failed: HTTP {response.status_code}",
            )

        payload = response.json() if response.content else {}
        crawl_id = (
            (payload.get("id") if isinstance(payload, dict) else None)
            or ((payload.get("data") or {}).get("id") if isinstance(payload, dict) and isinstance(payload.get("data"), dict) else None)
            or (payload.get("jobId") if isinstance(payload, dict) else None)
        )

        if not crawl_id:
            return RunStat(
                latency_seconds=time.perf_counter() - started,
                pages_fetched=0,
                success=False,
                error="crawl start did not return an id",
            )

        deadline = time.monotonic() + max(10, poll_timeout_seconds)
        pages_fetched = 0

        while time.monotonic() < deadline:
            status_response = await client.get(f"https://api.firecrawl.dev/v1/crawl/{crawl_id}")
            status_payload = status_response.json() if status_response.content else {}
            status = str((status_payload.get("status") if isinstance(status_payload, dict) else "") or "").lower()

            data_field = status_payload.get("data") if isinstance(status_payload, dict) else None
            if isinstance(data_field, list):
                pages_fetched = len(data_field)
            else:
                stats_field = status_payload.get("stats") if isinstance(status_payload, dict) else None
                if isinstance(stats_field, dict):
                    pages_fetched = int(stats_field.get("total", pages_fetched) or pages_fetched)

            if status in {"completed", "done", "success"}:
                return RunStat(
                    latency_seconds=time.perf_counter() - started,
                    pages_fetched=pages_fetched,
                    success=True,
                    error=None,
                )

            if status in {"failed", "error", "cancelled"}:
                return RunStat(
                    latency_seconds=time.perf_counter() - started,
                    pages_fetched=pages_fetched,
                    success=False,
                    error=f"crawl ended with status: {status}",
                )

            await asyncio.sleep(1.0)

    return RunStat(
        latency_seconds=time.perf_counter() - started,
        pages_fetched=pages_fetched,
        success=False,
        error="crawl polling timed out",
    )


async def benchmark_firecrawl(
    *,
    api_key: str,
    seed_url: str,
    iterations: int,
    max_pages: int,
    max_depth: int,
) -> list[RunStat]:
    stats: list[RunStat] = []
    for _ in range(max(1, iterations)):
        stats.append(
            await _run_firecrawl_once(
                api_key=api_key,
                seed_url=seed_url,
                max_pages=max_pages,
                max_depth=max_depth,
            )
        )
    return stats


async def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark KrawlX throughput and latency.")
    parser.add_argument("--iterations", type=int, default=5, help="Number of benchmark runs per target.")
    parser.add_argument("--max-pages", type=int, default=30, help="Max pages for each crawl run.")
    parser.add_argument("--max-depth", type=int, default=3, help="Max crawl depth for each run.")
    parser.add_argument("--synthetic-pages", type=int, default=60, help="Synthetic site page count.")
    parser.add_argument("--synthetic-branching", type=int, default=3, help="Synthetic site branching factor.")
    parser.add_argument("--compare-firecrawl", action="store_true", help="Also run Firecrawl benchmark if API key is available.")
    parser.add_argument(
        "--firecrawl-url",
        type=str,
        default="https://example.com",
        help="Public URL for optional Firecrawl comparison.",
    )
    parser.add_argument("--output", type=str, default="", help="Optional path to write JSON results.")
    args = parser.parse_args()

    # Local synthetic benchmarking requires local/private access and HTTP.
    os.environ.setdefault("KRAWLX_ALLOW_PRIVATE_NETWORKS", "1")
    os.environ.setdefault("KRAWLX_FORCE_HTTPS", "0")
    os.environ.setdefault("KRAWLX_ALLOW_NONSTANDARD_PORTS", "1")

    routes = _build_synthetic_routes(args.synthetic_pages, args.synthetic_branching)
    server, thread, synthetic_seed = _start_synthetic_server(routes)

    results: dict[str, Any] = {
        "timestamp": time.time(),
        "config": {
            "iterations": args.iterations,
            "max_pages": args.max_pages,
            "max_depth": args.max_depth,
            "synthetic_pages": args.synthetic_pages,
            "synthetic_branching": args.synthetic_branching,
        },
        "krawlx": {},
        "firecrawl": None,
    }

    try:
        krawlx_stats = await benchmark_krawlx(
            seed_url=synthetic_seed,
            iterations=args.iterations,
            max_pages=args.max_pages,
            max_depth=args.max_depth,
        )
        results["krawlx"] = {
            "target": synthetic_seed,
            "summary": _summarize(krawlx_stats),
            "runs": [asdict(item) for item in krawlx_stats],
        }
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2.0)

    if args.compare_firecrawl:
        firecrawl_key = os.getenv("FIRECRAWL_API_KEY", "").strip()
        if firecrawl_key:
            firecrawl_stats = await benchmark_firecrawl(
                api_key=firecrawl_key,
                seed_url=args.firecrawl_url,
                iterations=args.iterations,
                max_pages=args.max_pages,
                max_depth=args.max_depth,
            )
            results["firecrawl"] = {
                "target": args.firecrawl_url,
                "summary": _summarize(firecrawl_stats),
                "runs": [asdict(item) for item in firecrawl_stats],
            }
        else:
            results["firecrawl"] = {
                "skipped": True,
                "reason": "FIRECRAWL_API_KEY is not set",
            }

    print(json.dumps(results, indent=2))

    output_path = (args.output or "").strip()
    if output_path:
        with open(output_path, "w", encoding="utf-8") as file:
            file.write(json.dumps(results, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
