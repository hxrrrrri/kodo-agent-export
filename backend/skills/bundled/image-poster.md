---
name: image-poster
description: Single AI-generated image for posters, key art, avatars, and infographic covers. Reads brief metadata, composes a detailed generation prompt, dispatches to image provider, and presents the result.
---

# Image Poster

Use this skill when the user wants a single AI-generated image — poster, key art, avatar, banner, infographic cover, or visual asset.

## Workflow

1. **Read the brief**: extract subject, mood, style, composition, color palette, aspect ratio, and intended use
2. **Compose the generation prompt**: detailed, provider-optimized image prompt (see format below)
3. **Dispatch**: call the active image generation tool with the composed prompt
4. **Present**: display the result with metadata and next-step options

## Prompt Composition Rules

A good image generation prompt contains these elements in order:

```
[subject description], [composition/framing], [lighting], [color palette], 
[style/aesthetic], [mood/atmosphere], [technical quality markers]
```

**Example (poster):**
> Minimalist product poster, centered composition with generous white space, 
> split-tone lighting from upper left, monochrome palette with single deep red 
> accent on the product, graphic design aesthetic inspired by Swiss style, 
> confident and premium mood, ultra-high resolution, sharp details

## Aspect Ratio Rules

Match the `imageAspect` parameter exactly:

| Use Case | Ratio | Size |
|----------|-------|------|
| Square post | 1:1 | 1024×1024 |
| Portrait poster | 2:3 | 1024×1536 |
| Landscape banner | 16:9 | 1792×1024 |
| Story/Reel | 9:16 | 1024×1792 |
| Avatar | 1:1 | 512×512 |

Never generate at wrong aspect ratio and crop — always specify the right ratio upfront.

## Style Vocabulary

Use precise style terms that image models understand:

**Photography styles**: cinematic still, editorial fashion, documentary, product photography, aerial
**Illustration styles**: flat vector, isometric, hand-drawn ink, watercolor, risograph, pixel art
**Graphic design styles**: Swiss/International, Bauhaus, Art Deco, brutalist poster, 80s retro
**Mood terms**: moody, ethereal, vibrant, stark, warm and intimate, cold and clinical

## One Image Per Turn

Generate exactly one image per request unless the user explicitly asks for variations. For variations, generate 2–3 options in sequence with clear labels.

## Provider Support

The skill works with any provider wired to the image generation tool:
- OpenAI DALL-E 3 / gpt-image-2
- Stability AI Flux
- Google Imagen
- xAI Grok

Use the active provider's tool — do not hardcode a specific one.

## Output Format

Present the generated image in the artifact panel with:
- The composed prompt (collapsed, expandable)
- Aspect ratio and dimensions
- Options: regenerate, create variation, download
