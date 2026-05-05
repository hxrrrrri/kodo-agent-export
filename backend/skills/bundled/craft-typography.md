---
name: craft-typography
description: Universal typography craft guidelines. Type scale, line-height, letter-spacing rules, max 2 typefaces, weight system, line length, and anti-patterns. Apply to every design output.
---

# Typography Craft Guidelines

Apply these rules to every design artifact. Typography is the primary vehicle of visual quality — most "bad design" is actually bad typography.

## Type Scale

| Label | Size Range | Use |
|-------|-----------|-----|
| Display | 48–72px | Hero headlines, poster titles |
| H1 | 36–48px | Page titles, section openers |
| H2 | 28–36px | Section headings |
| H3 | 22–28px | Subsection headings |
| H4 | 18–22px | Compact section labels |
| Body Large | 17–18px | Lead paragraphs, feature descriptions |
| Body | 15–16px | Standard reading copy |
| Body Small | 13–14px | Captions, metadata, secondary copy |
| Label | 11–12px | UI labels, tags, badges |
| Caption | 11px | Fine print, footnotes |

Never go below 11px for text the user is expected to read.

## Line Height

| Level | Line Height |
|-------|------------|
| Display / H1 | 1.0–1.2 |
| H2–H4 | 1.2–1.35 |
| Body | 1.5–1.6 |
| Small / Label | 1.4–1.5 |
| Caption | 1.35 |

**Common mistake**: using `line-height: 1.5` on a 72px display headline produces excessive vertical spacing. Tighten headings.

## Letter-Spacing Rules

| Size | Tracking |
|------|---------|
| Display 48px+ | -0.02em to -0.03em (negative) |
| H1–H2 | -0.01em to -0.02em |
| Body | 0 (never add tracking to body text) |
| Small / Caption | +0.01em to +0.02em |
| ALL CAPS any size | +0.06em to +0.1em |

**The rule**: as font size increases, letter-spacing should decrease (tighter). As font size decreases (ALL CAPS labels), letter-spacing should increase.

**Never add positive tracking to body text.** It reduces readability.

## Maximum 2 Typefaces

Use at most 2 typefaces per artifact:
1. **Display typeface**: used for headlines, titles, pull quotes
2. **Body typeface**: used for all other text

Acceptable single-typeface approach: one variable font used at different weights and optical sizes.

If using system fonts as fallback, keep the same hierarchy:
```css
--font-display: 'Your Display Font', Georgia, serif;
--font-body: 'Your Body Font', system-ui, sans-serif;
```

## Weight System

Three weights are sufficient for most work:

| Role | Weight |
|------|--------|
| Read (body, captions) | 400 or 450 |
| Emphasize (subheads, labels) | 510–550 |
| Announce (headlines, CTAs) | 590–700 |

Do not use weight 300 unless it is a deliberate "whisper-weight authority" choice (e.g., Stripe's light numerics). Never use 300 for body text — it fails accessibility on most screens.

## Line Length

Ideal reading line: **50–75 characters** (about 10–15 words).

```css
.article-body {
  max-width: 65ch; /* ch unit = width of "0" character */
}
```

**Too wide (>80ch)**: eye loses track of line start
**Too narrow (<40ch)**: reading is choppy and exhausting

For wider layouts: use multi-column CSS or fixed-max-width for body.

## Semantic Type Roles

Use type intentionally as a communication system:

- **Display** = visceral impact, read from distance
- **H1** = topic statement, anchor the page
- **H2** = navigational landmark within content
- **H3** = supporting point, detail entry
- **Body** = sustained reading, never draw attention
- **Caption** = context, never primary communication
- **Label** = functional UI: describe the control

## Anti-Patterns

**Avoid these in every output:**

1. **Inter as display typeface for every direction** — Inter is excellent for UI but generic as a display face. When the brief calls for editorial weight, use a proper serif or grotesque.

2. **Centered long-form text** — Body text should almost never be centered. Reserve centering for 1–2 line statements, CTAs, and hero copy.

3. **All-caps body text** — All-caps is for labels (4–5 words max), not sentences.

4. **Mixing 3+ typefaces** — A third typeface almost always signals poor discipline. Resolve with weight and size variation instead.

5. **Tight line-height on body text** — `line-height: 1.2` on 16px body text is painful to read. Never below 1.5 for sustained reading.

6. **Missing fallback fonts** — Always include a stack: `'Primary Font', system-fallback-category`.

7. **Weight 700 body text** — Bolding too much defeats emphasis. Reserve bold for genuinely critical information.

## Font Loading

For Google Fonts:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=…" rel="stylesheet">
```

Always `preconnect` before loading fonts. Specify only the weights you actually use.
