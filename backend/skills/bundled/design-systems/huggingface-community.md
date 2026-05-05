# Design System Inspired by Hugging Face

## 1. Visual Theme & Atmosphere

Hugging Face is a developer platform with community warmth. Warm yellow (#ffcc4d) is its primary identity - same as the emoji mascot. White canvas, dense card-grid layouts for models, datasets, and spaces.

**Key Characteristics:**
- Warm yellow (#ffcc4d) brand identity - logo and small elements only
- White canvas (#ffffff), warm #fff8e7 for featured sections
- Developer-community density: model cards, dataset grids, tag taxonomies
- Inter throughout - no display/body split
- 8px border-radius standard
- 4-up card grids for catalog browsing

## 2. Color Palette & Roles

**Brand:** HF Yellow #ffcc4d (logo, active tabs) | HF Orange #ff6b35 (trending)
**Surface:** Canvas #ffffff | Off-White #fff8e7 | Light Gray #f5f5f5 | Border #e5e7eb
**Text:** Ink #111827 | Body #374151 | Muted #6b7280 | Link #3b82f6

**Tag Taxonomy:**
- Text Generation: #dbeafe/#1d4ed8 (blue pill)
- Image: #f3e8ff/#7c3aed (purple pill)
- Audio: #d1fae5/#059669 (green pill)
- Multimodal: #fee2e2/#dc2626 (red pill)

## 3. Typography Rules

**All:** Inter, -apple-system, sans-serif | **Code:** JetBrains Mono, Menlo, monospace

| Role | Size | Weight |
|------|------|--------|
| Hero H1 | 48px | 700 |
| Section H2 | 36px | 700 |
| Card H3 | 20px | 600 |
| Body | 15px | 400 |
| Caption | 13px | 400 |
| Label | 12px | 500 |

## 4. Component Stylings

**Primary Button:** #ffcc4d bg, #1a1a1a text, 8px radius, 10px 20px padding, 14px/600
**Secondary Button:** #ffffff bg, 1px #e5e7eb border, #374151 text

**Model Cards:**
- #ffffff bg, 1px #e5e7eb border, 8px radius, 16px padding
- Org avatar (24px) + model name (16px/600) + org name (13px muted)
- Colored pill tags, download/like counts in #6b7280
- Hover: border #d1d5db, shadow 0 2px 8px rgba(0,0,0,0.05)

**Navigation:** #ffffff bg, 1px #e5e7eb bottom, 56px height
Left: HF emoji + Hugging Face (16px/700) | Center: Models/Datasets/Spaces | Right: search + auth

**Inputs:** #ffffff bg, 1px #e5e7eb border, 8px radius, focus: #ffcc4d border + ring

## 5. Layout Principles

Spacing base 4px: xs:4 sm:8 md:16 lg:24 xl:32 2xl:48
Max-width: 1280px | Sidebar: 240px + fluid main
Model grid: 4-up desktop, 2-up mobile | Cards gap: 16px

## 6. Elevation
Flat (white) > 1px #e5e7eb border > 0 2px 8px rgba(0,0,0,0.05) on hover

## 7. Key Rules
DO: Yellow on small brand elements only | 4-up catalog grids | tag taxonomy colors
DO NOT: Yellow backgrounds | serif fonts | decorative gradients | fully rounded buttons

## 8. Responsive
Mobile: hamburger, 1-col grid | Tablet: 2-col | Desktop: 4-col

## 9. Quick Reference
Yellow: #ffcc4d | Canvas: #ffffff | Ink: #111827 | Body: #374151 | Muted: #6b7280 | Border: #e5e7eb
