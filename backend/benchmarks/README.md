# KrawlX Benchmarks

This directory contains benchmarking utilities for measuring KrawlX crawl latency and throughput, with optional Firecrawl comparison.

## Script

- `krawlx_benchmark.py`: Runs repeatable benchmark iterations against a synthetic local site for KrawlX.
- Optional: compares against Firecrawl on a public URL when `--compare-firecrawl` is enabled.

## Usage

Run from the backend directory:

```bash
python benchmarks/krawlx_benchmark.py --iterations 5 --max-pages 30 --max-depth 3
```

Optional Firecrawl comparison (requires `FIRECRAWL_API_KEY`):

```bash
python benchmarks/krawlx_benchmark.py \
  --iterations 3 \
  --max-pages 25 \
  --max-depth 2 \
  --compare-firecrawl \
  --firecrawl-url https://example.com
```

Write results to JSON:

```bash
python benchmarks/krawlx_benchmark.py --output benchmarks/results.json
```

## Notes

- Synthetic KrawlX benchmark uses a local HTTP test site; the script sets:
  - `KRAWLX_ALLOW_PRIVATE_NETWORKS=1`
  - `KRAWLX_FORCE_HTTPS=0`
  - `KRAWLX_ALLOW_NONSTANDARD_PORTS=1`
- The synthetic host defaults to `127.0.0.2` to avoid `127.0.0.1` policy blocks.
  - Override with `KRAWLX_BENCH_SYNTH_HOST` if needed.
- Firecrawl cannot crawl localhost in this setup, so comparison uses `--firecrawl-url`.
- Output includes per-run stats and aggregate summaries (`avg`, `p95`, success rate, throughput).
