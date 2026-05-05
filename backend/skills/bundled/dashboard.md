---
name: dashboard
description: Admin or analytics dashboard with sidebar nav, top bar, KPI cards, charts, data tables, and status indicators. Dense, scannable, keyboard-friendly. Built for real operational use.
---

# Dashboard

Use this skill to produce admin, analytics, or operational dashboards. Output is a fully composed, data-dense HTML artifact with real interaction patterns.

## Layout Architecture

```
┌─────────────────────────────────────────────────┐
│ TOP BAR: logo, search, notifications, avatar     │
├──────────┬──────────────────────────────────────┤
│          │ PAGE HEADER: title, breadcrumb, CTAs  │
│ SIDEBAR  ├──────────────────────────────────────┤
│ NAV      │ KPI ROW: 4 metric cards               │
│          ├──────────────────────────────────────┤
│ (220px   │ MAIN CONTENT: charts + tables         │
│  fixed)  │                                       │
│          │                                       │
└──────────┴──────────────────────────────────────┘
```

## Sidebar Navigation

- Width: 220px fixed on desktop
- Logo at top, navigation items in groups, settings/profile at bottom
- Active item: accent background pill or left border
- Icon + label for each item
- Collapsible on tablet (icon-only mode at 64px)
- Mobile: slide-in drawer with overlay

Navigation groups example:
```
Overview
Analytics
  ├─ Traffic
  ├─ Conversions
  └─ Revenue
Operations
  ├─ Users
  └─ Orders
Settings
```

## KPI Card System

Each KPI card shows:
- Metric name (label)
- Primary value (large, prominent)
- Change vs. previous period (% with ▲▼ indicator and color)
- Optional sparkline (7-day trend)

Example:
```
Monthly Revenue
$124,563
▲ 12.4%  vs last month
[sparkline]
```

Use semantic colors for change indicators:
- Positive: `--color-green`
- Negative: `--color-red`
- Neutral: `--color-muted`

## Chart Library

Use **Chart.js** loaded from CDN for all charts. Always use real-looking data (not flat lines, not perfectly random):

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

Chart types by use case:
- Time series / trends: Line chart
- Category comparison: Bar chart
- Proportion/distribution: Donut or pie (max 5 segments)
- Funnel: Horizontal bar, sorted descending
- Geographic: SVG map (simplified)

Data realism: charts should show realistic variance, seasonality, and trends — not straight lines or obviously random noise.

## Data Tables

For lists of records:
- Sortable columns (click header → toggle asc/desc)
- Row hover highlight
- Checkbox selection for bulk actions
- Pagination or load-more
- Status badges (colored pills: Active, Pending, Inactive)
- Action column: Edit / View / Delete buttons
- Empty state: illustration + CTA

## Top Bar

```
[hamburger menu] [logo] [search input — 280px] ··· [notification bell] [avatar]
```

- Search: real-looking with keyboard shortcut hint (`⌘K` or `Ctrl+K`)
- Notification: badge with count
- Avatar: dropdown with profile, settings, sign out

## Information Density

This is an operational tool, not a marketing page:
- Compact vertical spacing (4–8px between related elements)
- Label + value pairs stacked, not spread across screen
- Status indicators inline, not as separate rows
- Use color sparingly — only for semantic status

## Quality Gates

1. Sidebar + content visible side-by-side at 1280px
2. All chart canvases render (no blank boxes)
3. Data tables have at least 5 rows of realistic data
4. Mobile: sidebar collapses, content stacks properly
5. KPI cards show numeric values (no "N/A" or empty)
