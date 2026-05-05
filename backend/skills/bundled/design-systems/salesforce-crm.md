# Design System Inspired by Salesforce Lightning

## 1. Visual Theme & Atmosphere

Salesforce Lightning Design System (SLDS) is enterprise CRM refined for daily operator use. White canvas with Salesforce Blue (#0176d3) guiding interactive elements. The design is built around record layouts: Account cards, Contact tiles, Opportunity pipelines, Activity timelines. Dense, accessible, and navigable by keyboard.

**Key Characteristics:**
- White (#ffffff) canvas with #f3f3f3 secondary surface
- Salesforce Blue (#0176d3) for primary interactive elements
- CRM record patterns: field groups, activity timelines, pipeline stages
- SLDS grid system: 12-column with 1rem gutters
- Salesforce Sans / Inter font system
- Status badges: Won (green) / Lost (red) / In Progress (blue)

## 2. Color Palette & Roles

**Brand:** Blue #0176d3 | Brand Dark #014486 | Brand Light #eef4ff
**Surface:** Canvas #ffffff | Secondary #f3f3f3 | Card #ffffff | Sidebar #f3f3f3
**Text:** Ink #181818 | Body #444 | Muted #706e6b | Placeholder #9d9d9d
**Border:** #dddbda (standard) | #c9c7c5 (emphasized) | #0176d3 (active)
**Status:** Success #2e844a | Warning #fe9339 | Error #ea001e | Info #0176d3

## 3. Typography

**All:** Salesforce Sans, Inter, -apple-system, sans-serif

| Role | Size | Weight |
|------|------|--------|
| H1 | 28px | 700 |
| H2 | 22px | 700 |
| H3 | 18px | 600 |
| Body Large | 16px | 400 |
| Body | 14px | 400 |
| Caption | 12px | 400 |
| Label | 12px | 700 uppercase |
| Button | 14px | 700 |

## 4. Component Stylings

**Primary Button:** #0176d3 bg, #ffffff text, 4px radius, 8px 16px, 14px/700
Hover: #014486

**Record Detail Card:**
- White bg, 1px #dddbda border, 4px radius, 16px padding
- Header: record icon + record name 18px/600 + record type badge
- Fields in 2-col grid: label (12px/700 uppercase #706e6b) + value (14px #181818)
- Actions bar: activity, chatter, related lists tabs

**Opportunity Pipeline:**
- Horizontal stage flow: stages as connected pills
- Current stage: #0176d3 fill | Won: #2e844a | Lost: #ea001e | Future: #f3f3f3
- Probability % below each stage | Close date + amount prominent

**Activity Timeline:**
- Vertical line with event dots | Icon per activity type
- Date on left | Event title + description right
- Hover: light blue bg

**Navigation (App Launcher):**
- #ffffff top bar, #0176d3 brand stripe | App launcher grid + tabs
- Left sidebar: object tabs (Accounts, Contacts, Opportunities)

## 5. Layout
SLDS grid: 12-col, 1rem gutter | Max-width: 1280px
Record layout: 8-col main + 4-col sidebar
Activity section: full-width below record details

## 6. Key Rules
DO: CRM record field layouts | Activity timeline | Pipeline stage visualization | Status badges
DO NOT: Dark backgrounds | Heavy gradients | Very rounded corners (4px max)

## 7. Quick Reference
Canvas: #ffffff | Blue: #0176d3 | Ink: #181818 | Muted: #706e6b | Border: #dddbda
Success: #2e844a | Error: #ea001e | Warning: #fe9339
