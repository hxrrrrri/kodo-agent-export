# Design System Inspired by Datadog

## 1. Visual Theme & Atmosphere

Datadog is operator-grade observability. White primary canvas (#ffffff) with Datadog Purple (#7b44eb) as brand energy. The design is built for monitoring engineers who read dashboards all day: information density, time-series graphs, APM traces, log tails, and infrastructure maps. Technical authority through information architecture, not decoration.

**Key Characteristics:**
- White (#ffffff) canvas - bright for dashboard readability
- Datadog Purple (#7b44eb) brand on CTAs and active states
- Dense data: timeseries graphs, heatmaps, log streams, service maps
- Inter at compact sizes (13-14px) for maximum screen density
- Metric cards with sparklines as primary content unit
- Multi-color chart palette for multiple series

## 2. Color Palette & Roles

**Brand:** Purple #7b44eb | Purple Light #f0ebff | Purple Dark #5a2fc7
**Surface:** Canvas #ffffff | Panel #f8f9fb | Card #ffffff | Dark Canvas #16161e
**Text:** Ink #2b2b35 | Body #4a4a5a | Muted #8a8a9a | Light #f8f9fb
**Border:** #e2e4ea (standard) | #c9cdd8 (emphasized)
**Chart Series:** Purple #7b44eb | Blue #1d76db | Green #00a851 | Orange #e07c00 | Red #dc3131 | Teal #00baa4

## 3. Typography

**All:** Inter, -apple-system, sans-serif

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| H1 | 24px | 700 | Dashboard title |
| H2 | 18px | 600 | Widget title |
| H3 | 14px | 600 | Section sub-head |
| Body | 14px | 400 | Default |
| Dense | 13px | 400 | Compact logs, trace |
| Metric | 28px | 700 | KPI values |
| Label | 11px | 600 | Uppercase axis labels |

## 4. Component Stylings

**Primary Button:** #7b44eb bg, #ffffff text, 6px radius, 8px 20px, 14px/600
Hover: #5a2fc7

**Metric Widget:**
- White bg, 1px #e2e4ea border, 8px radius
- Metric title: 13px/600 #4a4a5a | Value: 28px/700 #2b2b35
- Change %: green or red with arrow | Sparkline: purple line
- Timeframe selector tabs at top

**Log Stream:**
- Dark (#16161e) or white bg | Monospace 13px
- Log level badges: ERROR red, WARN yellow, INFO blue, DEBUG gray
- Timestamp: tabular-nums 13px | Service tag: colored pill

**APM Service Map:**
- Dark canvas (#16161e) | Service nodes: rounded rectangles
- Connections: directed arrows with latency labels
- Healthy: green border | Degraded: yellow | Error: red

**Navigation:**
- #16161e dark sidebar, 220px | Purple logo mark
- Nav items 14px/500, active: #f0ebff bg, #7b44eb text
- Top bar: white, breadcrumb, timeframe picker, alert icon

## 5. Layout
Dashboard grid: flexible tile system | Widget padding: 16px
Sidebar: 220px dark | Content: fluid with 8px widget gap

## 6. Key Rules
DO: Dense data layouts | Multi-series chart colors | Log level severity colors
DO NOT: Large whitespace for dashboard content | Warm colors | Decorative elements

## 7. Quick Reference
Canvas: #ffffff | Panel: #f8f9fb | Dark: #16161e | Purple: #7b44eb | Ink: #2b2b35 | Border: #e2e4ea
Chart: Purple #7b44eb | Blue #1d76db | Green #00a851 | Orange #e07c00 | Red #dc3131
