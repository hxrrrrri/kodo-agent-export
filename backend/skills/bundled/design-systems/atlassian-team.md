# Design System Inspired by Atlassian

## 1. Visual Theme & Atmosphere

Atlassian design is enterprise collaboration made approachable. Clean white (#f7f8f9) canvas, confident Atlassian Blue (#0c66e4), and the density of Jira, Confluence, and Trello. The system balances team-oriented warmth with enterprise rigor. Sprint boards, issue trackers, and status timelines are the signature components.

**Key Characteristics:**
- Clean white (#f7f8f9) canvas - bright, accessible enterprise
- Atlassian Blue (#0c66e4) for primary actions and active states
- Dense data components: sprint boards, issue tables, timelines
- Atlassian UI Kit / Inter font system
- Status badge system: To Do, In Progress, Done, Blocked
- 8px border-radius standard throughout

## 2. Color Palette & Roles

**Brand:** Blue #0c66e4 | Blue Dark #0055cc | Blue Light #e9f0fd
**Surface:** Canvas #f7f8f9 | White #ffffff | Card #ffffff | Sidebar #1d2125
**Text:** Ink #172b4d | Body #44546f | Muted #626f86 | Subtle #7a8699
**Border:** #dfe1e6 (standard) | #b3bac5 (emphasized)
**Status:**
- To Do: #dfe1e6/#44546f | In Progress: #cce0ff/#0c66e4
- Done: #dcf5d7/#1e7e34 | Blocked: #ffe2d5/#b65c02

## 3. Typography

**All:** Atlassian UI Kit Sans fallback: Inter, -apple-system, sans-serif

| Role | Size | Weight |
|------|------|--------|
| H1 | 28px | 600 |
| H2 | 22px | 600 |
| H3 | 18px | 600 |
| Body Large | 16px | 400 |
| Body | 14px | 400 |
| Caption | 12px | 400 |
| Label | 11px | 700 uppercase |

## 4. Component Stylings

**Primary Button:** #0c66e4 bg, #ffffff text, 6px radius, 8px 16px padding, 14px/500
Hover: #0055cc

**Secondary Button:** #f1f2f4 bg, #172b4d text, same geometry
**Danger Button:** #ca3521 bg, #ffffff text

**Issue Card (Jira style):**
- White bg, 1px #dfe1e6 border, 8px radius, 12px 16px padding
- Issue type icon (Story/Bug/Task) + Issue key (14px blue monospace) + Priority icon
- Title: 14px/500 #172b4d | Assignee avatar (24px) | Status badge

**Sprint Board Columns:**
- Column header: status badge + count | Cards draggable
- To Do column: #f7f8f9 bg | In Progress: #e9f0fd bg | Done: #dffce2 bg

**Navigation (Jira-style):**
- Left sidebar: #1d2125 dark, icons + labels
- Top bar: white, project name, search, notifications, avatar
- Active nav item: #e9f0fd bg, #0c66e4 text

**Status Badge:**
- Rounded pill | Color per status | 11px/700 uppercase
- To Do: #dfe1e6 bg, #44546f text | In Progress: #cce0ff, #0c66e4

## 5. Layout
Spacing base 8px: 4 8 12 16 20 24 32 40 48
Max-width: 1280px | Sidebar: 240px | Board layout: fluid columns with gutters

## 6. Key Rules
DO: Status badge system consistently | Dense issue/task layouts | Blue for primary actions
DO NOT: Rounded more than 8px on most elements | Dark backgrounds for main content

## 7. Quick Reference
Canvas: #f7f8f9 | White: #ffffff | Blue: #0c66e4 | Ink: #172b4d | Muted: #626f86 | Border: #dfe1e6
Sidebar dark: #1d2125
