# Design System Inspired by Loom

## 1. Visual Theme & Atmosphere

Loom is async video communication made effortless. Purple-forward brand (#625df5) on a dark video-first canvas (#0f0f1a) for the recorder experience, transitioning to clean white for sharing and viewing contexts. Video thumbnails, recording controls, timeline scrubbers, and async comment threads are the primary design vocabulary.

**Key Characteristics:**
- Dark canvas (#0f0f1a) for recording | White (#ffffff) for viewing/sharing
- Loom Purple (#625df5) as primary brand accent
- Video thumbnail grid as primary content surface
- Recording UI: floating webcam bubble, waveform, countdown
- Timeline with reaction markers and comment threads
- Clean card layout for workspace/team views

## 2. Color Palette & Roles

**Brand:** Purple #625df5 | Purple Dark #4d49d1 | Purple Light #eeecfe
**Surface (Dark/Record):** Canvas #0f0f1a | Panel #1a1a2e | Card #252540
**Surface (Light/View):** Canvas #ffffff | Panel #f8f7ff | Card #ffffff
**Text (Dark):** Primary #f0f0f8 | Muted #8080a0
**Text (Light):** Ink #1a1a2e | Body #4a4a6a | Muted #9090b0
**Border:** #2a2a46 (dark) | #e5e3fd (light) | #625df5 (active)

## 3. Typography

**All:** Inter, -apple-system, sans-serif

| Role | Size | Weight |
|------|------|--------|
| Display | 48px | 700 |
| H1 | 32px | 700 |
| H2 | 24px | 600 |
| Card Title | 16px | 600 |
| Body | 15px | 400 |
| Caption | 13px | 400 |
| Timestamp | 12px | 400 |

## 4. Component Stylings

**Primary CTA:** #625df5 bg, #ffffff text, 8px radius, 10px 22px, 15px/600, hover #4d49d1

**Video Thumbnail Card (light):**
- White bg, 1px #e5e3fd border, 8px radius
- 16:9 thumbnail with play button overlay on hover
- Duration badge: rgba(0,0,0,0.7) bg, #ffffff text, 4px radius bottom-right
- Title: 16px/600 #1a1a2e | Creator: avatar + name 14px | Views + date

**Recording Controls:**
- Dark panel floating | Camera circle (webcam) 80px | Waveform bar
- Record button: large red circle 64px | Pause, stop controls

**Timeline Scrubber:**
- Purple progress bar | Comment markers: colored dots on timeline
- Reaction markers: emoji bubbles | Hover: tooltip with timestamp

**Navigation:**
- #ffffff bg, 1px #e5e3fd bottom, 56px height
- Loom logo left | Workspace name | New Recording CTA (purple) right

## 5. Layout
Max-width: 1200px | Video grid: 3-4 col desktop, fluid
Recording overlay: centered floating panel

## 6. Key Rules
DO: Purple for primary CTAs | Dark canvas for recording UI | Video thumbnails with metadata
DO NOT: Multiple accent colors | Heavy dark for main browsing UI (use white for that)

## 7. Quick Reference
Purple: #625df5 | Dark canvas: #0f0f1a | Light canvas: #ffffff
Ink: #1a1a2e | Muted: #9090b0 | Border light: #e5e3fd | Border dark: #2a2a46
