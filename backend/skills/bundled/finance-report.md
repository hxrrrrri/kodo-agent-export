---
name: finance-report
description: Quarterly or monthly financial report with executive summary, KPI scorecard, revenue/cost breakdowns, department charts, key insights, and outlook. Designed for internal distribution.
---

# Finance Report

Use this skill to produce quarterly (QBR), monthly (MBR), or annual financial report artifacts. Output is a structured, data-dense HTML document formatted for business presentation and print.

## Document Architecture

1. **Cover page** — Company/department name, period, prepared by, date
2. **Executive summary** — 3–5 bullet highlights, RAG status indicator
3. **KPI scorecard** — Top 6–8 metrics with vs-target and vs-prior-period
4. **Revenue section** — Total revenue, breakdown by segment/product/region
5. **Cost & margin section** — COGS, OpEx breakdown, gross/net margin
6. **Department/team summaries** — Per-team performance vs. budget
7. **Key wins & risks** — Narrative section with specific items
8. **Outlook** — Forward guidance, key assumptions, watchpoints
9. **Appendix** — Detailed tables if needed

## KPI Scorecard Layout

For each metric:

```
┌─────────────────────────────────────────┐
│ Metric Name           [RAG indicator]   │
│ $124,563              ▲ 12.4% vs plan   │
│ Target: $110,000      ▲ 8.2% vs prior   │
└─────────────────────────────────────────┘
```

RAG (Red/Amber/Green) indicators:
- Green: ≥100% of target
- Amber: 85–99% of target
- Red: <85% of target

## Chart Standards

Use Chart.js from CDN. All charts must have:
- Clear title
- Labeled axes with units
- Legend if multiple series
- Realistic, internally consistent data (if illustrative)

Chart types by section:
- Revenue trend: Line chart (12 months)
- Revenue breakdown: Stacked bar chart
- Cost breakdown: Donut chart
- Department performance: Horizontal bar chart vs. budget

## Financial Number Formatting

- Millions: $1.2M, not $1,200,000
- Thousands: $124K, not $124,000
- Percentages: 12.4%, one decimal place
- Currency: Use the appropriate symbol, consistent throughout
- YoY / QoQ growth: always show direction (▲/▼) and color

## Narrative Section Rules

For "Key Wins & Risks":
- Wins: specific, attributable, quantified where possible
  - "Product team launched X feature, contributing +$45K ARR from 3 new enterprise deals"
- Risks: specific with owner and mitigation
  - "EMEA pipeline 32% below target; sales director reviewing pipeline quality with managers"
- No vague statements: "We had a good quarter" is not acceptable

## Table Formatting

Financial tables:
- Right-align all numbers
- Left-align labels
- Bold totals row
- Alternating row shading (`#f9fafb` on even rows)
- Use `font-variant-numeric: tabular-nums` for aligned columns
- Currency and % columns consistent width

## Report Color Scheme

Match active design system, but always include these semantic overrides:
- `--color-green: #16a34a` (on-target, positive)
- `--color-amber: #d97706` (at-risk, caution)
- `--color-red: #dc2626` (below target, negative)
- `--color-neutral: #6b7280` (no change, informational)

## Quality Gates

1. All charts render with real-looking data (no blank/flat)
2. KPI cards show both vs-plan and vs-prior values
3. Numbers consistent across summary and detail sections
4. No lorem ipsum — use realistic business placeholders
5. Print-friendly: no fixed positioning, page-break-aware sections
