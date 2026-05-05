# Design System Inspired by Dropbox

## 1. Visual Theme & Atmosphere

Dropbox is warm productivity for modern work. Warm off-white (#f7f5f2) canvas with Dropbox Blue (#0061ff) as the sole interactive accent. The design is approachable and human without being playful - file and folder metaphors, shared workspace presence indicators, and collaboration-first layouts define the vocabulary.

**Key Characteristics:**
- Warm off-white (#f7f5f2) canvas - not cold white, not parchment
- Dropbox Blue (#0061ff) for all interactive elements
- File/folder card system as primary UI pattern
- Collaboration presence: avatar overlaps, live editing indicators
- Sharp sans-serif (Sharp Grotesk / Inter Bold) for headings
- Border-radius: 8px standard, 12px for featured cards

## 2. Color Palette & Roles

**Brand:** Blue #0061ff | Blue Hover #0044cc | Blue Light #e6eeff
**Surface:** Canvas #f7f5f2 | White #ffffff | Card #ffffff | Sidebar #f0ede8
**Text:** Ink #1e1919 | Body #4a4a4a | Muted #767676 | Disabled #a0a0a0
**Border:** #ddd9d3 (standard) | #c8c4be (emphasized)
**Status:** Shared #0061ff | Private #767676 | Syncing #f0b232 | Error #d91c1c

## 3. Typography

**Headings:** Sharp Grotesk, Inter, -apple-system, sans-serif (weight 700-900)
**Body:** Inter, -apple-system, sans-serif (weight 400)

| Role | Size | Weight |
|------|------|--------|
| Display | 52px | 800 |
| H1 | 36px | 700 |
| H2 | 24px | 700 |
| H3 | 18px | 600 |
| Body | 16px | 400 |
| Caption | 13px | 400 |
| Label | 11px | 700 |

## 4. Component Stylings

**Primary Button:** #0061ff bg, #ffffff text, 8px radius, 10px 24px, 15px/600
Hover: #0044cc

**File/Folder Card:**
- White bg, 1px #ddd9d3 border, 8px radius, 12px 16px padding
- File type icon (32px colored per type) | File name 15px/600 #1e1919
- Modified date + size: 13px #767676 | Shared avatars overlap right
- Hover: 0 2px 8px rgba(0,0,0,0.06)

**Navigation:**
- #f0ede8 sidebar, 220px | White top bar
- Logo left | Nav: folder tree with disclosure | Avatar + settings bottom
- Top bar: breadcrumb + upload/new actions

**Collaboration Presence:**
- 28px circular avatars with colored borders per user
- "Being edited by [Name]" banner at top of document
- Cursor colors per user in document editor

**Sync Status:**
- Green checkmark: synced | Blue circle: syncing | Red X: error
- Status in file card footer right

## 5. Layout
Max-width: 1280px | Sidebar: 220px | Content: fluid file grid
File grid: 4-col desktop, 2-col mobile | Row list view: full-width

## 6. Key Rules
DO: Warm off-white canvas | Blue for all interactive elements | File/folder card patterns
DO NOT: Multiple accent colors | Dark backgrounds | Heavy gradients

## 7. Quick Reference
Canvas: #f7f5f2 | White: #ffffff | Blue: #0061ff | Ink: #1e1919 | Muted: #767676 | Border: #ddd9d3
