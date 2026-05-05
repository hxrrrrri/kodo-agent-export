# Design System Inspired by Xiaohongshu (Little Red Book)

## 1. Visual Theme & Atmosphere

Xiaohongshu (Little Red Book) is China's lifestyle social commerce platform. White canvas with vivid red (#ff2442) engagement accent creates an aspirational, discovery-oriented aesthetic. Waterfall masonry feeds of lifestyle photography, note cards combining image and text, and social commerce product integration define the vocabulary.

**Key Characteristics:**
- White canvas (#ffffff) - clean, image-forward
- Vivid red (#ff2442) for likes, engagement, and brand identity
- Waterfall masonry grid as the primary discovery layout
- Note card format: image + text editorial hybrid
- Social commerce: product tags on images, price overlays
- Rounded cards: 12-16px for warm approachable feel

## 2. Color Palette & Roles

**Brand:** Red #ff2442 | Red Dark #e01a38 | Red Light #fff0f2
**Surface:** Canvas #ffffff | Card #ffffff | Gray #f5f5f5 | Dark #1a1a1a
**Text:** Ink #1a1a1a | Body #3c3c3c | Muted #909090 | Light #ffffff
**Border:** #ebebeb (standard) | #d5d5d5 (emphasized)
**Status:** Like #ff2442 | Saved #ff8800 | Verified #00aaff

## 3. Typography

**All:** PingFang SC (macOS/iOS Chinese), Noto Sans SC (cross-platform), Inter (fallback)

| Role | Size | Weight |
|------|------|--------|
| Display | 28px | 700 |
| Note Title | 16px | 600 |
| Body | 14px | 400 |
| Caption | 12px | 400 |
| Tag | 12px | 500 |
| Comment | 13px | 400 |

## 4. Component Stylings

**Note Card:**
- White bg, 0 2px 8px rgba(0,0,0,0.06), 12px radius
- Image: 3:4 portrait or 1:1 square, fills top of card
- Title: 16px/600 #1a1a1a (2 lines max, ellipsis)
- Author: 24px avatar + name 13px | Like count: heart icon + red count
- Product tag overlay on image: small pill with price

**Primary CTA:** #ff2442 bg, #ffffff text, 999px radius (pill), 10px 24px, 14px/600

**Navigation:**
- White bg, shadow 0 1px 8px rgba(0,0,0,0.05), 56px height
- Bottom tab bar: Home, Discovery, Publish (+), Messages, Profile
- Active: #ff2442 icon tint

**Like Button:**
- Heart outline | Liked: filled #ff2442 | Count beside it | Animation on tap
- Bookmark, share, comment icon row below post

**Waterfall Grid:**
- 2-col masonry (mobile-first) | Variable height based on image ratio
- 8px gap between cards

**Search Bar:**
- Rounded pill shape | #f5f5f5 bg | 16px padding | 44px height
- Search icon left | Trending topics as pills below

## 5. Layout
Mobile-first: 2-col masonry grid | Desktop: 4-5 col
Padding: 12px horizontal | Card gap: 8px
Note detail: full-width image top + scrollable text below

## 6. Key Rules
DO: Waterfall masonry grid | Red for engagement (likes, saves) | Note card format
DO NOT: Dark backgrounds | Flat single-column layouts | Muted color palette

## 7. Quick Reference
Canvas: #ffffff | Red: #ff2442 | Ink: #1a1a1a | Muted: #909090 | Border: #ebebeb | Card: 12px radius
