---
name: email-marketing
description: Product-launch or campaign marketing email. Centered single-column layout, hero block, feature highlights, CTA buttons, footer with unsubscribe. Email-safe HTML/CSS.
---

# Email Marketing

Use this skill to produce marketing email artifacts in email-safe HTML. Output is a visually polished email rendered in browser, preview-friendly, and ready for ESP export.

## Email Architecture

```
[Preheader text — hidden, 85 chars, shows in inbox preview]

[Header — Logo, centered, 120px height area]

[Hero — Full-width image or colored block, headline, subline]

[Body — Main message, 1–3 short paragraphs]

[Feature highlights — 2–3 items, icon + headline + body]

[Primary CTA — Centered button, prominent]

[Secondary content — Optional extra section]

[Footer — Company name, address, unsubscribe link]
```

## Email-Safe CSS Rules

- **No flexbox or CSS Grid** — use HTML tables for layout
- **Inline styles** for all critical styling
- **Max width: 600px** — centered with `margin: 0 auto`
- **System fonts** — no Google Fonts (some clients block external CSS)
- **Background colors** on `<td>` not `<div>`
- **Images** — always include `alt` text, set `width` and `height` attributes
- **Buttons** — use `<a>` styled as button, not `<button>` element

## Table Layout Pattern

```html
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td align="center" style="background-color: #f4f4f5;">
      <table width="600" cellpadding="0" cellspacing="0">
        <!-- Content here -->
      </table>
    </td>
  </tr>
</table>
```

## Hero Block Variants

**Image hero**: Full-width 600px image with overlay headline (decorative image with real text below)
**Color hero**: Solid background block, 200–280px height, centered headline + subline on color
**Dark hero**: Dark background for dramatic product launches

## CTA Button Style

```html
<a href="#" style="
  display: inline-block;
  background-color: [accent];
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
  padding: 14px 32px;
  border-radius: 6px;
  text-decoration: none;
">Get Started →</a>
```

## Preheader Text

Always include hidden preheader that previews well in inbox (85 chars):
```html
<span style="display:none;max-height:0;overflow:hidden;">
  [Compelling preview text that adds context to the subject line]
</span>
```

## Content Rules

- Subject-line style headline in hero: under 60 characters
- Body copy: conversational, direct, no corporate-speak
- 1 primary CTA, max 2 total CTAs in the email
- No more than 3 feature highlights
- Avoid image-heavy layouts (some clients block images)
- Every image has meaningful `alt` text
- Unsubscribe link is mandatory in footer

## Footer Requirements

```html
<table>
  <tr>
    <td style="text-align: center; padding: 20px; color: #6b7280; font-size: 12px;">
      Company Name · 123 Main St, City, State 12345<br>
      <a href="#">Unsubscribe</a> · <a href="#">Privacy Policy</a>
    </td>
  </tr>
</table>
```

## Quality Gates

1. No flexbox/grid in layout tables
2. Renders readable at 320px mobile width
3. CTA button visible and clickable
4. Preheader text included
5. Unsubscribe link in footer
6. No lorem ipsum
