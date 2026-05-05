// Generated from backend/skills/bundled/design-systems/*.md.
// Do not hand-edit preset entries; update the source markdown docs instead.

export const DESIGN_SYSTEM_PRESETS = [
  {
    "id": "claude",
    "label": "Claude",
    "category": "AI & LLM",
    "colors": [
      "#faf9f5",
      "#efe9de",
      "#141413",
      "#6c6a64",
      "#cc785c"
    ],
    "displayFont": "Georgia, Times New Roman, serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "A warm-canvas editorial interface for Anthropic's Claude product. The system anchors on a tinted cream canvas with serif display headlines, warm coral CTAs, and dark navy product surfaces (code editor mockups, model show...",
    "prompt": "Use the bundled Claude design-system markdown as the source of truth. description: A warm-canvas editorial interface for Anthropic's Claude product. The system anchors on a tinted cream canvas with serif display headlines, warm coral CTAs, and dark navy product surfaces (code editor mockups, model showcase cards). Brand voltage comes from the cream/coral pairing - deliberately warm and humanist where most AI brands use cool blue + slate. Type voice runs a slab-serif display (\"Copernicus\" / Tiempos Headline) for h1/h2 and a humanist sans for body. The signature Anthropic black-radial-spike mark anchors the wordmark. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.primary-active}\" textColor: \"{colors.on-primary}\" backgroundColor: \"{colors.primary-disabled}\" textColor: \"{colors.muted}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.button}\" Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/anthropics.png?size=40"
  },
  {
    "id": "netflix-streaming",
    "label": "Netflix Streaming",
    "category": "Consumer",
    "colors": [
      "#141414",
      "#1f1f1f",
      "#e5e5e5",
      "#808080",
      "#e50914"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Netflix is cinema-first content discovery. Pure black (#141414) canvas creates the theater experience - every surface disappears so content thumbnail art can dominate. Netflix Red (#e50914) appears only on the primary CT...",
    "prompt": "Use the bundled Netflix Streaming design-system markdown as the source of truth. Netflix is cinema-first content discovery. Pure black (#141414) canvas creates the theater experience - every surface disappears so content thumbnail art can dominate. Netflix Red (#e50914) appears only on the primary CTA and brand mark. Horizontal scrolling content rows, gradient-overlay heroes, and hover-expand thumbnails are the signature interactions. *Key Characteristics:** DO: Black canvas always | Red only on brand/primary CTA | Horizontal scroll rows | Thumbnail-first hierarchy DO NOT: Light backgrounds | Decorative gradients beyond content treatment | Text-heavy layouts Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/Netflix.png?size=40"
  },
  {
    "id": "bmw-m",
    "label": "BMW M",
    "category": "Automotive",
    "colors": [
      "#000000",
      "#1a1a1a",
      "#ffffff",
      "#7e7e7e",
      "#1c69d4"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "A motorsport-engineering interface anchored on a near-black canvas with white BMW Type Next Latin display headlines in confident UPPERCASE. The brand carries no decorative voltage - its energy comes from full-bleed autom...",
    "prompt": "Use the bundled BMW M design-system markdown as the source of truth. description: A motorsport-engineering interface anchored on a near-black canvas with white BMW Type Next Latin display headlines in confident UPPERCASE. The brand carries no decorative voltage - its energy comes from full-bleed automotive photography (cars on tracks, driver-cockpit shots, carbon-fiber detail) and the iconic M tricolor stripe (light blue \u2192 dark blue \u2192 red) used sparingly as a brand signature on logos, dividers, and motorsport chrome. Type stays light to medium weight to feel European-engineered, never American-bombastic. colors: typography: components: backgroundColor: \"{colors.canvas}\" textColor: \"{colors.on-dark}\" typography: \"{typography.button}\" backgroundColor: transparent textColor: \"{colors.on-dark}\" typography: \"{typography.button}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.on-dark}\" typography: \"{typography.button}\" backgroundColor: \"{colors.surface-card}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "openai-research",
    "label": "Openai Research",
    "category": "AI & LLM",
    "colors": [
      "#ffffff",
      "#f5f5f5",
      "#0a0a0a",
      "#6b7280",
      "#10a37f"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "OpenAI's design language is high-modernist restraint at scale. Pure white canvas (`#ffffff`) with jet-black (`#0a0a0a`) authority creates maximum contrast without warmth - deliberate counter-positioning against editorial...",
    "prompt": "Use the bundled Openai Research design-system markdown as the source of truth. OpenAI's design language is high-modernist restraint at scale. Pure white canvas (`#ffffff`) with jet-black (`#0a0a0a`) authority creates maximum contrast without warmth - deliberate counter-positioning against editorial and startup aesthetics. The system communicates scientific confidence through what it removes rather than what it adds. No decorative gradients, no brand-color fills on large surfaces. Instead, OpenAI invests everything in typographic scale: hero headlines at 72-96px feel monumental and inevitable, as if the ideas themselves demand this much space. *Key Characteristics:** Text: `#0a0a0a` | Hover: border-color `#acacbe`, background `#f7f7f8` Focus: border-color `#10a37f`, 3px `rgba(16,163,127,0.15)` ring Use pure white canvas with maximum contrast black text Use extreme type scale (96px vs 16px) - the contrast is the design Don't add decorative gradients or colored section backgrounds Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/openai.png?size=40"
  },
  {
    "id": "anthropic-editorial",
    "label": "Anthropic Editorial",
    "category": "AI & LLM",
    "colors": [
      "#f3efe7",
      "#d97757",
      "#191714",
      "#6b7280",
      "#b85e3e"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Anthropic brand site uses warm parchment canvas (#f3efe7). Where competitors use cool tech-neutral whites, Anthropic uses paper-warmth, evoking scholarly publications. The terracotta accent (#d97757) on CTAs and brand ma...",
    "prompt": "Use the bundled Anthropic Editorial design-system markdown as the source of truth. Anthropic brand site uses warm parchment canvas (#f3efe7). Where competitors use cool tech-neutral whites, Anthropic uses paper-warmth, evoking scholarly publications. The terracotta accent (#d97757) on CTAs and brand mark is warm, muted, intentionally un-tech. *Key Characteristics:** Serif display at weight 400 ONLY - never bold. Negative tracking required on all display sizes. Serif in display, sans in body - the split is the brand signature. Don't use pure white or cool gray canvas Don't use terracotta on more than one CTA per viewport Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/anthropics.png?size=40"
  },
  {
    "id": "linear-app",
    "label": "Linear",
    "category": "Developer Tools",
    "colors": [
      "#010102",
      "#1a1a1a",
      "#f7f8f8",
      "#a3a3a3",
      "#5e6ad2"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "A near-black product-focused marketing canvas built around #010102 (the deepest dark surface of any tool in this collection), light gray text (#f7f8f8), and the signature Linear lavender-blue (#5e6ad2) used as the single...",
    "prompt": "Use the bundled Linear design-system markdown as the source of truth. description: \"A near-black product-focused marketing canvas built around #010102 (the deepest dark surface of any tool in this collection), light gray text (#f7f8f8), and the signature Linear lavender-blue (#5e6ad2) used as the single chromatic accent. The system reads as software-craft documentation: dense, technical, and quietly luxurious. Display type is set in the Linear custom sans (SF Pro Display fallback) at 500-700 with measured negative tracking. Cards live as charcoal panels (#0f1011) with hairline borders. The accent lavender appears on the brand mark, focus rings, and a few intentional CTAs - never decoratively. Page rhythm leans on product UI screenshots framed in dark panels rather than atmospheric color.\" colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.primary-focus}\" Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/linear.png?size=40"
  },
  {
    "id": "vercel",
    "label": "Vercel",
    "category": "Developer Tools",
    "colors": [
      "#ffffff",
      "#f5f5f5",
      "#171717",
      "#6b7280",
      "#ff5b4f"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Vercel's website is the visual thesis of developer infrastructure made invisible - a design system so restrained it borders on philosophical. The page is overwhelmingly white (`#ffffff`) with near-black (`#171717`) text,...",
    "prompt": "Use the bundled Vercel design-system markdown as the source of truth. *Key Characteristics:** Workflow-specific accent colors: Ship Red (`#ff5b4f`), Preview Pink (`#de1d8d`), Develop Blue (`#0a72ef`) **True Black** (`#000000`): Secondary use, `--geist-console-text-color-default`, used in specific console/code contexts. **Console Blue** (`#0070f3`): `--geist-console-text-color-blue`, syntax highlighting blue. **Console Purple** (`#7928ca`): `--geist-console-text-color-purple`, syntax highlighting purple. **Console Pink** (`#eb367f`): `--geist-console-text-color-pink`, syntax highlighting pink. **Link Blue** (`#0072f5`): Primary link color with underline decoration. **Focus Blue** (`hsla(212, 100%, 48%, 1)`): `--ds-focus-color`, focus ring on interactive elements. **Ring Blue** (`rgba(147, 197, 253, 0.5)`): `--tw-ring-color`, Tailwind ring utility. **Overlay Backdrop** (`hsla(0, 0%, 98%, 1)`): `--ds-overlay-backdrop-color`, modal/dialog backdrop. **Selection Text** (`hsla(0, 0%, 95%, 1)`): `--geist-selection-text-color`, text selection highlight. Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/vercel.png?size=40"
  },
  {
    "id": "stripe",
    "label": "Stripe",
    "category": "Fintech",
    "colors": [
      "#ffffff",
      "#f5f5f5",
      "#061b31",
      "#6b7280",
      "#533afd"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Stripe's website is the gold standard of fintech design -- a system that manages to feel simultaneously technical and luxurious, precise and warm. The page opens on a clean white canvas (`#ffffff`) with deep navy heading...",
    "prompt": "Use the bundled Stripe design-system markdown as the source of truth. Stripe's website is the gold standard of fintech design -- a system that manages to feel simultaneously technical and luxurious, precise and warm. The page opens on a clean white canvas (`#ffffff`) with deep navy headings (`#061b31`) and a signature purple (`#533afd`) that functions as both brand anchor and interactive accent. This isn't the cold, clinical purple of enterprise software; it's a rich, saturated violet that reads as confident and premium. The overall impression is of a financial institution redesigned by a world-class type foundry. What truly distinguishes Stripe is its shadow system. Rather than the flat or single-layer approach of most sites, Stripe uses multi-layer, blue-tinted shadows: the signature `rgba(50,50,93,0.25)` combined with `rgba(0,0,0,0.1)` creates shadows with a cool, almost atmospheric depth -- like elements are floating in a twilight sky. The blue-gray undertone of the primary shadow color (50,50,93) ties directly to the navy-purple brand palette, making even elevation feel on-brand. Preserve documented text/background contrast and component rules."
  },
  {
    "id": "apple",
    "label": "Apple",
    "category": "Consumer",
    "colors": [
      "#ffffff",
      "#f5f5f5",
      "#1d1d1f",
      "#1d1d1f",
      "#0066cc"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "A photography-first interface that turns marketing into a museum gallery. Edge-to-edge product tiles alternate light and dark canvases, framed by SF Pro Display headlines with negative letter-spacing and a single Action ...",
    "prompt": "Use the bundled Apple design-system markdown as the source of truth. description: A photography-first interface that turns marketing into a museum gallery. Edge-to-edge product tiles alternate light and dark canvases, framed by SF Pro Display headlines with negative letter-spacing and a single Action Blue (#0066cc) interactive color. UI chrome recedes so the product can speak - no decorative gradients, no shadows on chrome, only the one signature drop-shadow under product imagery resting on a surface. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.body}\" backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.primary}\" typography: \"{typography.body}\" backgroundColor: \"{colors.ink}\" textColor: \"{colors.on-dark}\" typography: \"{typography.button-utility}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "airbnb",
    "label": "Airbnb",
    "category": "Consumer",
    "colors": [
      "#ffffff",
      "#ffffff",
      "#222222",
      "#6a6a6a",
      "#ff385c"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "A warm, generous consumer marketplace anchored on a clean white canvas and Airbnb Rausch (#ff385c), the single brand voltage that carries every primary CTA, search-button orb, and rating dot. Type runs Airbnb Cereal VF a...",
    "prompt": "Use the bundled Airbnb design-system markdown as the source of truth. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.primary-active}\" textColor: \"{colors.on-primary}\" backgroundColor: \"{colors.primary-disabled}\" textColor: \"{colors.on-primary}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.button-md}\" backgroundColor: transparent textColor: \"{colors.ink}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-sm}\" backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" backgroundColor: \"{colors.surface-strong}\" textColor: \"{colors.ink}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.nav-link}\" backgroundColor: transparent Preserve documented text/background contrast and component rules."
  },
  {
    "id": "github-utility",
    "label": "Github Utility",
    "category": "Developer Tools",
    "colors": [
      "#0d1117",
      "#1a1a1a",
      "#f0f6fc",
      "#a3a3a3",
      "#2f81f7"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "GitHub is the canonical developer utility design system. Dark navy canvas (#0d1117) - the definitive developer dark mode. Near-white text (#f0f6fc) with blue tint. Electric blue (#2f81f7) for interactive elements only. S...",
    "prompt": "Use the bundled Github Utility design-system markdown as the source of truth. GitHub is the canonical developer utility design system. Dark navy canvas (#0d1117) - the definitive developer dark mode. Near-white text (#f0f6fc) with blue tint. Electric blue (#2f81f7) for interactive elements only. Semantic color vocabulary: every hue has strict meaning. *Key Characteristics:** Strict semantic colors: green=success, red=danger, purple=merged Footer: language color dot + star/fork counts Colored pill labels | Meta: 12px #8b949e DO: Semantic colors strictly | 1px #30363d border on all cards | 14px body density | real GitHub data DO NOT: Use colors decoratively | round more than 6px | add shadows at rest | use warm tones Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/github.png?size=40"
  },
  {
    "id": "cohere",
    "label": "Cohere",
    "category": "AI & LLM",
    "colors": [
      "#ffffff",
      "#f5f5f5",
      "#212121",
      "#93939f",
      "#17171c"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Cohere's 2026 web system is a controlled enterprise AI interface built from stark white editorial space, deep green-black product bands, soft mineral surfaces, rounded media cards, and a distinctive type split between mo...",
    "prompt": "Use the bundled Cohere design-system markdown as the source of truth. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: transparent textColor: \"{colors.ink}\" typography: \"{typography.body}\" backgroundColor: transparent textColor: \"{colors.primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.cohere-black}\" textColor: \"{colors.on-dark}\" typography: \"{typography.micro}\" backgroundColor: \"{colors.canvas}\" backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-dark}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.caption}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.body}\" backgroundColor: \"{colors.deep-green}\" textColor: \"{colors.on-dark}\" backgroundColor: \"{colors.soft-stone}\" textColor: \"{colors.ink}\" backgroundColor: transparent textColor: \"{colors.coral}\" typography: \"{typography.card-heading}\" Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/cohere-ai.png?size=40"
  },
  {
    "id": "deepseek-tech",
    "label": "Deepseek Tech",
    "category": "AI & LLM",
    "colors": [
      "#050507",
      "#1a1a1a",
      "#4b9eff",
      "#a3a3a3",
      "#e6eaf3"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "DeepSeek is dark-first technical minimalism. Near-black canvas (#050507) communicates infrastructure software seriousness. Blue-teal (#4B9EFF) is the sole accent. Code is first-class: JetBrains Mono appears at hero scale...",
    "prompt": "Use the bundled Deepseek Tech design-system markdown as the source of truth. *Key Characteristics:** DO: #050507 root canvas | Code as hero content | #4B9EFF sparingly | JetBrains Mono at scale DO NOT: Warm dark backgrounds | illustrations | decorative elements | radius >10px Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/deepseek-ai.png?size=40"
  },
  {
    "id": "elevenlabs",
    "label": "ElevenLabs",
    "category": "AI & LLM",
    "colors": [
      "#f5f5f5",
      "#ffffff",
      "#0c0a09",
      "#777169",
      "#292524"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "A voice-AI brand whose marketing surfaces read like a quietly editorial print magazine. The base canvas is off-white (`#f5f5f5`) holding warm near-black ink (`#292524`); the brand voltage is photographic, not chromatic -...",
    "prompt": "Use the bundled ElevenLabs design-system markdown as the source of truth. description: A voice-AI brand whose marketing surfaces read like a quietly editorial print magazine. The base canvas is off-white (`#f5f5f5`) holding warm near-black ink (`#292524`); the brand voltage is photographic, not chromatic - soft pastel atmospheric gradient orbs (mint \u2192 peach \u2192 lavender \u2192 sky) drift through the page as the only \"color\" moments. Display runs Waldenburg Light at weight 300 - the editorial signature. Inter carries body, navigation, captions. CTAs are subtle: a near-black ink pill is the primary, a transparent outline is the secondary. The brand trusts atmospheric photography and modest type weights to do all of the brand work; there is no neon accent, no saturated CTA color, no developer-tools dark canvas. colors: typography: components: backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.nav-link}\" backgroundColor: \"{colors.primary}\" Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/elevenlabs.png?size=40"
  },
  {
    "id": "huggingface-community",
    "label": "Huggingface Community",
    "category": "AI & LLM",
    "colors": [
      "#ffcc4d",
      "#ffffff",
      "#111827",
      "#6b7280",
      "#374151"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Hugging Face is a developer platform with community warmth. Warm yellow (#ffcc4d) is its primary identity - same as the emoji mascot. White canvas, dense card-grid layouts for models, datasets, and spaces.",
    "prompt": "Use the bundled Huggingface Community design-system markdown as the source of truth. *Key Characteristics:** Colored pill tags, download/like counts in #6b7280 DO: Yellow on small brand elements only | 4-up catalog grids | tag taxonomy colors DO NOT: Yellow backgrounds | serif fonts | decorative gradients | fully rounded buttons Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/huggingface.png?size=40"
  },
  {
    "id": "minimax",
    "label": "MiniMax",
    "category": "AI & LLM",
    "colors": [
      "#ffffff",
      "#f7f8fa",
      "#0a0a0a",
      "#6b7280",
      "#0a0a0a"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "MiniMax presents itself as a premium AI infrastructure brand through a striking duality - bold black-pill CTAs and stark white canvas for marketing, paired with vibrant gradient product cards (orange-red, magenta-pink, p...",
    "prompt": "Use the bundled MiniMax design-system markdown as the source of truth. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.charcoal}\" textColor: \"{colors.on-primary}\" backgroundColor: \"{colors.hairline}\" textColor: \"{colors.muted}\" backgroundColor: \"transparent\" textColor: \"{colors.ink}\" typography: \"{typography.button-md}\" border: \"1px solid {colors.ink}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.button-md}\" border: \"1px solid {colors.hairline}\" backgroundColor: \"transparent\" textColor: \"{colors.ink}\" typography: \"{typography.body-sm-medium}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" border: \"1px solid {colors.hairline}\" backgroundColor: \"{colors.brand-coral}\" textColor: \"{colors.on-dark}\" backgroundColor: \"{colors.brand-magenta}\" textColor: \"{colors.on-dark}\" backgroundColor: \"{colors.brand-blue}\" Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/MiniMax-AI.png?size=40"
  },
  {
    "id": "mistral-ai",
    "label": "Mistral AI",
    "category": "AI & LLM",
    "colors": [
      "#ffffff",
      "#fafafa",
      "#1f1f1f",
      "#6b7280",
      "#fa520f"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Mistral AI brands itself with a singular signature - atmospheric sunset gradients (mustard, orange, deep red) layered over photography of mountains, plus a horizontal \"sunset stripe\" bar that closes every page. The syste...",
    "prompt": "Use the bundled Mistral AI design-system markdown as the source of truth. description: Mistral AI brands itself with a singular signature - atmospheric sunset gradients (mustard, orange, deep red) layered over photography of mountains, plus a horizontal \"sunset stripe\" bar that closes every page. The system pairs warm cream-yellow surfaces ({colors.cream}) with a saturated orange primary CTA ({colors.primary}) and uses an elegant near-serif voice for hero displays. Coverage spans homepage (Frontier AI hero), Le Studio product page, Coding solutions, news article surfaces, contact form, and services tier page - all anchored by the signature gradient closing band. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.primary-deep}\" textColor: \"{colors.on-primary}\" backgroundColor: \"{colors.hairline}\" textColor: \"{colors.muted}\" backgroundColor: \"{colors.cream}\" Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/mistralai.png?size=40"
  },
  {
    "id": "ollama",
    "label": "Ollama",
    "category": "AI & LLM",
    "colors": [
      "#ffffff",
      "#ffffff",
      "#000000",
      "#737373",
      "#000000"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "|",
    "prompt": "Use the bundled Ollama design-system markdown as the source of truth. An almost defiantly minimal documentation-first system that treats the home page like a Markdown README - paper-white canvas, 36px center-aligned heading, a single black pill CTA, an inline terminal install snippet, and a hand-drawn llama mascot as the only ornamental element. No gradient, no hero photography, no marketing pyrotechnics. The chrome is a tiny utility palette of pure black, pure white, and three neutral grays; every interactive element is fully rounded into a pill (`{rounded.full}`); typography is SF Pro Rounded for headings paired with system sans for body and ui-monospace for code. Pricing tiers, FAQs, and \"your data stays yours\" guarantees all sit on the same flat canvas inside thin-border cards - the system is the documentation, and the documentation is the system. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/ollama.png?size=40"
  },
  {
    "id": "opencode-ai",
    "label": "OpenCode",
    "category": "AI & LLM",
    "colors": [
      "#fdfcfc",
      "#f1eeee",
      "#201d1d",
      "#424245",
      "#201d1d"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "|",
    "prompt": "Use the bundled OpenCode design-system markdown as the source of truth. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.ink-deep}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.button-md}\" backgroundColor: \"transparent\" textColor: \"{colors.mute}\" typography: \"{typography.button-md}\" backgroundColor: \"transparent\" textColor: \"{colors.ink}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.surface-card}\" textColor: \"{colors.ash}\" backgroundColor: \"{colors.surface-dark}\" textColor: \"{colors.on-dark}\" typography: \"{typography.caption-md}\" backgroundColor: \"{colors.surface-soft}\" textColor: \"{colors.ink}\" typography: \"{typography.body-md}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" backgroundColor: \"{colors.surface-soft}\" Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/opencode-ai.png?size=40"
  },
  {
    "id": "together-ai",
    "label": "Together AI",
    "category": "AI & LLM",
    "colors": [
      "#010120",
      "#1a1a1a",
      "#ef2cc1",
      "#a3a3a3",
      "#fc4c02"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Together AI's interface is a pastel-gradient dreamscape built for enterprise AI infrastructure - a design that somehow makes GPU clusters and model inference feel light, airy, and optimistic. The hero section blooms with...",
    "prompt": "Use the bundled Together AI design-system markdown as the source of truth. Together AI's interface is a pastel-gradient dreamscape built for enterprise AI infrastructure - a design that somehow makes GPU clusters and model inference feel light, airy, and optimistic. The hero section blooms with soft pink-blue-lavender gradients and abstract, painterly illustrations that evoke clouds and flight, establishing a visual metaphor for the \"AI-Native Cloud\" proposition. Against this softness, the typography cuts through with precision: \"The Future\" display font at 64px with aggressive negative tracking (-1.92px) creates dense, authoritative headline blocks. *Key Characteristics:** Use pastel gradients (pink/blue/lavender) for hero illustrations and decorative backgrounds Use Dark Blue (#010120) for dark sections - never generic gray-black Use PP Neue Montreal Mono in uppercase for section labels and technical markers Use the dark-blue-tinted shadow for elevation Don't use Brand Magenta (#ef2cc1) or Brand Orange (#fc4c02) as UI colors - they're for illustrations only Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/togethercomputer.png?size=40"
  },
  {
    "id": "voltagent",
    "label": "Voltagent",
    "category": "AI & LLM",
    "colors": [
      "#050507",
      "#1a1a1a",
      "#00d992",
      "#a3a3a3",
      "#8b949e"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "VoltAgent's interface is a deep-space command terminal for the AI age - a developer-facing darkness built on near-pure-black surfaces (`#050507`) where the only interruption is the electric pulse of emerald green energy....",
    "prompt": "Use the bundled Voltagent design-system markdown as the source of truth. The green accent (`#00d992`) is used with surgical precision - it glows from headlines, borders, and interactive elements like a circuit board carrying a signal. Against the carbon-black canvas, this green reads as \"power on\" - a deliberate visual metaphor for an AI agent engineering platform. The supporting palette is built entirely from warm-neutral grays (`#3d3a39`, `#8b949e`, `#b8b3b0`) that soften the darkness without introducing color noise, creating a cockpit-like warmth that pure blue-grays would lack. Typography leans on the system font stack for headings - achieving maximum rendering speed and native-feeling authority - while Inter carries the body and UI text with geometric precision. Code blocks use SFMono-Regular, the same font developers see in their terminals, reinforcing the tool's credibility at every scroll. *Key Characteristics:** Dual-typography system: system-ui for authoritative headings, Inter for precise UI/body text, SFMono for code credibility Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/VoltAgent.png?size=40"
  },
  {
    "id": "x-ai",
    "label": "xAI",
    "category": "AI & LLM",
    "colors": [
      "#1f2228",
      "#1a1a1a",
      "#ffffff",
      "#a3a3a3",
      "#ffffff"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "xAI's website is a masterclass in dark-first, monospace-driven brutalist minimalism -- a design system that feels like it was built by engineers who understand that restraint is the ultimate form of sophistication. The e...",
    "prompt": "Use the bundled xAI design-system markdown as the source of truth. xAI's website is a masterclass in dark-first, monospace-driven brutalist minimalism -- a design system that feels like it was built by engineers who understand that restraint is the ultimate form of sophistication. The entire experience is anchored to an almost-black background (`#1f2228`) with pure white text (`#ffffff`), creating a high-contrast, terminal-inspired aesthetic that signals deep technical credibility. There are no gradients, no decorative illustrations, no color accents competing for attention. This is a site that communicates through absence. *Key Characteristics:** Zero decorative elements: no shadows, no gradients, no colored accents **Pure White** (`#ffffff`): The singular text color, link color, and all foreground elements. In xAI's system, white is not a background -- it is the voice. **White Default** (`#ffffff`): Link and interactive element color in default state. **Ring Blue** (`rgb(59, 130, 246) / 0.5`): Tailwind's default focus ring color (`--tw-ring-color`), used for keyboard accessibility focus states. Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/xai-org.png?size=40"
  },
  {
    "id": "bmw",
    "label": "BMW",
    "category": "Automotive",
    "colors": [
      "#ffffff",
      "#fafafa",
      "#262626",
      "#6b6b6b",
      "#1c69d4"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "BMW's corporate site - distinct from BMW M's motorsport-bombastic variant, this is a measured and settled corporate-automotive interface. On a light (cream-tinted white) canvas, BMW corporate blue (#1c69d4) carries every...",
    "prompt": "Use the bundled BMW design-system markdown as the source of truth. colors: typography: components: backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.nav-link}\" backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.primary-active}\" textColor: \"{colors.on-primary}\" backgroundColor: \"{colors.primary-disabled}\" textColor: \"{colors.muted}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.button}\" backgroundColor: transparent textColor: \"{colors.on-dark}\" typography: \"{typography.button}\" backgroundColor: transparent textColor: \"{colors.ink}\" typography: \"{typography.label-uppercase}\" backgroundColor: transparent textColor: \"{colors.ink}\" typography: \"{typography.body-md}\" backgroundColor: \"{colors.surface-dark}\" textColor: \"{colors.on-dark}\" typography: \"{typography.display-xl}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "bugatti",
    "label": "Bugatti",
    "category": "Automotive",
    "colors": [
      "#000000",
      "#141414",
      "#ffffff",
      "#999999",
      "#5fa657"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "An austere luxury-automotive interface that uses near-pure black canvas, white uppercase letterspaced display, and full-bleed automotive photography as the only voltage. The system runs three custom Bugatti typefaces - B...",
    "prompt": "Use the bundled Bugatti design-system markdown as the source of truth. description: An austere luxury-automotive interface that uses near-pure black canvas, white uppercase letterspaced display, and full-bleed automotive photography as the only voltage. The system runs three custom Bugatti typefaces - Bugatti Display, Bugatti Text Regular, and Bugatti Monospace - and combines them at modest weights with wide tracking to feel European-engineered, hyper-minimal, and quietly expensive. There is no accent color, no decorative element, no chrome - only photography, typography, and the brand wordmark. colors: typography: components: backgroundColor: transparent textColor: \"{colors.on-dark}\" typography: \"{typography.button}\" backgroundColor: transparent textColor: \"{colors.on-dark}\" backgroundColor: transparent textColor: \"{colors.link}\" typography: \"{typography.button}\" backgroundColor: transparent textColor: \"{colors.on-dark}\" typography: \"{typography.nav-link}\" backgroundColor: transparent Preserve documented text/background contrast and component rules."
  },
  {
    "id": "ferrari",
    "label": "Ferrari",
    "category": "Automotive",
    "colors": [
      "#181818",
      "#303030",
      "#ffffff",
      "#666666",
      "#da291c"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "A luxury-automotive brand whose marketing surfaces read as cinematic editorial. The base canvas is **near-black** (`#181818`) holding pure white display type; white-canvas bands appear only inside specific editorial cont...",
    "prompt": "Use the bundled Ferrari design-system markdown as the source of truth. description: A luxury-automotive brand whose marketing surfaces read as cinematic editorial. The base canvas is **near-black** (`#181818`) holding pure white display type; white-canvas bands appear only inside specific editorial contexts (preowned listings, pricing tables). The single brand voltage is **Rosso Corsa** (`#da291c`) - the iconic Ferrari racing red - used scarcely on primary CTAs, the Cavallino mark, and Formula 1 race-position highlights. Type runs **FerrariSans** at modest weights (display 500, body 400) - never bombastic. Spacing follows an explicit 8px token ladder (`xxxs` 4px through `super` 128px); generous editorial pacing throughout. The brand's strongest visual signature is the **full-bleed cinematic hero photograph** that fills the viewport top with car photography, model details, or trackside livery - followed by a tighter editorial body layout below. colors: typography: Preserve documented text/background contrast and component rules."
  },
  {
    "id": "lamborghini",
    "label": "Lamborghini",
    "category": "Automotive",
    "colors": [
      "#000000",
      "#1a1a1a",
      "#ffc000",
      "#a3a3a3",
      "#ffffff"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Lamborghini's website is a cathedral of darkness - a digital stage where jet-black surfaces stretch infinitely and every element emerges from the void like a machine under a spotlight. The page is almost entirely black. ...",
    "prompt": "Use the bundled Lamborghini design-system markdown as the source of truth. The hero is a full-viewport video - dark, cinematic, immersive - showing event footage or vehicle reveals with the Lamborghini bull logo floating ethereally above. The navigation is minimal: a centered bull logo, a \"MENU\" hamburger on the left, and search/bookmark icons on the right, all rendered in white against the black canvas. There are no borders, no visible nav containers, no background color on the header - just white marks floating in darkness. The overall mood is nocturnal luxury: exclusive, theatrical, and deliberately intimidating. Each section transition is a scroll through darkness into the next revelation. Typography is the voice of this darkness. LamboType - a custom Neo-Grotesk typeface created by Character Type and design agency Strichpunkt - is used for everything from 120px uppercase display headlines to 10px micro labels. Its distinctive 12\u00b0 angled terminals are inspired by the aerodynamic lines of Lamborghini's super sports cars, and its proportions range from Normal to Ultracompressed width. Headlines SHOUT in uppercase at enormous scales with tight line-heights (0.92 at 120px), creating dense blocks of text that feel stamped from steel. The typeface carries hexagonal geometric DNA - constructed from hexagons, three-armed stars, and circles - that echoes throughout the interface in the hexagonal pause button and UI icons. Built on Bootstrap grid with 68 Element Plus/UI components, the technical infrastructure is substantial beneath the theatrical surface. Preserve documented text/background contrast and component rules."
  },
  {
    "id": "mercedes-luxury",
    "label": "Mercedes Luxury",
    "category": "Automotive",
    "colors": [
      "#0a0a0a",
      "#1a1a1a",
      "#c8c8c8",
      "#a3a3a3",
      "#444444"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Mercedes-Benz design communicates automotive luxury through restraint. Near-black canvas (#0a0a0a) with sterling silver heritage accents (#c8c8c8) and pristine white typography. The three-pointed star is the sole decorat...",
    "prompt": "Use the bundled Mercedes Luxury design-system markdown as the source of truth. Mercedes-Benz design communicates automotive luxury through restraint. Near-black canvas (#0a0a0a) with sterling silver heritage accents (#c8c8c8) and pristine white typography. The three-pointed star is the sole decorative element - everything else steps back for full-bleed vehicle photography. *Key Characteristics:** Ultra-thin typography (weight 300-400) at large scale *Brand Blue** (#0a4dab): Mercedes EQ electric accent (use sparingly) DO: Full-bleed vehicle photography | Weight 300 for display | Silver as the precious accent DO NOT: Warm tones | Rounded corners on main CTAs | Decorative gradients | Bold display type Preserve documented text/background contrast and component rules."
  },
  {
    "id": "porsche-precision",
    "label": "Porsche Precision",
    "category": "Automotive",
    "colors": [
      "#0a0a0a",
      "#1a1a1a",
      "#c4a97d",
      "#a3a3a3",
      "#c0c0c0"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Porsche's design language is cinema-black precision. Pure black (#0a0a0a) canvas with monumental ALL-CAPS display typography creates a presence that says: this is not ordinary. The design system uses restraint as a luxur...",
    "prompt": "Use the bundled Porsche Precision design-system markdown as the source of truth. Porsche's design language is cinema-black precision. Pure black (#0a0a0a) canvas with monumental ALL-CAPS display typography creates a presence that says: this is not ordinary. The design system uses restraint as a luxury signal - vast black expanses, one decisive silver or gold accent, full-bleed car photography that fills entire sections. *Key Characteristics:** DO: Full-bleed photography as primary content | ALL-CAPS display with positive tracking DO: Weight 300 for large display - featherlight at scale DO NOT: Warm browns or off-blacks | Rounded corners on buttons (sharp 0px) | Decorative gradients Preserve documented text/background contrast and component rules."
  },
  {
    "id": "renault",
    "label": "Renault",
    "category": "Automotive",
    "colors": [
      "#ffffff",
      "#ffffff",
      "#000000",
      "#222222",
      "#ffed00"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "|",
    "prompt": "Use the bundled Renault design-system markdown as the source of truth. signature Sunlight Yellow accent, and the proprietary NouvelR display colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.primary-deep}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.surface-dark}\" textColor: \"{colors.on-dark}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.surface-dark}\" textColor: \"{colors.on-dark}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.button-sm}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.body-md}\" backgroundColor: \"{colors.surface-dark}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "spacex",
    "label": "Spacex",
    "category": "Automotive",
    "colors": [
      "#000000",
      "#1a1a1a",
      "#f0f0fa",
      "#a3a3a3",
      "#f0f0fa"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "SpaceX's website is a full-screen cinematic experience that treats aerospace engineering like a film - every section is a scene, every photograph is a frame, and the interface disappears entirely behind the imagery. The ...",
    "prompt": "Use the bundled Spacex design-system markdown as the source of truth. The typography system uses D-DIN, an industrial geometric typeface with DIN heritage (the German industrial standard). The defining characteristic is that virtually ALL text is uppercase with positive letter-spacing (0.96px-1.17px), creating a military/aerospace labeling system where every word feels stenciled onto a spacecraft hull. D-DIN-Bold at 48px with uppercase and 0.96px tracking for the hero creates headlines that feel like mission briefing titles. Even body text at 16px maintains the uppercase/tracked treatment at smaller scales. What makes SpaceX distinctive is its radical minimalism: no shadows, no borders (except one ghost button border at `rgba(240,240,250,0.35)`), no color (only black and a spectral near-white `#f0f0fa`), no cards, no grids. The only visual element is photography + text. The ghost button with `rgba(240,240,250,0.1)` background and 32px radius is the sole interactive element - barely visible, floating over the imagery like a heads-up display. This isn't a design system in the traditional sense - it's a photographic exhibition with a type system and a single button. Preserve documented text/background contrast and component rules."
  },
  {
    "id": "tesla",
    "label": "Tesla",
    "category": "Automotive",
    "colors": [
      "#3e6ae1",
      "#1a1a1a",
      "#ffffff",
      "#a3a3a3",
      "#f4f4f4"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Tesla's website is an exercise in radical subtraction - a digital showroom where the product is everything and the interface is almost nothing. The page opens with a full-viewport hero that fills the entire screen with c...",
    "prompt": "Use the bundled Tesla design-system markdown as the source of truth. The color philosophy is almost ascetic: a single blue (`#3E6AE1`) for primary calls to action, three shades of dark gray for text hierarchy, and white for everything else. The entire emotional weight is carried by photography - sprawling landscape shots, studio-lit vehicle profiles, and atmospheric environmental compositions that stretch edge-to-edge across each viewport-height section. The UI chrome dissolves into the imagery. The navigation bar floats above the hero with no visible background, border, or shadow - the TESLA wordmark and five navigation labels simply exist in the space, trusting the content beneath them to provide sufficient contrast. Typography recently transitioned from Gotham to Universal Sans - a custom family split into \"Display\" for headlines and \"Text\" for body/UI elements - unifying the website, mobile app, and in-car software into a single typographic voice. The Display variant renders hero titles at 40px weight 500, while the Text variant handles everything from navigation (14px/500) to body copy (14px/400). The font carries a geometric precision with slightly humanist terminals that feels engineered rather than designed - exactly matching Tesla's brand identity of technology that doesn't need to announce itself. There are no text shadows, no text gradients, no decorative type treatments. Every letterform earns its place through clarity alone. Preserve documented text/background contrast and component rules."
  },
  {
    "id": "amazon-commerce",
    "label": "Amazon Commerce",
    "category": "Consumer",
    "colors": [
      "#ffffff",
      "#ff9900",
      "#131921",
      "#6b7280",
      "#00a8e1"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Amazon is the world's largest retailer - its design prioritizes conversion, trust, and information density above all else. White canvas (#ffffff), Amazon Orange (#ff9900) for primary CTAs and the smile arrow, navy (#1319...",
    "prompt": "Use the bundled Amazon Commerce design-system markdown as the source of truth. *Key Characteristics:** DO: Orange for purchase CTAs exclusively | Trust signals (reviews, Prime, delivery) | Dense product grids DO NOT: Dark backgrounds for main content | Remove star ratings | Minimize conversion elements Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/amzn.png?size=40"
  },
  {
    "id": "discord-community",
    "label": "Discord Community",
    "category": "Consumer",
    "colors": [
      "#313338",
      "#1a1a1a",
      "#f2f3f5",
      "#a3a3a3",
      "#b5bac1"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Discord is dark blurple community infrastructure. The three-panel layout (server list, channel list, content) defines the interface architecture. Deep blurple (#313338) canvas, Discord Blurple (#5865f2) for interactive e...",
    "prompt": "Use the bundled Discord Community design-system markdown as the source of truth. *Key Characteristics:** Role badge color system for community hierarchy Author name: 16px/500 (role color) + timestamp 12px muted Colored pill per role | Colored name in member list Color set by server admin for community hierarchy DO: Three-panel layout | Role color system | Status indicators | Dark blurple surfaces DO NOT: Light backgrounds | Remove the three-panel structure | Single color for all text Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/discord.png?size=40"
  },
  {
    "id": "dropbox-work",
    "label": "Dropbox Work",
    "category": "Consumer",
    "colors": [
      "#f7f5f2",
      "#ffffff",
      "#0061ff",
      "#6b7280",
      "#0044cc"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Dropbox is warm productivity for modern work. Warm off-white (#f7f5f2) canvas with Dropbox Blue (#0061ff) as the sole interactive accent. The design is approachable and human without being playful - file and folder metap...",
    "prompt": "Use the bundled Dropbox Work design-system markdown as the source of truth. *Key Characteristics:** File type icon (32px colored per type) | File name 15px/600 #1e1919 28px circular avatars with colored borders per user Cursor colors per user in document editor DO: Warm off-white canvas | Blue for all interactive elements | File/folder card patterns DO NOT: Multiple accent colors | Dark backgrounds | Heavy gradients Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/dropbox.png?size=40"
  },
  {
    "id": "loom-video",
    "label": "Loom Video",
    "category": "Consumer",
    "colors": [
      "#625df5",
      "#0f0f1a",
      "#ffffff",
      "#a3a3a3",
      "#eeecfe"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Loom is async video communication made effortless. Purple-forward brand (#625df5) on a dark video-first canvas (#0f0f1a) for the recorder experience, transitioning to clean white for sharing and viewing contexts. Video t...",
    "prompt": "Use the bundled Loom Video design-system markdown as the source of truth. *Key Characteristics:** Purple progress bar | Comment markers: colored dots on timeline DO: Purple for primary CTAs | Dark canvas for recording UI | Video thumbnails with metadata DO NOT: Multiple accent colors | Heavy dark for main browsing UI (use white for that) Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/loomhq.png?size=40"
  },
  {
    "id": "mailchimp-friendly",
    "label": "Mailchimp Friendly",
    "category": "Consumer",
    "colors": [
      "#ffe01b",
      "#ffffff",
      "#241c15",
      "#6b7280",
      "#4a3d30"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Mailchimp is email marketing made friendly. Signature yellow (#ffe01b) as the brand crown jewel - used in headers, hero sections, and the famous Freddie mascot's hat. Dark navy (#241c15) text creates warm contrast. The d...",
    "prompt": "Use the bundled Mailchimp Friendly design-system markdown as the source of truth. Mailchimp is email marketing made friendly. Signature yellow (#ffe01b) as the brand crown jewel - used in headers, hero sections, and the famous Freddie mascot's hat. Dark navy (#241c15) text creates warm contrast. The design strikes a balance between professional marketing platform and approachable small-business tool. Workflow builders, email campaign editors, and analytics charts are the primary components. *Key Characteristics:** Signature yellow (#ffe01b) in headers and brand moments Friendly Inter/Graphik typography - weight 400-700 DO: Yellow in header bands and brand moments | Dark navy ink on yellow | Warm off-white canvas DO NOT: Yellow on small buttons (use navy) | Multiple accent colors | Cold corporate palette Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/mailchimp.png?size=40"
  },
  {
    "id": "meta",
    "label": "Meta",
    "category": "Consumer",
    "colors": [
      "#ffffff",
      "#f1f4f7",
      "#1c1e21",
      "#6b7280",
      "#0064e0"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Meta's design system spans hardware commerce (Quest VR, Ray-Ban Meta AI glasses) and brand surfaces with a confident product-merchandising voice. The system pairs a stark white canvas with full-bleed photographic product...",
    "prompt": "Use the bundled Meta design-system markdown as the source of truth. colors: typography: components: backgroundColor: \"{colors.ink-button}\" textColor: \"{colors.on-ink-button}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.charcoal}\" textColor: \"{colors.on-ink-button}\" backgroundColor: \"{colors.disabled-text}\" textColor: \"{colors.canvas}\" backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.primary-deep}\" textColor: \"{colors.on-primary}\" backgroundColor: \"transparent\" textColor: \"{colors.ink-deep}\" typography: \"{typography.button-md}\" border: \"2px solid {colors.ink-deep}\" backgroundColor: \"transparent\" textColor: \"{colors.ink-deep}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.body-sm-bold}\" border: \"1px solid {colors.hairline}\" backgroundColor: \"{colors.ink-deep}\" textColor: \"{colors.canvas}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "nike",
    "label": "Nike",
    "category": "Consumer",
    "colors": [
      "#ffffff",
      "#f5f5f5",
      "#111111",
      "#6b7280",
      "#007d48"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "|",
    "prompt": "Use the bundled Nike design-system markdown as the source of truth. colors: typography: components: backgroundColor: \"{colors.ink}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.ink}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.soft-cloud}\" textColor: \"{colors.ink}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.soft-cloud}\" textColor: \"{colors.ink}\" backgroundColor: \"{colors.soft-cloud}\" textColor: \"{colors.ink}\" typography: \"{typography.body-md}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.ink}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "pinterest",
    "label": "Pinterest",
    "category": "Consumer",
    "colors": [
      "#ffffff",
      "#f6f6f3",
      "#000000",
      "#33332e",
      "#e60023"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "|",
    "prompt": "Use the bundled Pinterest design-system markdown as the source of truth. A photography-first discovery system organized around the Pinterest Red CTA, the masonry pin grid, and a soft warm-cream chrome that gets out of the imagery's way. The home page is a content-discovery tool wearing the chrome of a magazine publisher: 70px display headlines, friendly Pin Sans typography, fully-rounded pill buttons (16px) on a cream-tinted neutral palette, and a sticky red \"Sign up\" CTA that anchors every viewport. Pin imagery is the system's load-bearing visual element - square, portrait, and landscape pins tile in a column-based masonry grid where each tile is a fully-rounded 16px-radius card, separated by tight 8px gutters. The chrome is otherwise quiet: warm grays, true whites, and a single saturated red - no decorative gradients, no atmospheric backgrounds, no shadows beyond a soft modal scrim. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/pinterest.png?size=40"
  },
  {
    "id": "shopify",
    "label": "Shopify",
    "category": "Consumer",
    "colors": [
      "#02090a",
      "#061a1c",
      "#36f4a4",
      "#a3a3a3",
      "#c1fbd4"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Shopify.com is a dark-first digital theatre - a website that stages its commerce platform like a cinematic premiere. The entire experience unfolds against an abyss of near-black surfaces that carry the faintest whisper o...",
    "prompt": "Use the bundled Shopify design-system markdown as the source of truth. The typography is the undeniable star. NeueHaasGrotesk - a refined Helvetica descendant - appears at monumental scale (96px) with impossibly light weight (330-400), creating headlines that feel etched in light rather than printed in ink. The `ss03` OpenType feature gives letterforms a distinctive character that separates Shopify's type from generic Helvetica usage. Below the display layer, Inter Variable handles body text with surgical precision, using equally unusual variable weights (420, 450, 550) that live in the spaces between traditional weight stops. This precision signals a company that sweats every detail. Color is used with extreme restraint. The primary accent is Shopify Neon Green (`#36F4A4`) - an electric mint that appears exclusively on focus rings and accent highlights, pulsing like a bioluminescent signal against the dark canvas. Softer green tints (Aloe `#C1FBD4`, Pistachio `#D4F9E0`) provide atmospheric washes. White is the only text color that matters on dark surfaces, while a zinc-based neutral scale (`#A1A1AA` through `#3F3F46`) handles the hierarchy of quiet information. The result is a design that makes commerce technology feel like it belongs in a science-fiction future. Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://www.google.com/s2/favicons?domain=shopify.com&sz=64"
  },
  {
    "id": "spotify",
    "label": "Spotify",
    "category": "Consumer",
    "colors": [
      "#121212",
      "#181818",
      "#1ed760",
      "#a3a3a3",
      "#f3727f"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Spotify's web interface is a dark, immersive music player that wraps listeners in a near-black cocoon (`#121212`, `#181818`, `#1f1f1f`) where album art and content become the primary source of color. The design philosoph...",
    "prompt": "Use the bundled Spotify design-system markdown as the source of truth. Spotify's web interface is a dark, immersive music player that wraps listeners in a near-black cocoon (`#121212`, `#181818`, `#1f1f1f`) where album art and content become the primary source of color. The design philosophy is \"content-first darkness\" - the UI recedes into shadow so that music, podcasts, and playlists can glow. Every surface is a shade of charcoal, creating a theater-like environment where the only true color comes from the iconic Spotify Green (`#1ed760`) and the album artwork itself. The typography uses SpotifyMixUI and SpotifyMixUITitle - proprietary fonts from the CircularSp family (Circular by Lineto, customized for Spotify) with an extensive fallback stack that includes Arabic, Hebrew, Cyrillic, Greek, Devanagari, and CJK fonts, reflecting Spotify's global reach. The type system is compact and functional: 700 (bold) for emphasis and navigation, 600 (semibold) for secondary emphasis, and 400 (regular) for body. Buttons use uppercase with positive letter-spacing (1.4px-2px) for a systematic, label-like quality. Preserve documented text/background contrast and component rules."
  },
  {
    "id": "starbucks",
    "label": "Starbucks",
    "category": "Consumer",
    "colors": [
      "#f2f0eb",
      "#edebe9",
      "#006241",
      "#6b7280",
      "#cba258"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Starbucks' design system is a **warm, confident retail flagship** wearing the green of their storefront apron across every surface. The canvas alternates between a neutral-warm cream (`#f2f0eb`) and a ceramic off-white (...",
    "prompt": "Use the bundled Starbucks design-system markdown as the source of truth. Starbucks' design system is a **warm, confident retail flagship** wearing the green of their storefront apron across every surface. The canvas alternates between a neutral-warm cream (`#f2f0eb`) and a ceramic off-white (`#edebe9`) - colors that reference actual store materials: the paper napkins, the caf\u00e9 walls, the wood finishes - while the signature **Starbucks Green** (`#006241`) anchors the brand moment on hero bands, CTAs, and the Rewards experience. The greens come in four calibrated shades (Starbucks, Accent, House, Uplift) each mapped to a specific surface role, and gold (`#cba258`) appears only around Rewards-status ceremony - not as a general accent. Typography carries most of the brand voice. The proprietary **SoDoSans** typeface (custom to Starbucks) sits across nearly every surface with a tight `-0.16px` letter-spacing - it reads confident and friendly rather than fashion-magazine severe. What's unusual: the Rewards page switches to a warm serif (`\"Lander Tall\", \"Iowan Old Style\", Georgia`) for specific headline moments, subtly echoing the nostalgic feel of a coffeehouse chalkboard. And the Careers pages use a handwritten script (`\"Kalam\", \"Comic Sans MS\", cursive`) for personal cup-name touches. Three typefaces, three contexts - the system is disciplined about when each appears. Preserve documented text/background contrast and component rules."
  },
  {
    "id": "xiaohongshu-social",
    "label": "Xiaohongshu Social",
    "category": "Consumer",
    "colors": [
      "#ff2442",
      "#ffffff",
      "#1a1a1a",
      "#a3a3a3",
      "#fff0f2"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Xiaohongshu (Little Red Book) is China's lifestyle social commerce platform. White canvas with vivid red (#ff2442) engagement accent creates an aspirational, discovery-oriented aesthetic. Waterfall masonry feeds of lifes...",
    "prompt": "Use the bundled Xiaohongshu Social design-system markdown as the source of truth. *Key Characteristics:** DO: Waterfall masonry grid | Red for engagement (likes, saves) | Note card format DO NOT: Dark backgrounds | Flat single-column layouts | Muted color palette Preserve documented text/background contrast and component rules."
  },
  {
    "id": "arc-browser",
    "label": "Arc Browser",
    "category": "Design Systems",
    "colors": [
      "#1c1c2e",
      "#1a1a1a",
      "#e040fb",
      "#a3a3a3",
      "#7c3aed"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Arc Browser rejects the browser as a utility tool and presents it as a creative, personal space. The design uses deep purple-charcoal canvas (#1c1c2e) with vivid gradient identity flowing from hot pink (#e040fb) through ...",
    "prompt": "Use the bundled Arc Browser design-system markdown as the source of truth. Arc Browser rejects the browser as a utility tool and presents it as a creative, personal space. The design uses deep purple-charcoal canvas (#1c1c2e) with vivid gradient identity flowing from hot pink (#e040fb) through violet (#7c3aed) to deep blue. The sidebar is the defining UI element - wide, colorful, and central to the experience. The aesthetic is confident and expressive: not gaming-dark, not enterprise-neutral, but a creative-professional middle ground. Thick gradient fills, rounded components (16-20px radius), and playful micro-interactions coexist with precise utility density. *Key Characteristics:** Sidebar-centric layout with colorful space indicators Background: gradient from space accent color, dark to transparent Colored dot per space: matches space gradient accent DO: Gradient fills on primary CTAs | Rounded corners 12-20px | Sidebar-centric layout DO NOT: Sharp corners | Flat monochrome buttons | Gray placeholder identity Preserve documented text/background contrast and component rules."
  },
  {
    "id": "gaming-esports",
    "label": "Gaming Esports",
    "category": "Design Systems",
    "colors": [
      "#0a0a0a",
      "#111111",
      "#39ff14",
      "#a3a3a3",
      "#00f0ff"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Gaming & Esports design is pure black authority with neon energy. High-contrast dark surfaces, aggressive typography (Rajdhani, Bebas Neue, or Impact), and accent colors that glow against void darkness. HUD metaphors, te...",
    "prompt": "Use the bundled Gaming Esports design-system markdown as the source of truth. Gaming & Esports design is pure black authority with neon energy. High-contrast dark surfaces, aggressive typography (Rajdhani, Bebas Neue, or Impact), and accent colors that glow against void darkness. HUD metaphors, team roster cards, match scoreboards, and tournament brackets are the primary content patterns. *Key Characteristics:** Aggressive display typography: all-caps, wide tracking, geometric sans Team colors as accent system (each team has its own color) #1a1a1a bg | Left: 3px solid team-color | 12px 16px padding Player avatar (48px, team-colored border) | IGN 16px/700 | Role badge Hero: dark full-bleed + neon typography overlay | Max-width: 1440px DO: All-caps aggressive typography | Neon glow on primary accent | Dark surfaces throughout DO NOT: Light backgrounds | Soft rounded corners | Pastel colors | Serif fonts Preserve documented text/background contrast and component rules."
  },
  {
    "id": "notion",
    "label": "Notion",
    "category": "Design Systems",
    "colors": [
      "#ffffff",
      "#f6f5f4",
      "#1a1a1a",
      "#6b7280",
      "#5645d4"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Notion presents itself as the all-in-one workspace through a confident, illustration-rich brand voice - anchored by a deep navy hero band ({colors.brand-navy}) decorated with brand-colored sticky-note dots and mesh wire ...",
    "prompt": "Use the bundled Notion design-system markdown as the source of truth. description: Notion presents itself as the all-in-one workspace through a confident, illustration-rich brand voice - anchored by a deep navy hero band ({colors.brand-navy}) decorated with brand-colored sticky-note dots and mesh wire illustrations, a signature purple pill primary CTA ({colors.primary}), and a rich palette of pastel-tinted feature cards that echo the colorful database properties of the live product. The system uses a Notion-Sans (Inter-based) typeface across every UI surface, anchors a 4-tier pricing comparison (Free / Plus / Business / Enterprise), and presents the live workspace UI mockup directly inside the hero band. Coverage spans homepage, Enterprise, Product AI, Product Agents, Startups, and Pricing surfaces. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.primary-pressed}\" Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/makenotion.png?size=40"
  },
  {
    "id": "runwayml",
    "label": "Runway",
    "category": "Design Systems",
    "colors": [
      "#767d88",
      "#7d848e",
      "#000000",
      "#a3a3a3",
      "#030303"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Runway's interface is a cinematic reel brought to life as a website - a dark, editorial, film-production-grade design where full-bleed photography and video ARE the primary UI elements. This is not a typical tech product...",
    "prompt": "Use the bundled Runway design-system markdown as the source of truth. The design language is built on a single typeface - abcNormal - a clean, geometric sans-serif that handles everything from 48px display headlines to 11px uppercase labels. This single-font commitment creates an extreme typographic uniformity that lets the visual content speak louder than the text. Headlines use tight line-heights (1.0) with negative letter-spacing (-0.9px to -1.2px), creating compressed text blocks that feel like film titles rather than marketing copy. *Key Characteristics:** Tight display typography (line-height 1.0) with negative tracking (-0.9px to -1.2px) **Border Dark** (`#27272a`): The single dark-mode border color - barely visible containment. **None in the interface.** Visual richness comes entirely from photographic content - AI-generated and enhanced imagery provides all the color and gradient the design needs. The interface itself is intentionally colorless. **Weight 450 - the precision detail**: Some small uppercase labels use weight 450, an uncommon intermediate between regular (400) and medium (500). This micro-craft signals typographic sophistication. Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/runwayml.png?size=40"
  },
  {
    "id": "uber",
    "label": "Uber",
    "category": "Design Systems",
    "colors": [
      "#ffffff",
      "#f3f3f3",
      "#000000",
      "#4b4b4b",
      "#000000"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Uber's design language is a masterclass in confident minimalism -- a black-and-white universe where every pixel serves a purpose and nothing decorates without earning its place. The entire experience is built on a stark ...",
    "prompt": "Use the bundled Uber design-system markdown as the source of truth. The signature typeface, UberMove, is a proprietary geometric sans-serif with a distinctly square, engineered quality. Headlines in UberMove Bold at 52px carry the weight of a billboard -- authoritative, direct, unapologetic. The companion face UberMoveText handles body copy and buttons with a slightly softer, more readable character at medium weight (500). Together, they create a typographic system that feels like a transit map: clear, efficient, built for scanning at speed. What makes Uber's design truly distinctive is its use of full-bleed photography and illustration paired with pill-shaped interactive elements (999px border-radius). Navigation chips, CTA buttons, and category selectors all share this capsule shape, creating a tactile, thumb-friendly interface language that's unmistakably Uber. The illustrations -- warm, slightly stylized scenes of drivers, riders, and cityscapes -- inject humanity into what could otherwise be a cold, monochrome system. The site alternates between white content sections and a full-black footer, with card-based layouts using the gentlest possible shadows (rgba(0,0,0,0.12-0.16)) to create subtle lift without breaking the flat aesthetic. Preserve documented text/background contrast and component rules."
  },
  {
    "id": "airtable",
    "label": "Airtable",
    "category": "Design Tools",
    "colors": [
      "#ffffff",
      "#f8fafc",
      "#181d26",
      "#41454d",
      "#181d26"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "A sober, editorial workflow-software interface anchored on white canvas and dark-ink type, where brand voltage comes from full-bleed signature cards in coral, dark green, peach, and dark navy that punctuate long-scroll e...",
    "prompt": "Use the bundled Airtable design-system markdown as the source of truth. description: A sober, editorial workflow-software interface anchored on white canvas and dark-ink type, where brand voltage comes from full-bleed signature cards in coral, dark green, peach, and dark navy that punctuate long-scroll explainer pages. Primary actions use a near-black pill CTA; secondary actions sit in a white outlined button. Type runs Haas Grotesk in modest weights - never bold for its own sake. colors: signature-coral: \"#aa2d00\" signature-forest: \"#0a2e0e\" signature-cream: \"#f5e9d4\" signature-peach: \"#fcab79\" signature-mint: \"#a8d8c4\" signature-yellow: \"#f4d35e\" signature-mustard: \"#d9a441\" typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.primary-active}\" textColor: \"{colors.on-primary}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.button}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "cal",
    "label": "Cal.com",
    "category": "Design Tools",
    "colors": [
      "#ffffff",
      "#f5f5f5",
      "#111111",
      "#6b7280",
      "#242424"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "A clean, calendar-software-first interface anchored on white canvas with black primary CTAs and custom Cal Sans display typography. The system reads as friendly modern SaaS - generous whitespace, soft-rounded cards (~12p...",
    "prompt": "Use the bundled Cal.com design-system markdown as the source of truth. description: A clean, calendar-software-first interface anchored on white canvas with black primary CTAs and custom Cal Sans display typography. The system reads as friendly modern SaaS - generous whitespace, soft-rounded cards (~12px), product UI fragments shown directly inside cards, and a dark navy footer that visually closes long-scroll pages. Brand voltage comes from the Cal Sans display headline (a custom geometric face) and from product UI artifacts shown in-card rather than from accent colors. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.primary-active}\" textColor: \"{colors.on-primary}\" backgroundColor: \"{colors.primary-disabled}\" textColor: \"{colors.muted}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.button}\" backgroundColor: \"{colors.canvas}\" Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/calcom.png?size=40"
  },
  {
    "id": "canva-playful",
    "label": "Canva Playful",
    "category": "Design Tools",
    "colors": [
      "#ffffff",
      "#00c4cc",
      "#1f2937",
      "#6b7280",
      "#8b5cf6"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Canva is approachable creative power. White canvas (#ffffff) with vivid teal (#00c4cc) primary brand creates energy without intimidation. The design invites everyone to be a designer - no expertise required. Rounded corn...",
    "prompt": "Use the bundled Canva Playful design-system markdown as the source of truth. Canva is approachable creative power. White canvas (#ffffff) with vivid teal (#00c4cc) primary brand creates energy without intimidation. The design invites everyone to be a designer - no expertise required. Rounded corners (12-16px), playful color pops, and drag-and-drop metaphors define the vocabulary. *Key Characteristics:** *Color Picker Panel:** DO: Rounded corners everywhere | Teal on primary CTAs | Template grid as hero DO NOT: Sharp corners | Monochrome palette | Dark backgrounds | Complex animations Preserve documented text/background contrast and component rules."
  },
  {
    "id": "clay",
    "label": "Clay",
    "category": "Design Tools",
    "colors": [
      "#fffaf0",
      "#f5f0e0",
      "#0a0a0a",
      "#6a6a6a",
      "#0a0a0a"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "A vibrant claymation-meets-data interface for Clay.com (GTM data-orchestration platform). Anchors on white canvas with dark-navy primary CTAs, custom rounded display type, and saturated single-color feature cards - hot p...",
    "prompt": "Use the bundled Clay design-system markdown as the source of truth. description: A vibrant claymation-meets-data interface for Clay.com (GTM data-orchestration platform). Anchors on white canvas with dark-navy primary CTAs, custom rounded display type, and saturated single-color feature cards - hot pink, deep teal, lavender, peach, ochre - that punctuate long-scroll explainer pages. Brand voltage comes from 3D-rendered claymation illustrations (mountains, characters, mascots) used as full-bleed hero artifacts and the bright multi-color card surfaces showing product UI fragments. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.primary-active}\" textColor: \"{colors.on-primary}\" backgroundColor: \"{colors.primary-disabled}\" textColor: \"{colors.muted}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.button}\" button-on-color: Preserve documented text/background contrast and component rules."
  },
  {
    "id": "figma",
    "label": "Figma",
    "category": "Design Tools",
    "colors": [
      "#ffffff",
      "#f7f7f5",
      "#000000",
      "#6b7280",
      "#000000"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "A confident black-and-white editorial frame interrupted by oversized, hand-cut pastel color blocks. The marketing canvas is rigorously monochrome - figmaSans variable type, pure white surfaces, pure black ink, pill-shape...",
    "prompt": "Use the bundled Figma design-system markdown as the source of truth. description: \"A confident black-and-white editorial frame interrupted by oversized, hand-cut pastel color blocks. The marketing canvas is rigorously monochrome - figmaSans variable type, pure white surfaces, pure black ink, pill-shaped CTAs - while each story section drops the page into a saturated lime, lavender, cream, mint, or pink panel that reads like a sticky note placed on a clean desk. The result is a design system that feels both technical and joyful - a tool for serious work, made by people who like color.\" colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.button}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "framer",
    "label": "Framer",
    "category": "Design Tools",
    "colors": [
      "#090909",
      "#1a1a1a",
      "#ffffff",
      "#a3a3a3",
      "#0099ff"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "A confident dark-canvas builder marketing site that treats the page like a working artboard - pure black surfaces, white display type set in GT Walsheim Medium with aggressive negative tracking, and a single confident bl...",
    "prompt": "Use the bundled Framer design-system markdown as the source of truth. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.surface-1}\" textColor: \"{colors.ink}\" typography: \"{typography.button}\" backgroundColor: \"{colors.surface-2}\" textColor: \"{colors.ink}\" typography: \"{typography.button}\" backgroundColor: \"{colors.surface-1}\" textColor: \"{colors.ink}\" typography: \"{typography.button}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink-muted}\" typography: \"{typography.button}\" backgroundColor: \"{colors.surface-2}\" textColor: \"{colors.ink}\" typography: \"{typography.button}\" backgroundColor: \"{colors.surface-1}\" textColor: \"{colors.ink}\" typography: \"{typography.body}\" backgroundColor: \"{colors.surface-1}\" textColor: \"{colors.ink}\" typography: \"{typography.body}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "lovable",
    "label": "Lovable",
    "category": "Design Tools",
    "colors": [
      "#f7f4ed",
      "#ffffff",
      "#1c1c1c",
      "#6b7280",
      "#5f5f5d"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Lovable's website radiates warmth through restraint. The entire page sits on a creamy, parchment-toned background (`#f7f4ed`) that immediately separates it from the cold-white conventions of most developer tool sites. Th...",
    "prompt": "Use the bundled Lovable design-system markdown as the source of truth. *Key Characteristics:** Opacity-driven color system: all grays derived from `#1c1c1c` at varying transparency levels shadcn/ui + Radix UI component primitives with Tailwind CSS utility styling **Ring Blue** (`#3b82f6` at 50% opacity): `--tw-ring-color`, Tailwind focus ring. **Button Inset** (`rgba(255,255,255,0.2) 0px 0.5px 0px 0px inset, rgba(0,0,0,0.2) 0px 0px 0px 0.5px inset, rgba(0,0,0,0.05) 0px 1px 2px 0px`): The signature multi-layer inset shadow on dark buttons. **Compression at scale**: Headlines use negative letter-spacing (-0.9px to -1.5px) for editorial impact. Body text stays at normal tracking for comfortable reading. Color: `#1c1c1c` No color change on hover - decoration carries the interactive signal Soft gradient backgrounds behind hero content (warm multi-color wash) The scale expands generously at the top end - sections use 80px-208px vertical spacing for editorial breathing room Preserve documented text/background contrast and component rules."
  },
  {
    "id": "miro",
    "label": "Miro",
    "category": "Design Tools",
    "colors": [
      "#ffffff",
      "#f7f8fa",
      "#1c1c1e",
      "#6b7280",
      "#1c1c1e"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Miro presents itself as the AI-powered visual workspace through a confident, almost playful brand voice - anchored by its signature canary yellow ({colors.brand-yellow}) wordmark over white canvas, broken open by colorfu...",
    "prompt": "Use the bundled Miro design-system markdown as the source of truth. description: Miro presents itself as the AI-powered visual workspace through a confident, almost playful brand voice - anchored by its signature canary yellow ({colors.brand-yellow}) wordmark over white canvas, broken open by colorful pastel feature tints (rose, teal, coral, orange, mint) that echo the actual sticky-note color palette used on the live whiteboard. Black-pill primary buttons dominate marketing, real Miro-board mockups serve as feature illustrations, and a 4-tier pricing grid leads into a dense comparison table. Roobert PRO carries display headlines; the system supports homepage, pricing, AI Workflows product page, agile vertical, and customer stories surfaces. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.charcoal}\" textColor: \"{colors.on-primary}\" backgroundColor: \"{colors.hairline}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "sanity",
    "label": "Sanity",
    "category": "Design Tools",
    "colors": [
      "#0b0b0b",
      "#ffffff",
      "#797979",
      "#a3a3a3",
      "#b9b9b9"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Sanity's website is a developer-content platform rendered as a nocturnal command center -- dark, precise, and deeply structured. The entire experience sits on a near-black canvas (`#0b0b0b`) that reads less like a \"dark ...",
    "prompt": "Use the bundled Sanity design-system markdown as the source of truth. The signature typographic voice is waldenburgNormal -- a distinctive, slightly geometric sans-serif with tight negative letter-spacing (-0.32px to -4.48px at display sizes) that gives headlines a compressed, engineered quality. At 112px hero scale with -4.48px tracking, the type feels almost machined -- like precision-cut steel letterforms. This is paired with IBM Plex Mono for code and technical labels, creating a dual-register voice: editorial authority meets developer credibility. *Key Characteristics:** **Sanity Black** (`#0b0b0b`): The primary canvas and dominant surface color. Not pure black but close enough to feel absolute. The foundation of the entire visual identity. **Sanity Red** (`#f36458`): The primary CTA and brand accent -- a warm coral-red that serves as the main call-to-action color. Used for \"Get Started\" buttons and primary conversion points. **Electric Blue** (`#0052ef`): The universal hover/active state color across the entire system. Buttons, links, and interactive elements all shift to this blue on hover. Also used as `--color-blue-700` for focus rings and active states. Preserve documented text/background contrast and component rules."
  },
  {
    "id": "shadcn-system",
    "label": "shadcn/ui",
    "category": "Design Tools",
    "colors": [
      "#09090b",
      "#1a1a1a",
      "#ffffff",
      "#a3a3a3",
      "#a1a1aa"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "shadcn/ui is the developer-first component system: extreme minimalism, zero decoration, built for customization. The default theme uses near-black (#09090b) with zinc neutrals and a pure black/white contrast system. No b...",
    "prompt": "Use the bundled shadcn/ui design-system markdown as the source of truth. shadcn/ui is the developer-first component system: extreme minimalism, zero decoration, built for customization. The default theme uses near-black (#09090b) with zinc neutrals and a pure black/white contrast system. No brand colors exist at the system level - the system IS the structure, and color comes from your application layer. *Key Characteristics:** Zinc neutral scale throughout - no decorative color at all Component documentation density: code examples, preview panes, CLI commands Card radius: 12px | Component radius: 8px | Pill: 9999px DO: Zinc neutrals only | 1px borders as the primary design element | Code examples prominently DO NOT: Brand colors at system level | Multiple radius sizes | Decorative gradients | Round buttons full pill Preserve documented text/background contrast and component rules."
  },
  {
    "id": "webflow",
    "label": "Webflow",
    "category": "Design Tools",
    "colors": [
      "#146ef5",
      "#080808",
      "#ffffff",
      "#a3a3a3",
      "#00d722"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Webflow's website is a visually rich, tool-forward platform that communicates \"design without code\" through clean white surfaces, the signature Webflow Blue (`#146ef5`), and a rich secondary color palette (purple, pink, ...",
    "prompt": "Use the bundled Webflow design-system markdown as the source of truth. Webflow's website is a visually rich, tool-forward platform that communicates \"design without code\" through clean white surfaces, the signature Webflow Blue (`#146ef5`), and a rich secondary color palette (purple, pink, green, orange, yellow, red). The custom WF Visual Sans Variable font creates a confident, precise typographic system with weight 600 for display and 500 for body. *Key Characteristics:** Webflow Blue (`#146ef5`) as primary brand + interactive color **Webflow Blue** (`#146ef5`): `--_color---primary--webflow-blue`, primary CTA and links **Blue 400** (`#3b89ff`): `--_color---primary--blue-400`, lighter interactive blue **Blue 300** (`#006acc`): `--_color---blue-300`, darker blue variant **Button Hover Blue** (`#0055d4`): `--mkto-embed-color-button-hover` **Purple** (`#7a3dff`): `--_color---secondary--purple` **Pink** (`#ed52cb`): `--_color---secondary--pink` **Green** (`#00d722`): `--_color---secondary--green` Preserve documented text/background contrast and component rules."
  },
  {
    "id": "zapier",
    "label": "Zapier",
    "category": "Design Tools",
    "colors": [
      "#fffefb",
      "#ffffff",
      "#201515",
      "#6b7280",
      "#ff4f00"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Zapier's website radiates warm, approachable professionalism. It rejects the cold monochrome minimalism of developer tools in favor of a cream-tinted canvas (`#fffefb`) that feels like unbleached paper -- the digital equ...",
    "prompt": "Use the bundled Zapier design-system markdown as the source of truth. The brand's signature orange (`#ff4f00`) is unmistakable -- a vivid, saturated red-orange that sits precisely between traffic-cone urgency and sunset warmth. It's used sparingly but decisively: primary CTA buttons, active state underlines, and accent borders. Against the warm cream background, this orange creates a color relationship that feels energetic without being aggressive. *Key Characteristics:** Inter as the universal UI font across all functional typography **Zapier Orange** (`#ff4f00`): Primary CTA buttons, active underline indicators, accent borders. The signature color -- vivid and warm. **Dark Charcoal** (`#36342e`): Secondary text, footer text, border color for strong dividers. A warm dark gray-brown with 70% opacity variant. **Sand** (`#c5c0b1`): Primary border color, hover state backgrounds, divider lines. The backbone of Zapier's structural elements. **Link Default** (`#201515`): Standard link color, matching body text. Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/zapier.png?size=40"
  },
  {
    "id": "composio",
    "label": "Composio",
    "category": "Developer Tools",
    "colors": [
      "#0f0f0f",
      "#181818",
      "#ffffff",
      "#888888",
      "#0007cd"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "A developer-tools brand for AI-agent tool integration whose marketing surfaces lean into a dark, technical aesthetic with a single deep-electric-blue voltage (`#0007cd`). The page floor is near-black (`#0f0f0f`); cards f...",
    "prompt": "Use the bundled Composio design-system markdown as the source of truth. description: A developer-tools brand for AI-agent tool integration whose marketing surfaces lean into a dark, technical aesthetic with a single deep-electric-blue voltage (`#0007cd`). The page floor is near-black (`#0f0f0f`); cards float above on subtle gray-tinted surfaces. abcDiatype carries display and body in a single sans family with weights 400-600. The brand's strongest visual signature is a four-pane terminal-style mockup (a 2\u00d72 grid of dark code/output panels) with a central blue spotlight glow - used as the homepage hero anchor. colors: typography: components: backgroundColor: \"{colors.canvas}\" textColor: \"{colors.body-strong}\" typography: \"{typography.nav-link}\" backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.primary-active}\" textColor: \"{colors.on-primary}\" backgroundColor: \"{colors.surface-card-elevated}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "cursor",
    "label": "Cursor",
    "category": "Developer Tools",
    "colors": [
      "#f7f7f4",
      "#ffffff",
      "#26251e",
      "#807d72",
      "#f54e00"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "An AI-first code editor whose marketing site reads like a quietly-confident developer-tools brand with a warm-cream editorial canvas (`#f7f7f4`) instead of the typical dark IDE atmosphere. Near-black warm ink (`#26251e`)...",
    "prompt": "Use the bundled Cursor design-system markdown as the source of truth. description: An AI-first code editor whose marketing site reads like a quietly-confident developer-tools brand with a warm-cream editorial canvas (`#f7f7f4`) instead of the typical dark IDE atmosphere. Near-black warm ink (`#26251e`) carries body and display alike - display sits at weight 400 with negative letter-spacing for a magazine feel rather than a bold tech voice. The single brand voltage is **Cursor Orange** (`#f54e00`) reserved for primary CTAs and the wordmark. A signature pastel timeline palette (peach, mint, blue, lavender, gold) marks AI-action stages (Thinking / Reading / Editing / Grepping / Done) - only inside in-product timeline visualizations. Cards use minimal hairlines, no shadows, generous 80px section rhythm. CursorGothic for display/body, JetBrains Mono on every code surface (which is roughly half the page). colors: typography: components: backgroundColor: \"{colors.canvas}\" Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://www.google.com/s2/favicons?domain=cursor.sh&sz=64"
  },
  {
    "id": "expo",
    "label": "Expo",
    "category": "Developer Tools",
    "colors": [
      "#ffffff",
      "#ffffff",
      "#171717",
      "#6b7280",
      "#1a1a1a"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "A React Native developer-platform whose marketing site reads like a quietly-confident infrastructure brand. The base canvas is pure white with a soft sky-blue gradient atmospheric wash behind the hero; near-black ink (`#...",
    "prompt": "Use the bundled Expo design-system markdown as the source of truth. description: A React Native developer-platform whose marketing site reads like a quietly-confident infrastructure brand. The base canvas is pure white with a soft sky-blue gradient atmospheric wash behind the hero; near-black ink (`#171717`) carries body and display alike. The single brand voltage is **pure black** (`#000000`) for primary CTAs - minimal and editorial-feeling, paired with a small blue text-link accent (`#0d74ce`) reserved for inline body links. Type pairs Inter at modest weights (display 600, body 400) with JetBrains Mono on every code surface. The brand's strongest visual signature is the **device-mockup hero** - a centered MacBook + iPhone composite showing real Expo dev surfaces - over the gradient sky wash. colors: typography: components: backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.nav-link}\" backgroundColor: \"{colors.primary}\" Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/expo.png?size=40"
  },
  {
    "id": "hashicorp",
    "label": "HashiCorp",
    "category": "Developer Tools",
    "colors": [
      "#000000",
      "#1a1a1a",
      "#ffffff",
      "#a3a3a3",
      "#2b89ff"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "An enterprise-infrastructure marketing canvas built around a near-black ground (#000000) and a system of per-product accent colors - Terraform purple, Vault yellow, Consul pink, Waypoint cyan, Vagrant blue - that act as ...",
    "prompt": "Use the bundled HashiCorp design-system markdown as the source of truth. description: \"An enterprise-infrastructure marketing canvas built around a near-black ground (#000000) and a system of per-product accent colors - Terraform purple, Vault yellow, Consul pink, Waypoint cyan, Vagrant blue - that act as identity tokens rather than decorative palette. Display type is hashicorpSans set in 600/700 with tight 1.17-1.21 line-heights; body type runs the same family at 500 weight with relaxed 1.50-1.71 line-heights. Cards live as charcoal surfaces with 1px translucent gray borders; product showcase cards lift into per-product chromatic gradients. The system reads as confident, technical, and intentionally multi-product - every section quietly signals which HashiCorp tool it represents.\" colors: typography: components: backgroundColor: \"{colors.inverse-canvas}\" textColor: \"{colors.inverse-ink}\" typography: \"{typography.button}\" backgroundColor: \"{colors.inverse-canvas}\" Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/hashicorp.png?size=40"
  },
  {
    "id": "mintlify",
    "label": "Mintlify",
    "category": "Developer Tools",
    "colors": [
      "#ffffff",
      "#f7f7f7",
      "#0a0a0a",
      "#6b7280",
      "#0a0a0a"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Mintlify presents documentation infrastructure with a dual-mode aesthetic - atmospheric sky-gradient marketing heroes (cloud illustration backdrops, soft cream-to-blue washes) paired with dense developer-grade documentat...",
    "prompt": "Use the bundled Mintlify design-system markdown as the source of truth. description: Mintlify presents documentation infrastructure with a dual-mode aesthetic - atmospheric sky-gradient marketing heroes (cloud illustration backdrops, soft cream-to-blue washes) paired with dense developer-grade documentation surfaces. The system uses Inter for UI prose, Geist Mono for code, and a signature Mintlify green ({colors.brand-green}) reserved for accent CTAs and active states. Black-pill primary buttons dominate marketing, white-on-dark inversions appear on dark hero bands, and a 3-column documentation layout (sidebar / prose / TOC) anchors the developer experience. Coverage spans homepage, startups program, pricing comparison, and the live tabs documentation page. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.charcoal}\" textColor: \"{colors.on-primary}\" Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/mintlify.png?size=40"
  },
  {
    "id": "posthog",
    "label": "PostHog",
    "category": "Developer Tools",
    "colors": [
      "#eeefe9",
      "#ffffff",
      "#23251d",
      "#4d4f46",
      "#f7a501"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "|",
    "prompt": "Use the bundled PostHog design-system markdown as the source of truth. A playful developer-tools system rendered on a warm cream canvas with hand-drawn hedgehog mascots dotted across every page like marginalia in a sketchbook. The chrome reads like a friendly engineering blog: olive-gray ink (#4d4f46) for body, deep olive-charcoal (#23251d) for headlines, IBM Plex Sans Variable typography in tight 1.43-line-height paragraphs, and a single saturated yellow-orange CTA pill (#f7a501) carrying every primary action. The system actively rejects the genre's typical somber dark-tech aesthetic in favor of a creamy, textbook-illustration sensibility - bordered cards stack on the cream canvas with 4-6px radii, doc sidebars use rounded outline-icon mini-illustrations, and the home page leans on cartoon characters (hedgehogs in lab coats, hedgehogs at terminals, hedgehogs in lounge chairs) as its signature decoration. Code samples and product analytics charts live inside white-on-cream cards with thin olive borders; the contrast between the playful illustration and the data-dense product imagery is the brand's signature voice. Preserve documented text/background contrast and component rules."
  },
  {
    "id": "raycast",
    "label": "Raycast",
    "category": "Developer Tools",
    "colors": [
      "#07080a",
      "#121212",
      "#f4f4f6",
      "#cdcdcd",
      "#57c1ff"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "|",
    "prompt": "Use the bundled Raycast design-system markdown as the source of truth. \u5c5e\u4e8e: A dark-canvas developer-tools system that treats the marketing page like an extended product screenshot - pure-near-black background, command-palette mockups as the hero, Inter typography with the ss03 stylistic set turned on, and a single white CTA pill that doesn't break the inky atmosphere. The chrome reads like Raycast's own command-palette UI scaled up to a marketing page: monochrome dark surfaces with a faint surface ladder (#07080a \u2192 #0d0d0d \u2192 #101111), tight 6-10px radius on cards, hairline 1px borders in #242728, and rare splashes of saturated accent (Hacker News yellow, Slack red, Mac green, info blue) reserved for product-tile category illustrations. The signature visual moment is a red gradient hero wordmark - three diagonal red stripes laid across the very top of the home page like a launch-banner - paired with full-bleed product UI screenshots that show Raycast's actual command palette, store, and AI chat surfaces. Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/raycast.png?size=40"
  },
  {
    "id": "replicate",
    "label": "Replicate",
    "category": "Developer Tools",
    "colors": [
      "#f9f7f3",
      "#ffffff",
      "#202020",
      "#3a3a3a",
      "#ea2804"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "|",
    "prompt": "Use the bundled Replicate design-system markdown as the source of truth. signature display typeface (rb-freigeist-neue) sized aggressively large at colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.primary-deep}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.surface-dark}\" textColor: \"{colors.on-dark}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.surface-card}\" textColor: \"{colors.ink}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.surface-card}\" textColor: \"{colors.ink}\" backgroundColor: \"{colors.surface-card}\" textColor: \"{colors.ink}\" typography: \"{typography.body-md}\" backgroundColor: \"{colors.hero-warm}\" textColor: \"{colors.on-dark}\" typography: \"{typography.display-xl}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "resend",
    "label": "Resend",
    "category": "Developer Tools",
    "colors": [
      "#000000",
      "#0a0a0c",
      "#fcfdff",
      "#a3a3a3",
      "#fcfdff"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "|",
    "prompt": "Use the bundled Resend design-system markdown as the source of truth. text and a single signature color - the deep editorial-serif Domaine colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.primary-on}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.surface-light}\" textColor: \"{colors.primary-on}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.surface-elevated}\" textColor: \"{colors.ink}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.surface-card}\" textColor: \"{colors.ink}\" typography: \"{typography.body-sm}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.display-xxl}\" backgroundColor: \"{colors.surface-card}\" textColor: \"{colors.ink}\" typography: \"{typography.body-md}\" backgroundColor: \"{colors.surface-card}\" textColor: \"{colors.ink}\" typography: \"{typography.body-md}\" Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/resend.png?size=40"
  },
  {
    "id": "sentry",
    "label": "Sentry",
    "category": "Developer Tools",
    "colors": [
      "#1f1633",
      "#150f23",
      "#c2ef4e",
      "#a3a3a3",
      "#79628c"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Sentry's website is a dark-mode-first developer tool interface that speaks the language of code editors and terminal windows. The entire aesthetic is rooted in deep purple-black backgrounds (`#1f1633`, `#150f23`) that ev...",
    "prompt": "Use the bundled Sentry design-system markdown as the source of truth. The typography pairing is deliberate: \"Dammit Sans\" appears at hero scale (88px, weight 700) as a display font with personality and attitude that matches Sentry's irreverent brand voice (\"Code breaks. Fix it faster.\"), while Rubik serves as the workhorse UI font across all functional text - headings, body, buttons, captions, and navigation. Monaco provides the monospace layer for code snippets and technical content, completing the developer-tool trinity. What makes Sentry distinctive is its embrace of the \"dark IDE\" aesthetic without feeling cold or sterile. Warm purple tones replace the typical cool grays of developer tools, and bold illustrative elements (3D characters, colorful product screenshots) punctuate the dark canvas. The button system uses a signature muted purple (`#79628c`) with inset shadows that creates a tactile, almost physical quality - buttons feel like they could be pressed into the surface. Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/getsentry.png?size=40"
  },
  {
    "id": "supabase",
    "label": "Supabase",
    "category": "Developer Tools",
    "colors": [
      "#0f0f0f",
      "#171717",
      "#3ecf8e",
      "#a3a3a3",
      "#00c573"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Supabase's website is a dark-mode-native developer platform that channels the aesthetic of a premium code editor - deep black backgrounds (`#0f0f0f`, `#171717`) with emerald green accents (`#3ecf8e`, `#00c573`) that refe...",
    "prompt": "Use the bundled Supabase design-system markdown as the source of truth. The typography is built on \"Circular\" - a geometric sans-serif with rounded terminals that softens the technical edge. At 72px with a 1.00 line-height, the hero text is compressed to its absolute minimum vertical space, creating dense, impactful statements that waste nothing. The monospace companion (Source Code Pro) appears sparingly for uppercase technical labels with 1.2px letter-spacing, creating the \"developer console\" markers that connect the marketing site to the product experience. What makes Supabase distinctive is its sophisticated HSL-based color token system. Rather than flat hex values, Supabase uses HSL with alpha channels for nearly every color (`--colors-crimson4`, `--colors-purple5`, `--colors-slateA12`), enabling a nuanced layering system where colors interact through transparency. This creates depth through translucency - borders at `rgba(46, 46, 46)`, surfaces at `rgba(41, 41, 41, 0.84)`, and accents at partial opacity all blend with the dark background to create a rich, dimensional palette from minimal color ingredients. Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/supabase.png?size=40"
  },
  {
    "id": "warp",
    "label": "Warp",
    "category": "Developer Tools",
    "colors": [
      "#faf9f6",
      "#ffffff",
      "#353534",
      "#6b7280",
      "#868584"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Warp's website feels like sitting at a campfire in a deep forest - warm, dark, and alive with quiet confidence. Unlike the cold, blue-tinted blacks favored by most developer tools, Warp wraps everything in a warm near-bl...",
    "prompt": "Use the bundled Warp design-system markdown as the source of truth. The typography is the secret weapon: Matter, a geometric sans-serif with distinctive character, deployed at Regular weight across virtually all text. The font choice is unusual for a developer tool - Matter has a softness and humanity that signals \"this terminal is for everyone, not just greybeards.\" Combined with tight line-heights and controlled negative letter-spacing on headlines, the effect is refined and approachable simultaneously. Nature photography is woven between terminal screenshots, creating a visual language that says: this tool brings you closer to flow, to calm productivity. The overall design philosophy is restraint through warmth. Minimal color (almost monochromatic warm grays), minimal ornamentation, and a focus on product showcases set against cinematic dark landscapes. It's a terminal company that markets like a lifestyle brand. *Key Characteristics:** Almost monochromatic warm gray palette - no bold accent colors Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/warpdotdev.png?size=40"
  },
  {
    "id": "atlassian-team",
    "label": "Atlassian Team",
    "category": "Enterprise",
    "colors": [
      "#f7f8f9",
      "#ffffff",
      "#0c66e4",
      "#6b7280",
      "#0055cc"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Atlassian design is enterprise collaboration made approachable. Clean white (#f7f8f9) canvas, confident Atlassian Blue (#0c66e4), and the density of Jira, Confluence, and Trello. The system balances team-oriented warmth ...",
    "prompt": "Use the bundled Atlassian Team design-system markdown as the source of truth. Atlassian design is enterprise collaboration made approachable. Clean white (#f7f8f9) canvas, confident Atlassian Blue (#0c66e4), and the density of Jira, Confluence, and Trello. The system balances team-oriented warmth with enterprise rigor. Sprint boards, issue trackers, and status timelines are the signature components. *Key Characteristics:** Dense data components: sprint boards, issue tables, timelines To Do: #dfe1e6/#44546f | In Progress: #cce0ff/#0c66e4 Rounded pill | Color per status | 11px/700 uppercase To Do: #dfe1e6 bg, #44546f text | In Progress: #cce0ff, #0c66e4 DO: Status badge system consistently | Dense issue/task layouts | Blue for primary actions DO NOT: Rounded more than 8px on most elements | Dark backgrounds for main content Preserve documented text/background contrast and component rules."
  },
  {
    "id": "clickhouse",
    "label": "ClickHouse",
    "category": "Enterprise",
    "colors": [
      "#0a0a0a",
      "#1a1a1a",
      "#ffffff",
      "#888888",
      "#faff69"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "A high-performance database interface anchored on near-pure black canvas with electric yellow as the brand voltage. White typography in confident sans, yellow CTAs, and yellow-text stat numbers carry the brand voice acro...",
    "prompt": "Use the bundled ClickHouse design-system markdown as the source of truth. description: A high-performance database interface anchored on near-pure black canvas with electric yellow as the brand voltage. White typography in confident sans, yellow CTAs, and yellow-text stat numbers carry the brand voice across every page. Code blocks and product UI fragments embed directly in dark cards. The yellow + black pairing (and yellow used scarcely as accent) is the system's signature - brand identity without atmospheric decoration. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.primary-active}\" textColor: \"{colors.on-primary}\" backgroundColor: \"{colors.primary-disabled}\" textColor: \"{colors.muted}\" backgroundColor: \"{colors.surface-card}\" textColor: \"{colors.on-dark}\" typography: \"{typography.button}\" backgroundColor: transparent textColor: \"{colors.on-dark}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "datadog-ops",
    "label": "Datadog Ops",
    "category": "Enterprise",
    "colors": [
      "#ffffff",
      "#f5f5f5",
      "#7b44eb",
      "#6b7280",
      "#5a2fc7"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Datadog is operator-grade observability. White primary canvas (#ffffff) with Datadog Purple (#7b44eb) as brand energy. The design is built for monitoring engineers who read dashboards all day: information density, time-s...",
    "prompt": "Use the bundled Datadog Ops design-system markdown as the source of truth. *Key Characteristics:** Multi-color chart palette for multiple series Timestamp: tabular-nums 13px | Service tag: colored pill DO: Dense data layouts | Multi-series chart colors | Log level severity colors DO NOT: Large whitespace for dashboard content | Warm colors | Decorative elements Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/DataDog.png?size=40"
  },
  {
    "id": "hubspot-marketing",
    "label": "Hubspot Marketing",
    "category": "Enterprise",
    "colors": [
      "#ff7a59",
      "#ffffff",
      "#111111",
      "#6b7280",
      "#fff3ef"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "HubSpot is growth marketing made human. White canvas with coral-orange (#ff7a59) brand energy creates an approachable, results-focused aesthetic. The design bridges B2B utility (pipeline dashboards, email builders, analy...",
    "prompt": "Use the bundled Hubspot Marketing design-system markdown as the source of truth. HubSpot is growth marketing made human. White canvas with coral-orange (#ff7a59) brand energy creates an approachable, results-focused aesthetic. The design bridges B2B utility (pipeline dashboards, email builders, analytics) with friendly, approachable visual language. Flywheel diagrams, workflow automation chains, and CTA-heavy layouts are signature. *Key Characteristics:** DO: Orange for primary CTAs | Flywheel/funnel diagrams | CTA after every section DO NOT: Dark backgrounds | Multiple accent colors | Heavy data density without context Preserve documented text/background contrast and component rules."
  },
  {
    "id": "ibm",
    "label": "IBM",
    "category": "Enterprise",
    "colors": [
      "#ffffff",
      "#f5f5f5",
      "#161616",
      "#6b7280",
      "#0f62fe"
    ],
    "displayFont": "IBM Plex Sans, Inter, system-ui, sans-serif",
    "bodyFont": "IBM Plex Sans, Inter, system-ui, sans-serif",
    "summary": "An enterprise-marketing canvas faithful to Carbon Design System: white surfaces, charcoal type, IBM Blue (#0f62fe) as the single confident accent, and a deliberately flat-square aesthetic where corners stay at 0-4px. Typ...",
    "prompt": "Use the bundled IBM design-system markdown as the source of truth. description: \"An enterprise-marketing canvas faithful to Carbon Design System: white surfaces, charcoal type, IBM Blue (#0f62fe) as the single confident accent, and a deliberately flat-square aesthetic where corners stay at 0-4px. Type runs IBM Plex Sans at light weight 300 for display sizes (a brand signature) and 400/600 for body and emphasis. Cards live as thin-bordered tiles with no shadow; sections separate via subtle gray rows. The chrome is square, the typography is light, and the only color in the system is one assertive blue - the result reads as old-world enterprise gravitas reframed for the cloud era.\" colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.blue-80}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.ink}\" textColor: \"{colors.inverse-ink}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "intercom",
    "label": "Intercom",
    "category": "Enterprise",
    "colors": [
      "#f5f1ec",
      "#ff5600",
      "#111111",
      "#6b7280",
      "#0007cb"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "An editorial customer-service marketing canvas built around a soft cream-white ground, charcoal type set in Saans (Intercom's proprietary geometric sans), and a single confident Fin Orange (#ff5600) reserved for the Fin ...",
    "prompt": "Use the bundled Intercom design-system markdown as the source of truth. colors: typography: components: backgroundColor: \"{colors.ink}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.inverse-canvas}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.surface-1}\" textColor: \"{colors.ink}\" typography: \"{typography.button}\" backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.button}\" backgroundColor: \"{colors.fin-orange}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.surface-1}\" textColor: \"{colors.ink}\" typography: \"{typography.body}\" backgroundColor: \"{colors.ink}\" textColor: \"{colors.on-primary}\" typography: \"{typography.body}\" backgroundColor: \"{colors.surface-1}\" textColor: \"{colors.ink}\" typography: \"{typography.body}\" backgroundColor: \"{colors.surface-1}\" textColor: \"{colors.ink}\" typography: \"{typography.body}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "material-google",
    "label": "Material Google",
    "category": "Enterprise",
    "colors": [
      "#f8fafd",
      "#ffffff",
      "#001d35",
      "#6b7280",
      "#4a90d9"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Material Design 3 is Google's system for expressive, adaptive, accessible UI. Light gray (#f8fafd) default surface with vibrant blue (#1a73e8) primary and a dynamic color token system derived from the user's wallpaper/pr...",
    "prompt": "Use the bundled Material Google design-system markdown as the source of truth. Material Design 3 is Google's system for expressive, adaptive, accessible UI. Light gray (#f8fafd) default surface with vibrant blue (#1a73e8) primary and a dynamic color token system derived from the user's wallpaper/preferences. Elevation uses tonal surface overlays instead of drop shadows. FABs, navigation rails, and bottom navigation are the signature components. *Key Characteristics:** Tonal elevation: surfaces tinted with primary color at increasing opacity Clear elevation hierarchy via color-based surfaces, not shadows FABs, navigation rails, chips as signature components Primary container color bg | 16px radius | 56px x 56px | Icon 24px Active: primary color indicator pill + tonal bg Outlined: 1px #73777f | Filled: tonal container color DO: Tonal elevation (surface overlays, not shadows) | FABs for primary actions | Dynamic color system DO NOT: Heavy drop shadows (use tonal surfaces) | Multiple primary colors | Square corners Preserve documented text/background contrast and component rules."
  },
  {
    "id": "microsoft-fluent",
    "label": "Microsoft Fluent",
    "category": "Enterprise",
    "colors": [
      "#f5f5f5",
      "#ffffff",
      "#004578",
      "#6b7280",
      "#242424"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Microsoft Fluent 2 is the enterprise productivity design system. Off-white (#f5f5f5) canvas with Fluent Blue (#0078d4) anchoring interactive elements. The design prioritizes density, accessibility, and keyboard navigatio...",
    "prompt": "Use the bundled Microsoft Fluent design-system markdown as the source of truth. Microsoft Fluent 2 is the enterprise productivity design system. Off-white (#f5f5f5) canvas with Fluent Blue (#0078d4) anchoring interactive elements. The design prioritizes density, accessibility, and keyboard navigation - built for people who use software for 8 hours a day. Command bars, panes, ribbons, and dense tables are the signature components. *Key Characteristics:** DO: Dense data tables | Command bars for actions | Visible keyboard focus states DO NOT: Over-round corners | Dark backgrounds for primary content | Minimal density Preserve documented text/background contrast and component rules."
  },
  {
    "id": "mongodb",
    "label": "MongoDB",
    "category": "Enterprise",
    "colors": [
      "#ffffff",
      "#f9fbfa",
      "#001e2b",
      "#6b7280",
      "#00ed64"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "MongoDB carries a strong dual-mode visual identity - dark deep-teal hero bands with bright MongoDB green ({colors.brand-green}) CTAs paired with stark white documentation surfaces. The signature green pill button is unmi...",
    "prompt": "Use the bundled MongoDB design-system markdown as the source of truth. description: MongoDB carries a strong dual-mode visual identity - dark deep-teal hero bands with bright MongoDB green ({colors.brand-green}) CTAs paired with stark white documentation surfaces. The signature green pill button is unmistakable across product, pricing, learning, and AI use-case surfaces. The system uses Euclid Circular A as its display face, anchors a 3-tier pricing comparison (Free / Flex / Dedicated), and presents extensive course catalogs in card grids with colored category tags. Coverage spans homepage, Atlas product page, Community Edition, MongoDB University, AI use cases, and pricing. colors: typography: components: backgroundColor: \"{colors.brand-green}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.primary-pressed}\" textColor: \"{colors.on-primary}\" backgroundColor: \"{colors.hairline}\" textColor: \"{colors.muted}\" backgroundColor: \"transparent\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "pagerduty-incident",
    "label": "Pagerduty Incident",
    "category": "Enterprise",
    "colors": [
      "#1b1b2e",
      "#1a1a1a",
      "#f0f0f8",
      "#a3a3a3",
      "#5e5e7a"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "PagerDuty is incident response under pressure. The design communicates urgency, clarity, and control. Dark canvas (#1b1b2e) with critical red (#d94848) as the alert signal. Every element is optimized for 3am incident res...",
    "prompt": "Use the bundled Pagerduty Incident design-system markdown as the source of truth. *Key Characteristics:** High-contrast text hierarchy - no muted colors for critical information #2e2e46 bg, left 3px solid severity-color, 8px radius, 16px padding Active window: severity-color fill at 40% opacity DO: Severity color system consistently | Real-time status indicators | High contrast throughout DO NOT: Muted colors for critical alerts | Light backgrounds | Complex decorative elements Preserve documented text/background contrast and component rules."
  },
  {
    "id": "salesforce-crm",
    "label": "Salesforce CRM",
    "category": "Enterprise",
    "colors": [
      "#0176d3",
      "#1a1a1a",
      "#ffffff",
      "#a3a3a3",
      "#f3f3f3"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Salesforce Lightning Design System (SLDS) is enterprise CRM refined for daily operator use. White canvas with Salesforce Blue (#0176d3) guiding interactive elements. The design is built around record layouts: Account car...",
    "prompt": "Use the bundled Salesforce CRM design-system markdown as the source of truth. *Key Characteristics:** DO: CRM record field layouts | Activity timeline | Pipeline stage visualization | Status badges DO NOT: Dark backgrounds | Heavy gradients | Very rounded corners (4px max) Preserve documented text/background contrast and component rules."
  },
  {
    "id": "superhuman",
    "label": "Superhuman",
    "category": "Enterprise",
    "colors": [
      "#1b1938",
      "#1a1a1a",
      "#e9e5dd",
      "#a3a3a3",
      "#cbb7fb"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Superhuman's website feels like opening a luxury envelope - predominantly white, immaculately clean, with a single dramatic gesture of color that commands attention. The hero section is a cinematic purple gradient, a dee...",
    "prompt": "Use the bundled Superhuman design-system markdown as the source of truth. Superhuman's website feels like opening a luxury envelope - predominantly white, immaculately clean, with a single dramatic gesture of color that commands attention. The hero section is a cinematic purple gradient, a deep twilight wash of `#1b1938` that evokes the moment just before dawn, overlaid with confident white typography. Below this dramatic entrance, the rest of the site is almost entirely white canvas with dark charcoal text, creating a stark but refined reading experience. The typography is the true signature: Super Sans VF, a custom variable font with unconventional weight stops (460, 540, 600, 700) that sit between traditional font weight categories. Weight 460 - slightly heavier than regular but lighter than medium - is the workhorse, creating text that feels more confident than typical 400-weight but never aggressive. The tight line-heights (0.96 on display text) compress headlines into dense, powerful blocks, while generous 1.50 line-height on body text provides airy readability. This tension between compressed power and breathing room defines the Superhuman typographic voice. Preserve documented text/background contrast and component rules."
  },
  {
    "id": "vodafone",
    "label": "Vodafone",
    "category": "Enterprise",
    "colors": [
      "#e60000",
      "#25282b",
      "#ffffff",
      "#a3a3a3",
      "#f2f2f2"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Vodafone's corporate web system carries the confident, broadcast-scale presence of a global telecom brand - built around a single, fiercely-owned brand red and a restrained, editorial layout that lets imagery and type ca...",
    "prompt": "Use the bundled Vodafone design-system markdown as the source of truth. Vodafone's corporate web system carries the confident, broadcast-scale presence of a global telecom brand - built around a single, fiercely-owned brand red and a restrained, editorial layout that lets imagery and type carry the emotional weight. Every page opens the same way: a cinematic dark hero image behind a towering, tight-tracked uppercase display headline (\"EVERYONE. CONNECTED.\", \"INVESTORS\", \"OUR BUSINESS\") followed by a deep red full-width band that acts as a chapter break, then a crisp white editorial grid or a near-black section reserved for institutional content (share ticker, global map, ESG data). The voice is institutional but human: warm documentary photography - cable-laying crews, coral reefs, pine forests, urban twilight - photographed with color-graded realism and set against clean neutral surfaces that never compete with the content. The typography system is the signature. A custom Vodafone display face runs all the way up to 144px in heavy 800-weight uppercase with negative tracking, and it holds that voice consistently across every page template. Body copy sits in a calm 16-18px mid-weight rhythm. This dual scale - monumental at the top, almost quiet at the bottom - creates the \"corporate newsroom\" feeling: every page reads like the front of a national paper whose masthead happens to be red. Preserve documented text/background contrast and component rules.",
    "logoUrl": "https://github.com/vodafone.png?size=40"
  },
  {
    "id": "binance",
    "label": "Binance",
    "category": "Fintech",
    "colors": [
      "#fcd535",
      "#f0b90b",
      "#181a20",
      "#707a8a",
      "#fcd535"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "A confident financial-platform interface anchored on a deep near-black canvas, where Binance's iconic yellow (#FCD535) carries every primary CTA, brand accent, and value-claim moment. Type runs Binance's custom BinanceNo...",
    "prompt": "Use the bundled Binance design-system markdown as the source of truth. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.primary-active}\" textColor: \"{colors.on-primary}\" backgroundColor: \"{colors.primary-disabled}\" textColor: \"{colors.muted}\" backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" typography: \"{typography.button}\" backgroundColor: \"{colors.surface-card-dark}\" textColor: \"{colors.on-dark}\" typography: \"{typography.button}\" backgroundColor: \"{colors.canvas-light}\" textColor: \"{colors.ink}\" typography: \"{typography.button}\" backgroundColor: transparent textColor: \"{colors.body}\" typography: \"{typography.button}\" backgroundColor: \"{colors.trading-up}\" textColor: \"{colors.on-dark}\" typography: \"{typography.button}\" backgroundColor: \"{colors.trading-down}\" textColor: \"{colors.on-dark}\" typography: \"{typography.button}\" backgroundColor: \"{colors.primary}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "coinbase",
    "label": "Coinbase",
    "category": "Fintech",
    "colors": [
      "#ffffff",
      "#ffffff",
      "#0a0b0d",
      "#7c828a",
      "#0052ff"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "An institutional-grade crypto exchange whose marketing surfaces read like a quietly-confident financial-services brand. The base canvas is pure white; Coinbase Blue (`#0052ff`) is the single brand voltage, used scarcely ...",
    "prompt": "Use the bundled Coinbase design-system markdown as the source of truth. description: An institutional-grade crypto exchange whose marketing surfaces read like a quietly-confident financial-services brand. The base canvas is pure white; Coinbase Blue (`#0052ff`) is the single brand voltage, used scarcely on primary CTAs, signature glyphs, and inline accent moments. Type runs Coinbase's licensed CoinbaseDisplay (display) and CoinbaseSans (body) at modest weights - display sits at weight 400 not 700, signaling editorial calm rather than fintech-bombastic. Page rhythm rotates between bright white sections, soft gray elevation bands, and full-bleed dark editorial heroes (`#0a0b0d`) carrying product-ui mockup cards. Iconography is geometric and minimal; depth comes from card-on-card layering, never decorative shadows. colors: typography: components: backgroundColor: \"{colors.canvas}\" textColor: \"{colors.ink}\" typography: \"{typography.nav-link}\" backgroundColor: \"{colors.surface-dark}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "fintech-dark",
    "label": "Fintech Dark",
    "category": "Fintech",
    "colors": [
      "#0b1426",
      "#1a1a1a",
      "#00d4aa",
      "#a3a3a3",
      "#f43f5e"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Fintech Dark is an abstract design theme for premium financial interfaces. Deep navy canvas (#0b1426) with teal data signals (#00d4aa) creates institutional authority without cold sterility. This is the design language o...",
    "prompt": "Use the bundled Fintech Dark design-system markdown as the source of truth. *Key Characteristics:** *Chart Colors:** Teal #00d4aa | Blue #3b82f6 | Purple #a78bfa | Orange #fb923c | Yellow #fbbf24 Price: 15px/600 tabular-nums | Change %: colored (teal/red) DO: Teal for positive financial data | Red only for losses | Tabular-nums on all numbers DO NOT: Use teal/red for decorative purposes | warm colors anywhere | large border-radius Preserve documented text/background contrast and component rules."
  },
  {
    "id": "kraken",
    "label": "Kraken",
    "category": "Fintech",
    "colors": [
      "#7132f5",
      "#5741d8",
      "#ffffff",
      "#a3a3a3",
      "#101114"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Kraken's website is a clean, trustworthy crypto exchange that uses purple as its commanding brand color. The design operates on white backgrounds with Kraken Purple (`#7132f5`, `#5741d8`, `#5b1ecf`) creating a distinctiv...",
    "prompt": "Use the bundled Kraken design-system markdown as the source of truth. Kraken's website is a clean, trustworthy crypto exchange that uses purple as its commanding brand color. The design operates on white backgrounds with Kraken Purple (`#7132f5`, `#5741d8`, `#5b1ecf`) creating a distinctive, professional crypto identity. The proprietary Kraken-Brand font handles display headings with bold (700) weight and negative tracking, while Kraken-Product (with IBM Plex Sans fallback) serves as the UI workhorse. *Key Characteristics:** Use Kraken Purple (#7132f5) for CTAs and links Use Kraken-Brand for headings, Kraken-Product for body Don't use pill buttons - 12px is the max radius for buttons Don't use other purples outside the defined scale Preserve documented text/background contrast and component rules."
  },
  {
    "id": "mastercard",
    "label": "Mastercard",
    "category": "Fintech",
    "colors": [
      "#f3f0ee",
      "#ffffff",
      "#141413",
      "#6b7280",
      "#eb001b"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Mastercard's experience reads like a warm, editorial magazine built from soft stone and signal orange. The canvas is a muted putty-cream (`#F3F0EE`) - not white, not gray, but a color that feels like the paper of a premi...",
    "prompt": "Use the bundled Mastercard design-system markdown as the source of truth. Mastercard's experience reads like a warm, editorial magazine built from soft stone and signal orange. The canvas is a muted putty-cream (`#F3F0EE`) - not white, not gray, but a color that feels like the paper of a premium annual report. On top of that canvas, everything that matters is shaped like a stadium, a pill, or a perfect circle. The dominant visual gesture is the **oversized radius**: heroes carry 40-point corners, cards go fully pill-shaped, service images are cropped into circular orbits, and buttons either complete the pill or fit snugly at 20 points. There are almost no sharp corners anywhere on the page. Typography is rendered entirely in **MarkForMC**, Mastercard's proprietary geometric sans. Headlines are set at a medium weight (500) with tight negative letter-spacing (-2%), giving them confidence without shouting. Body copy runs at the same family in a slightly lighter weight (450) - a weight you rarely see on the web, chosen because it reads softer than regular 400 without feeling thin. The whole system - warm cream surfaces, pill shapes, circular portraits, traced-orange orbits, black CTAs - feels simultaneously institutional (a 60-year-old payments network) and editorial (a modern brand magazine), which is exactly the tension Mastercard wants to hold. Preserve documented text/background contrast and component rules."
  },
  {
    "id": "revolut",
    "label": "Revolut",
    "category": "Fintech",
    "colors": [
      "#494fdf",
      "#1a1a1a",
      "#ffffff",
      "#a3a3a3",
      "#494fdf"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "|",
    "prompt": "Use the bundled Revolut design-system markdown as the source of truth. colors: typography: components: backgroundColor: \"{colors.canvas-light}\" textColor: \"{colors.canvas-dark}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.faint}\" textColor: \"{colors.canvas-dark}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.canvas-dark}\" textColor: \"{colors.on-dark}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.surface-soft}\" textColor: \"{colors.ink}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.canvas-light}\" textColor: \"{colors.ink}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.canvas-dark}\" textColor: \"{colors.on-dark}\" typography: \"{typography.button-md}\" backgroundColor: \"{colors.surface-soft}\" textColor: \"{colors.ink}\" typography: \"{typography.button-sm}\" backgroundColor: \"{colors.canvas-light}\" textColor: \"{colors.ink}\" typography: \"{typography.body-md}\" backgroundColor: \"{colors.canvas-dark}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "wise",
    "label": "Wise",
    "category": "Fintech",
    "colors": [
      "#0e0f0c",
      "#1a1a1a",
      "#9fe870",
      "#a3a3a3",
      "#e2f6d5"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Wise's website is a bold, confident fintech platform that communicates \"money without borders\" through massive typography and a distinctive lime-green accent. The design operates on a warm off-white canvas with near-blac...",
    "prompt": "Use the bundled Wise design-system markdown as the source of truth. Wise's website is a bold, confident fintech platform that communicates \"money without borders\" through massive typography and a distinctive lime-green accent. The design operates on a warm off-white canvas with near-black text (`#0e0f0c`) and a signature Wise Green (`#9fe870`) - a fresh, lime-bright color that feels alive and optimistic, unlike the corporate blues of traditional banking. The typography uses Wise Sans - a proprietary font used at extreme weight 900 (black) for display headings with a remarkably tight line-height of 0.85 and OpenType `\"calt\"` (contextual alternates). At 126px, the text is so dense it feels like a protest sign - bold, urgent, and impossible to ignore. Inter serves as the body font with weight 600 as the default for emphasis, creating a consistently confident voice. What distinguishes Wise is its green-on-white-on-black material palette. Lime Green (`#9fe870`) appears on buttons with dark green text (`#163300`), creating a nature-inspired CTA that feels fresh. Hover states use `scale(1.05)` expansion rather than color changes - buttons physically grow on interaction. The border-radius system uses 9999px for buttons (pill), 30px-40px for cards, and the shadow system is minimal - just `rgba(14,15,12,0.12) 0px 0px 0px 1px` ring shadows. Preserve documented text/background contrast and component rules."
  },
  {
    "id": "nvidia",
    "label": "NVIDIA",
    "category": "Platform",
    "colors": [
      "#ffffff",
      "#f7f7f7",
      "#000000",
      "#1a1a1a",
      "#76b900"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "|",
    "prompt": "Use the bundled NVIDIA design-system markdown as the source of truth. An engineering-grade marketing system organized around two surface modes - a deep black canvas for hero and footer chapters and a flat paper-white canvas for body content - connected by a single, almost violently saturated NVIDIA Green accent that carries every CTA, every active tab, and the small decorative corner squares that mark out cards. The system is unapologetically angular: 2px radius across every surface, tight bold sans-serif typography in NVIDIA's proprietary EMEA cut, and a hairline gray rule that separates dense multi-column technical content. There is no decorative gradient, no atmospheric mesh, no soft drop shadow - just black, white, gray, and green stacked into a structured editorial grid that scales from product cards to massive industry landing pages without bending its rules. colors: typography: components: backgroundColor: \"{colors.primary}\" textColor: \"{colors.on-primary}\" Preserve documented text/background contrast and component rules."
  },
  {
    "id": "playstation",
    "label": "PlayStation",
    "category": "Platform",
    "colors": [
      "#0070d1",
      "#1a1a1a",
      "#ffffff",
      "#a3a3a3",
      "#0070d1"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "|",
    "prompt": "Use the bundled PlayStation design-system markdown as the source of truth. A three-surface marketing system organized around alternating black, white, and PlayStation Blue chapters that scroll past the viewer like a console launch trailer. Each section has a single editorial purpose - hero photography, console product render, PS Plus tier callout, news strip - and each owns one of three full-bleed canvas modes. The chrome is unusually quiet for a gaming brand: bright PlayStation Blue (`#0070d1`) carries every primary CTA as a fully-rounded pill, the proprietary SST face renders display copy at a signature weight 300 (light) for an airy, premium feel, and a crisp 8px-radius secondary card system carries product info on either canvas mode. The system never decorates - no gradient backgrounds on chrome, no atmospheric mesh, no drop shadows beyond a faint section-divide. Imagery does all the heavy lifting: console glamour shots, game key art, and PS Plus tier illustrations occupy 60-90% of every section, with copy compressed into a small editorial slot. Preserve documented text/background contrast and component rules."
  },
  {
    "id": "japanese-minimal",
    "label": "Japanese Minimal",
    "category": "Publishing",
    "colors": [
      "#f7f3ea",
      "#ffffff",
      "#20201d",
      "#6b7280",
      "#9b2c1f"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Japanese Minimal draws from wabi-sabi, ma (negative space), and the typographic precision of Japanese print design. Warm paper white (#f7f3ea), dark ink (#20201d), extreme whitespace, and single red accent (#9b2c1f) as a...",
    "prompt": "Use the bundled Japanese Minimal design-system markdown as the source of truth. *Key Characteristics:** DO: Extreme whitespace | Serif display | Red accent used with extreme restraint (1-2 times per page) DO NOT: Multiple colors | Rounded corners on buttons | Drop shadows | Illustrations Preserve documented text/background contrast and component rules."
  },
  {
    "id": "magazine-bold",
    "label": "Magazine Bold",
    "category": "Publishing",
    "colors": [
      "#f8f1e8",
      "#ffffff",
      "#1a3a5c",
      "#6b7280",
      "#1a1510"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Magazine Bold is an abstract editorial design theme inspired by print magazines like Monocle, The New York Times Magazine, and Vogue. Warm cream canvas (#f8f1e8), authoritative serif display (Playfair Display / Freight),...",
    "prompt": "Use the bundled Magazine Bold design-system markdown as the source of truth. Magazine Bold is an abstract editorial design theme inspired by print magazines like Monocle, The New York Times Magazine, and Vogue. Warm cream canvas (#f8f1e8), authoritative serif display (Playfair Display / Freight), oversized typography, and print-inspired hierarchy. The design communicates: this content is worth your time. *Key Characteristics:** Oversized typography as primary design element (80-120px headlines) Single decisive accent color: warm red (#d13f22) or ink blue (#1a3a5c) No shadows | Depth from surface color contrast | Rules (1px lines) as structural element DO: Serif headlines at extreme scale | Visible column structure | Print editorial vocabulary DO NOT: Sans-serif headlines | Decorative gradients | Card-heavy layouts | Small type Preserve documented text/background contrast and component rules."
  },
  {
    "id": "substack-newsletter",
    "label": "Substack Newsletter",
    "category": "Publishing",
    "colors": [
      "#ff6719",
      "#ffffff",
      "#111827",
      "#6b7280",
      "#fafaf9"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Substack is the writer-first publishing platform. Clean white canvas, generous reading typography, and the writer relationship at the center of the experience. The design intentionally removes friction between writer and...",
    "prompt": "Use the bundled Substack Newsletter design-system markdown as the source of truth. Substack is the writer-first publishing platform. Clean white canvas, generous reading typography, and the writer relationship at the center of the experience. The design intentionally removes friction between writer and reader. Orange accent (#ff6719) signals the platform brand on key CTAs and subscriber counts. *Key Characteristics:** DO: Georgia serif for all article content | Orange for subscribe CTAs | Writer-first, minimal chrome DO NOT: Dense UIs | Dark backgrounds | Multiple accent colors | Small type for articles Preserve documented text/background contrast and component rules."
  },
  {
    "id": "theverge",
    "label": "The Verge",
    "category": "Publishing",
    "colors": [
      "#131313",
      "#1a1a1a",
      "#3cffd0",
      "#a3a3a3",
      "#5200ff"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "The Verge's 2024 redesign feels like somebody wired a Cond\u00e9 Nast magazine to a chiptune soundboard. The canvas is almost-black (`#131313`), the headlines are built from a brutally heavy display face (Manuka) that runs up...",
    "prompt": "Use the bundled The Verge design-system markdown as the source of truth. The Verge's 2024 redesign feels like somebody wired a Cond\u00e9 Nast magazine to a chiptune soundboard. The canvas is almost-black (`#131313`), the headlines are built from a brutally heavy display face (Manuka) that runs up to 107px, and the whole page is peppered with acid-mint `#3cffd0` and ultraviolet `#5200ff` that behave less like brand colors and more like hazard tape. Story tiles are not quiet gray cards - they're saturated, full-bleed color blocks (yellow, pink, orange, blue, purple) that feel like pasted-up rave flyers arranged into a timeline. The mood is \"developer console meets club night meets tech tabloid\": serious enough to cover a congressional hearing, loud enough to review a synthesizer. What makes this system unmistakable is the **StoryStream** timeline: a vertical feed where every post is a rounded rectangle - often 20-40px radius - filled edge-to-edge with color, framed by a thin border, and marked by a mono-uppercase timestamp on its left rail. Stories don't float on a grid; they stack on a dashed vertical rule like commits in a git log. Above that, a massive **\"The Verge\" wordmark** dominates the masthead in Manuka at hero scale, letting the reader know before any headline loads that this is editorial territory, not a template. Preserve documented text/background contrast and component rules."
  },
  {
    "id": "wired",
    "label": "Wired",
    "category": "Publishing",
    "colors": [
      "#057dbc",
      "#ffffff",
      "#000000",
      "#a3a3a3",
      "#1a1a1a"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "WIRED's homepage feels like a printed broadsheet that someone has plugged into a wall socket. The grid is dense, the rules are thin, the type is loud, and almost every surface is paper-white or pure black with no rounded...",
    "prompt": "Use the bundled Wired design-system markdown as the source of truth. WIRED's homepage feels like a printed broadsheet that someone has plugged into a wall socket. The grid is dense, the rules are thin, the type is loud, and almost every surface is paper-white or pure black with no rounded corners and no decoration that doesn't earn its place. Image rectangles butt directly against headlines, hairline dividers separate stories the way pica rules separate columns in a real magazine, and the only colors that aren't grayscale come from the photography itself. There is no \"card with shadow\" anywhere - the entire layout is held together by typographic weight and the discipline of rules and whitespace, the same way a Cond\u00e9 Nast print page would be assembled in a paste-up room. The signature move is the **typographic stack**: a brutally large custom serif (WiredDisplay) for the main headline, a humanist serif (BreveText) for body and decks, a geometric sans (Apercu) for UI affordances, and a hard mono uppercase (WiredMono) for the kickers, eyebrows, and timestamps that mark every story. That mono kicker - usually black caps with letter-spacing wide enough to read as a Geiger-counter tick - is what makes a WIRED page instantly recognizable from across the room. Preserve documented text/background contrast and component rules."
  },
  {
    "id": "claymorphism",
    "label": "Claymorphism",
    "category": "Styles",
    "colors": [
      "#f3e8ff",
      "#fff0e6",
      "#374151",
      "#6b7280",
      "#374151"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Claymorphism creates UI elements that look like inflated, 3D clay objects. The effect combines: soft pastel backgrounds, inner highlights (top-left white glow), outer soft shadows, and exaggerated border-radius (24-32px)...",
    "prompt": "Use the bundled Claymorphism design-system markdown as the source of truth. *Key Characteristics:** Outer soft shadow: 0 8px 24px rgba(X,X,X,0.2) in the element's own color Saturated fill colors per clay element *Text:** Deep matching color per element | General: #374151 *Shadow colors:** Match the clay fill at 0.2-0.3 opacity padding: 14px 32px | font: 16px/700 | color: deep variant of fill color box-shadow: 0 6px 16px rgba(fill-color,0.35), inset 1px 1px 0 rgba(255,255,255,0.6) Colored circle (28-40px) | icon white inside | match clay color DO: Inner highlight on all clay elements (inset white glow) | Exaggerated radius 24-32px DO: Saturated pastel fills | Outer soft colored shadow | Rounded font (Nunito/Poppins) DO NOT: Sharp corners | Hard shadows | Dark backgrounds | Muted colors Preserve documented text/background contrast and component rules."
  },
  {
    "id": "cosmic-space",
    "label": "Cosmic Space",
    "category": "Styles",
    "colors": [
      "#050508",
      "#7c3aed",
      "#f0f4ff",
      "#a3a3a3",
      "#4f46e5"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Cosmic Space design evokes deep astronomical space. Near-black canvas (#050508) with subtle star field, nebula gradients in violet and deep blue, and constellation-style connecting line patterns. Text floats in cosmic vo...",
    "prompt": "Use the bundled Cosmic Space design-system markdown as the source of truth. *Key Characteristics:** border-radius: 10px | padding: 12px 28px | color: #ffffff | font: 15px/600 Large blurred circle (200-400px) | color: rgba(124,58,237,0.3) or rgba(79,70,229,0.2) DO: Star field background | Nebula orbs at section corners | Violet/indigo accent gradient DO: Frosted glass cards over cosmic bg | Constellation connecting lines for features DO NOT: Warm tones | Light backgrounds | Flat buttons | Decorative without depth Preserve documented text/background contrast and component rules."
  },
  {
    "id": "cyberpunk-neon",
    "label": "Cyberpunk Neon",
    "category": "Styles",
    "colors": [
      "#070812",
      "#1a1a1a",
      "#00f5d4",
      "#a3a3a3",
      "#ff0066"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Cyberpunk Neon is tech dystopia given a design system. Void black canvas (#070812) with electric cyan (#00f5d4) and hot magenta (#ff0066) as dual neons. Circuit board grid overlays, glitch effects, chrome text, and aggre...",
    "prompt": "Use the bundled Cyberpunk Neon design-system markdown as the source of truth. Cyberpunk Neon is tech dystopia given a design system. Void black canvas (#070812) with electric cyan (#00f5d4) and hot magenta (#ff0066) as dual neons. Circuit board grid overlays, glitch effects, chrome text, and aggressive condensed typography define the aesthetic. Blade Runner meets product design. *Key Characteristics:** background: transparent | border: 1px solid #00f5d4 | color: #00f5d4 Hover: border-color rgba(0,245,212,0.5), shadow 0 0 30px rgba(0,245,212,0.2) DO: Neon glows on interactive elements | Circuit grid overlay | Dual neon palette (cyan + magenta) DO: Condensed display type ALL-CAPS | 0-4px border-radius (sharp) DO NOT: Light backgrounds | Warm colors | Soft shadows | Rounded corners Glow recipe: box-shadow 0 0 12px [color] + 0 0 24px [color-dim] Preserve documented text/background contrast and component rules."
  },
  {
    "id": "glassmorphism",
    "label": "Glassmorphism",
    "category": "Styles",
    "colors": [
      "#1a0533",
      "#0d1b4b",
      "#06b6d4",
      "#a3a3a3",
      "#8b5cf6"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Glassmorphism creates UI elements that appear to be made of frosted glass floating over vivid gradient backgrounds. The effect requires: semi-transparent backgrounds (rgba), backdrop-filter blur, subtle white borders, an...",
    "prompt": "Use the bundled Glassmorphism design-system markdown as the source of truth. Glassmorphism creates UI elements that appear to be made of frosted glass floating over vivid gradient backgrounds. The effect requires: semi-transparent backgrounds (rgba), backdrop-filter blur, subtle white borders, and layered depth. The background gradient provides all the color energy; the glass elements sit neutrally above it. *Key Characteristics:** border-radius: 12px | padding: 12px 24px | color: #ffffff | font: 15px/600 Decorative orbs: large colored circles with blur (filter: blur(80px)) behind cards DO: backdrop-filter blur on all glass elements | rgba white borders | Rich gradient background DO NOT: Solid white backgrounds | No blur (kills the effect) | Dark borders | Flat colors for glass Preserve documented text/background contrast and component rules."
  },
  {
    "id": "luxury-premium",
    "label": "Luxury Premium",
    "category": "Styles",
    "colors": [
      "#0b0a08",
      "#1a1a1a",
      "#c8a45d",
      "#a3a3a3",
      "#faf7f2"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Luxury Premium is the design language of high-end fashion, jewelry, and prestige brands. Near-black (#0b0a08) canvas with warm gold (#c8a45d) as the only precious accent. Ultra-thin serif typography (Cormorant Garamond, ...",
    "prompt": "Use the bundled Luxury Premium design-system markdown as the source of truth. Luxury Premium is the design language of high-end fashion, jewelry, and prestige brands. Near-black (#0b0a08) canvas with warm gold (#c8a45d) as the only precious accent. Ultra-thin serif typography (Cormorant Garamond, Didot) at generous sizes. Extreme whitespace. Monochromatic restraint - the absence of color IS the luxury signal. *Key Characteristics:** *No semantic colors** - luxury brands do not use red/green status indicators color: #c8a45d | font: 11px/500 uppercase, 0.15em tracking 1px solid rgba(245,240,232,0.3) | color: #f5f0e8 DO: Extreme whitespace | Serif at weight 300 with wide tracking | Gold accent once or twice per page DO NOT: Multiple colors | Rounded anything | Decorative elements | Large body font weights | Crowded layouts Preserve documented text/background contrast and component rules."
  },
  {
    "id": "neo-brutal",
    "label": "Neo Brutal",
    "category": "Styles",
    "colors": [
      "#fffdf2",
      "#ffdd00",
      "#0000ff",
      "#6b7280",
      "#ff4d00"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Neo Brutal is the anti-design design system. Thick black borders everywhere, flat colors, zero border-radius, bold stacked typography. Influenced by brutalist web design but updated with modern flat colors and playful as...",
    "prompt": "Use the bundled Neo Brutal design-system markdown as the source of truth. Neo Brutal is the anti-design design system. Thick black borders everywhere, flat colors, zero border-radius, bold stacked typography. Influenced by brutalist web design but updated with modern flat colors and playful asymmetry. Every card, button, and panel has a visible 2-3px solid black border and a hard box-shadow offset (4px 4px 0 #000). *Key Characteristics:** Zero border-radius (0px) on primary components Flat primary colors: yellow (#ffdd00), red (#ff4d00), blue (#0000ff), green (#00cc44) Bold condensed typography at oversized scale *Primary Colors (rotate as accent):** *Text:** Black #111111 on all surfaces | White #ffffff on colored bg *Border:** Solid #111111 (2-3px) | Active: colored border (accent color) Logo: bold condensed wordmark | Links: uppercase Inter 15px/700 | CTA: accent color button DO: 2-3px solid black borders | Hard box-shadow 4px 4px 0 #000 | Flat colors | Zero border-radius Preserve documented text/background contrast and component rules."
  },
  {
    "id": "neobrutalism",
    "label": "Neobrutalism",
    "category": "Styles",
    "colors": [
      "#fef9ef",
      "#ffffff",
      "#1a1a1a",
      "#6b7280",
      "#ff6b6b"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Neobrutalism is the playful evolution of brutalism. Cream or pastel canvas, chunky offset box-shadows (4px 4px 0 or 6px 6px 0 solid black), thick outlines, saturated fill colors. It feels more dimensional and retro-moder...",
    "prompt": "Use the bundled Neobrutalism design-system markdown as the source of truth. Neobrutalism is the playful evolution of brutalism. Cream or pastel canvas, chunky offset box-shadows (4px 4px 0 or 6px 6px 0 solid black), thick outlines, saturated fill colors. It feels more dimensional and retro-modern than pure neo-brutal - the shadows create a sticker-like, pressable quality. High contrast but with personality. *Key Characteristics:** Bold typography with some warmth - not all-caps always Saturated fill (any accent color) | 2px solid #1a1a1a border | 4px radius DO: Offset solid box-shadow everywhere | Saturated accent fills | 2px solid borders | 8px radius DO NOT: Blur in shadows | Single neutral palette | Zero radius (that's Neo Brutal, not Neobrutalism) Preserve documented text/background contrast and component rules."
  },
  {
    "id": "retro-80s",
    "label": "Retro 80s",
    "category": "Styles",
    "colors": [
      "#1a0028",
      "#1a1a1a",
      "#ff00aa",
      "#a3a3a3",
      "#00ffff"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Retro 80s is synthwave nostalgia translated to digital UI. Deep magenta-black canvas (#1a0028) with hot pink (#ff00aa) and electric cyan (#00ffff) neons. VHS aesthetics, scanline textures, chromatic aberration, and pixel...",
    "prompt": "Use the bundled Retro 80s design-system markdown as the source of truth. *Key Characteristics:** Transparent bg | 2px solid #ff00aa border | color #ff00aa Heavy use of negative space (dark void) | Neon elements as focal points DO: Neon glows on all interactive elements | Scanline texture | Perspective grid | CRT aesthetic DO NOT: Warm tones | Light backgrounds | Soft shadows | Decorative pastels Glow recipe: text-shadow 0 0 10px + 0 0 20px + 0 0 40px (same color) Preserve documented text/background contrast and component rules."
  },
  {
    "id": "warmth-organic",
    "label": "Warmth Organic",
    "category": "Styles",
    "colors": [
      "#f5e6d0",
      "#ffffff",
      "#2d5016",
      "#6b7280",
      "#2a1f14"
    ],
    "displayFont": "Inter, system-ui, sans-serif",
    "bodyFont": "Inter, system-ui, sans-serif",
    "summary": "Warmth & Organic is the design language of handcrafted, natural brands. Warm sand (#f5e6d0) canvas with terracotta (#b5541c) and forest green (#2d5016) creating an earthy palette. Natural textures (subtle noise or grain)...",
    "prompt": "Use the bundled Warmth Organic design-system markdown as the source of truth. Warmth & Organic is the design language of handcrafted, natural brands. Warm sand (#f5e6d0) canvas with terracotta (#b5541c) and forest green (#2d5016) creating an earthy palette. Natural textures (subtle noise or grain), organic rounded shapes, and serif typography (Lora, Fraunces) communicate authenticity, craft, and connection to the natural world. *Key Characteristics:** Warm sand (#f5e6d0) canvas - the color of natural linen background: #b5541c | color: #ffffff | border-radius: 999px (pill) | padding: 14px 32px transparent | border: 2px solid #b5541c | color: #b5541c | pill radius DO: Warm sand canvas | Terracotta and forest green | Organic shapes (blobs, waves) | Serif display DO: Grain texture overlay | Pill buttons | Natural photography with warm tones DO NOT: Cool grays | Sharp corners | Flat blue accent | Tech-looking layouts Preserve documented text/background contrast and component rules."
  }
]

export type BundledDesignSystemPreset = (typeof DESIGN_SYSTEM_PRESETS)[number]
