# Design System Inspired by PagerDuty

## 1. Visual Theme & Atmosphere

PagerDuty is incident response under pressure. The design communicates urgency, clarity, and control. Dark canvas (#1b1b2e) with critical red (#d94848) as the alert signal. Every element is optimized for 3am incident response: high contrast, clear status hierarchy, real-time updates. On-call schedules, alert timelines, and escalation flows are the primary UI vocabulary.

**Key Characteristics:**
- Dark canvas (#1b1b2e) - works in all lighting conditions
- Critical red (#d94848) for active alerts and incidents
- High-contrast text hierarchy - no muted colors for critical information
- Real-time status indicators: pulse animations on active alerts
- Alert severity: Critical (red) > High (orange) > Warning (yellow) > Info (blue)
- Inter font with tabular-nums for durations and timestamps

## 2. Color Palette & Roles

**Surface:** Canvas #1b1b2e | Panel #252538 | Card #2e2e46 | Elevated #383852
**Border:** #3e3e5a (standard) | #5e5e7a (hover)
**Text:** Primary #f0f0f8 | Secondary #a8a8c4 | Muted #6a6a8a
**Severity:**
- Critical: #d94848 | Critical bg: rgba(217,72,72,0.15)
- High: #f48c06 | High bg: rgba(244,140,6,0.15)
- Warning: #f5c518 | Warning bg: rgba(245,197,24,0.1)
- Info: #4b9eff | Info bg: rgba(75,158,255,0.15)
- Resolved: #3fb950 | Resolved bg: rgba(63,185,80,0.1)

## 3. Typography

**All:** Inter, -apple-system, sans-serif (font-variant-numeric: tabular-nums for time/duration)

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| H1 | 28px | 700 | Dashboard title |
| H2 | 22px | 600 | Section heads |
| Alert Title | 16px | 600 | Incident name |
| Body | 14px | 400 | Default text |
| Timestamp | 13px | 400 | Monospace-like, tabular |
| Duration | 20px | 700 | MTTD/MTTR metrics |
| Status | 12px | 700 | Uppercase severity label |

## 4. Component Stylings

**Alert Badge (Critical):**
- #d94848 bg, #ffffff text, 4px radius, 4px 8px, 12px/700 uppercase
- Active: pulse animation with rgba(217,72,72,0.3) ring

**Incident Card:**
- #2e2e46 bg, left 3px solid severity-color, 8px radius, 16px padding
- Severity badge + incident title (16px/600 #f0f0f8)
- Service name + affected environment + triggered time
- Assignee avatar + ACK/Resolve action buttons

**On-Call Schedule:**
- Timeline grid: horizontal time axis + vertical responder rows
- Active window: severity-color fill at 40% opacity
- Handoff time markers: vertical rule

**Alert Timeline:**
- Vertical chronological list | Icon per event type
- Triggered: red dot | Acknowledged: orange | Resolved: green
- Time relative (5m ago) + absolute (14:32 UTC)

**Navigation:**
- #252538 sidebar, 220px wide | Logo + main nav
- Active: rgba(75,158,255,0.15) bg, #4b9eff text
- Alert count badge: #d94848 pill on incidents icon

## 5. Layout
Max-width: 1280px | Sidebar: 220px | Content: fluid
Dashboard: 4 KPI cards + alert list + schedule grid

## 6. Key Rules
DO: Severity color system consistently | Real-time status indicators | High contrast throughout
DO NOT: Muted colors for critical alerts | Light backgrounds | Complex decorative elements

## 7. Quick Reference
Canvas: #1b1b2e | Panel: #252538 | Card: #2e2e46 | Border: #3e3e5a
Primary: #f0f0f8 | Muted: #6a6a8a
Critical: #d94848 | High: #f48c06 | Warning: #f5c518 | Info: #4b9eff | Resolved: #3fb950
