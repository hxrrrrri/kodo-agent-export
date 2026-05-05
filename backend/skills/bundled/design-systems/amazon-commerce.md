# Design System Inspired by Amazon

## 1. Visual Theme & Atmosphere

Amazon is the world's largest retailer - its design prioritizes conversion, trust, and information density above all else. White canvas (#ffffff), Amazon Orange (#ff9900) for primary CTAs and the smile arrow, navy (#131921) for the navigation header. Prime blue (#00a8e1) for Prime-related features. The design is unabashedly dense: product grids, star ratings, price comparisons, and shipping information dominate.

**Key Characteristics:**
- White canvas (#ffffff) for product browsing
- Amazon Orange (#ff9900) for Add to Cart, Buy Now CTAs
- Dark navy (#131921) navigation header
- Dense product grid: image, title, stars, price, Prime badge
- Trust signals: customer reviews, shipping, return policies
- "Buy Box" as the primary conversion pattern

## 2. Color Palette & Roles

**Brand:** Orange #ff9900 | Orange Dark #e68900 | Prime Blue #00a8e1
**Surface:** Canvas #ffffff | Nav #131921 | Secondary #f0f2f2 | Card #ffffff
**Text:** Ink #0f1111 | Body #333333 | Muted #565959 | Nav #cccccc
**Border:** #dddddd (standard) | #d5d9d9 (cards)
**Status:** Prime #00a8e1 | In Stock #007600 | Low Stock #c45500 | Out of Stock #cc0c39
**Stars:** #ff9900 (filled) | #dddddd (empty)

## 3. Typography

**All:** Amazon Ember (custom) fallback: Arial, Helvetica, sans-serif

| Role | Size | Weight |
|------|------|--------|
| Nav Title | 24px | 700 |
| Category Head | 21px | 700 |
| Product Title | 16px | 400 |
| Price | 21px | 400 |
| Price Large | 28px | 400 |
| Body | 14px | 400 |
| Caption | 12px | 400 |
| Review | 14px | 400 |

## 4. Component Stylings

**Add to Cart Button:**
- #ff9900 bg, #0f1111 text, 8px radius, 8px 18px, 14px/400
- "Buy Now": #ffa41c bg, same geometry

**Product Card:**
- White bg, 1px #dddddd border (subtle), hover: shadow
- Product image: square, centered, white bg
- Title: 14px/400 #0f1111 (3 lines, ellipsis) | Stars row: orange stars + review count (link)
- Price: #cc0c39 if sale price, #0f1111 standard | "FREE Delivery" #007600 Prime badge

**Buy Box:**
- Right panel on product detail | Price prominent 28px
- In Stock/availability | Quantity selector | Add to Cart + Buy Now CTAs
- Seller info | Return policy snippet

**Navigation:**
- #131921 bg | Amazon logo left | Search bar center (full-width, orange button)
- "Hello, [Name]" + "Account & Lists" + "Returns" + cart icon right

**Star Rating:**
- 5 orange stars, filled to rating | x,xxx ratings count (link)
- Compact: single star + number for grid cards

**Category Banner:**
- Full-width image with text overlay | Shop now CTA

## 5. Layout
Max-width: 1500px | Horizontal padding: 14px
Product grid: 4-6 col desktop | Dense, compact row heights
Search results: left sidebar filters + grid/list main

## 6. Key Rules
DO: Orange for purchase CTAs exclusively | Trust signals (reviews, Prime, delivery) | Dense product grids
DO NOT: Dark backgrounds for main content | Remove star ratings | Minimize conversion elements

## 7. Quick Reference
Canvas: #ffffff | Nav: #131921 | Orange: #ff9900 | Prime: #00a8e1
Ink: #0f1111 | Body: #333333 | Muted: #565959 | Stock: #007600 | Alert: #cc0c39
