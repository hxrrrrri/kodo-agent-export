# Design System Inspired by Microsoft Fluent 2

## 1. Visual Theme & Atmosphere

Microsoft Fluent 2 is the enterprise productivity design system. Off-white (#f5f5f5) canvas with Fluent Blue (#0078d4) anchoring interactive elements. The design prioritizes density, accessibility, and keyboard navigation - built for people who use software for 8 hours a day. Command bars, panes, ribbons, and dense tables are the signature components.

**Key Characteristics:**
- Off-white (#f5f5f5) canvas - neutral, accessible, not distracting
- Fluent Blue (#0078d4) for interactive elements and branding
- Dense productivity layouts: command bars, panes, ribbons, tables
- Segoe UI Variable as the primary font
- Generous focus states - keyboard navigation is first-class
- Rounded corners: 4px default, 8px for cards, 999px for pills

## 2. Color Palette & Roles

**Brand:** Blue #0078d4 | Blue Light #eff6fc | Blue Dark #004578
**Surface:** Background #f5f5f5 | Canvas #ffffff | Card #ffffff | Command Bar #f9f9f9
**Text:** Ink #242424 | Body #424242 | Disabled #a19f9d | Placeholder #767676
**Border:** #d2d0ce (standard) | #c8c6c4 (emphasized) | #0078d4 (active)
**Status:** Success #107c10 | Warning #ffaa44 | Error #c50f1f | Info #0078d4

## 3. Typography

**All:** Segoe UI Variable, Segoe UI, -apple-system, sans-serif

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Display | 68px | 600 | Marketing only |
| Title 1 | 40px | 600 | Page titles |
| Title 2 | 28px | 600 | Section heads |
| Subtitle | 20px | 600 | Sub-sections |
| Body 1 | 14px | 400 | Default body |
| Body 2 | 12px | 400 | Secondary |
| Caption | 12px | 400 | Metadata |
| Button | 14px | 600 | CTAs |

## 4. Component Stylings

**Primary Button:** #0078d4 bg, #ffffff text, 4px radius, 8px 20px, 14px/600
Hover: #106ebe | Pressed: #005a9e

**Secondary Button:** #f3f2f1 bg, #323130 text, 1px #8a8886 border, same geometry

**Command Bar:**
- #f9f9f9 bg | 1px #edebe9 bottom | 40px height
- Icon buttons 32px | Separator: 1px #c8c6c4 | Font: 14px/400

**Data Table:**
- Header: #f3f2f1 bg, 12px/600 #605e5c uppercase
- Row: 40px height, 1px #edebe9 bottom, hover #f3f2f1 bg
- Selected: #deecf9 bg, 2px #0078d4 left border

**Navigation Pane:**
- 240px wide | #f9f9f9 bg | 1px #edebe9 right
- Items: 32px height, 12px horizontal, icon (16px) + label (14px)
- Active: #deecf9 bg, #005a9e text, #0078d4 icon

**Input:**
- #ffffff bg, 1px #c8c6c4 border (bottom-only in many contexts), 2px radius
- Height: 32px | 14px text | Focus: 2px #0078d4 bottom border

## 5. Layout
Spacing base 4px: 4 8 12 16 20 24 32 40 48
Max-width: 1440px | Sidebar: 240px | Command bar: full-width across top of content area

## 6. Key Rules
DO: Dense data tables | Command bars for actions | Visible keyboard focus states
DO NOT: Over-round corners | Dark backgrounds for primary content | Minimal density

## 7. Quick Reference
Canvas: #f5f5f5 | White: #ffffff | Blue: #0078d4 | Ink: #242424 | Muted: #605e5c | Border: #d2d0ce
