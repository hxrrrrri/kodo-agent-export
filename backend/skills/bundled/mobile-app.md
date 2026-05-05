---
name: mobile-app
description: Pixel-accurate iOS/Android app prototype inside an iPhone 15 Pro or Pixel device frame. Multi-screen with real navigation state, gestures, and product-specific information density.
---

# Mobile App Prototype

Use this skill to produce clickable mobile app prototypes. Output is a single HTML file with device frame and multiple navigable screens.

## Device Frame Options

| Frame | Dimensions | Use When |
|-------|-----------|---------|
| iPhone 15 Pro | 393×852px viewport | iOS apps, default for most requests |
| Pixel 8 Pro | 412×892px viewport | Android apps |
| iPad Pro | 1024×1366px | Tablet apps |

Default to iPhone 15 Pro unless brief specifies otherwise.

## Screen Archetypes

Every app is assembled from these screen types:

| Archetype | Contents |
|-----------|---------|
| `onboarding` | Full-bleed illustration, headline, sub, CTA, step dots |
| `auth` | Logo, input fields, action button, social login options |
| `feed` | Card list, tabs, FAB, pull-to-refresh indicator |
| `detail` | Hero media, title, metadata, action bar at bottom |
| `profile` | Avatar, stats row, grid or list of user content |
| `checkout` | Product summary, total, payment method, confirm button |
| `focus` | Single primary interaction — maps, camera, player, reader |
| `settings` | Grouped list rows, toggles, disclosure chevrons |
| `empty` | Illustration, headline, action — no content yet |
| `search` | Search bar, suggestions, results, filters |

Build 4–8 screens that tell the complete user story.

## Navigation Architecture

**Bottom Tab Bar** (most apps):
- 4–5 tabs, 72px height, icon + label
- Active state: filled icon + accent color
- Inactive: outline icon + muted color

**Top Navigation** (detail/nested flows):
- Back chevron, title, optional action button
- Height: 56px, semitransparent blur background

**Side Drawer** (admin/settings-heavy apps):
- Overlay at 85% screen width
- Close gesture or backdrop tap

Navigation state managed with JavaScript — no page reloads. Each screen div shown/hidden via CSS class toggle.

## Information Density Rules

- List items: min 56px touch target height
- Avatar: 40px standard, 56px featured, 32px compact
- Icon size: 24px standard, 20px compact, 28px emphasized
- Body text: 15–16px, line-height 1.4
- Caption: 12–13px, muted color
- No text below 12px

## Device Frame HTML Pattern

```html
<div class="device-frame iphone-15-pro">
  <div class="device-notch"></div>
  <div class="screen-area">
    <!-- Screens here, one active at a time -->
    <div class="screen" id="screen-home" data-active="true">…</div>
    <div class="screen" id="screen-detail" data-active="false">…</div>
  </div>
  <div class="home-indicator"></div>
</div>
```

## Status Bar

Always include realistic status bar:
- Left: carrier/signal bars + WiFi icon
- Center: time (always "9:41" — the canonical Apple demo time)
- Right: battery icon + percentage

## Quality Gates

1. All navigation links/buttons work — no dead taps
2. Device frame visible and proportionally correct
3. No horizontal scroll inside screen area
4. Bottom tab bar stays fixed at bottom
5. Back navigation functional on all detail screens
6. Text legible at 393px (iPhone viewport width)
