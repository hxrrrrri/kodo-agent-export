import {
  useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react'
import {
  Monitor, Tablet, Smartphone, Download, RefreshCw,
  Upload, Send, Trash2, Eye, Code, File as FileIcon,
  ExternalLink, Wand2, SplitSquareHorizontal, Maximize2,
  Minimize2, ChevronRight, ChevronDown, RotateCcw, Copy,
  MessageSquare, Share2, Package, Printer, Save,
  Folder, FolderOpen, Loader, ArrowLeft, Square, CheckSquare,
  StopCircle, Pencil, Plus, Clock,
} from 'lucide-react'
import { buildApiHeaders } from '../lib/api'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import JSZip from 'jszip'
import VisualWebEditorArtifact, { VisualEditorSourcePayload } from './VisualWebEditorArtifact'

const API = '/api/chat'
export const DESIGN_STUDIO_STORAGE_KEY = 'kodo.design-studio.state.v1'
const MAX_PERSISTED_MESSAGES = 40
const MAX_PERSISTED_HISTORY = 20
const MAX_PERSISTED_MESSAGE_FILE_CHARS = 200000

// ─── Types ──────────────────────────────────────────────────────────────────

type DeviceMode = 'desktop' | 'tablet' | 'mobile'
type ViewMode = 'preview' | 'code' | 'split' | 'editor'
type ShareAccess = 'view' | 'comment' | 'edit'
export type DesignMode = 'web' | 'app' | 'deck' | 'motion' | 'infographic' | 'critique'
type DesignFidelity = 'wireframe' | 'high-fidelity' | 'production'
type DesignDirection = 'auto' | 'editorial-monocle' | 'modern-minimal' | 'warm-soft' | 'tech-utility' | 'brutalist-experimental'
type DesignSurface =
  | 'auto'
  | 'saas-landing'
  | 'dashboard'
  | 'pricing'
  | 'docs'
  | 'blog'
  | 'commerce'
  | 'portfolio'
  | 'mobile-onboarding'
  | 'email'
  | 'social-carousel'
  | 'poster'
  | 'admin-tool'
type DesignMotion = 'none' | 'subtle' | 'expressive' | 'cinematic'
type DeviceFrame = 'auto' | 'none' | 'iphone-15-pro' | 'android-pixel' | 'ipad-pro' | 'macbook' | 'browser-chrome'
type ProjectCreateDraft = {
  name?: string
  mode?: DesignMode
  presetId?: string
  fidelity?: DesignFidelity
}

const DEVICE_WIDTHS: Record<DeviceMode, string> = {
  desktop: '100%', tablet: '768px', mobile: '390px',
}

const DEVICE_HEIGHTS: Record<DeviceMode, string | number> = {
  desktop: '100%', tablet: 700, mobile: 760,
}

const DESIGN_MODES: Record<DesignMode, {
  label: string
  shortLabel: string
  intent: string
  deliverable: string
  prompt: string
}> = {
  web: {
    label: 'Web Design',
    shortLabel: 'WEB',
    intent: 'high-fidelity websites, product pages, dashboards, landing pages, docs, portfolios, and commerce experiences',
    deliverable: 'responsive HTML/CSS/JS with polished desktop and mobile layouts',
    prompt: [
      'Build a complete responsive web experience.',
      'Design the first viewport around the actual product, offer, or workflow, not a generic marketing shell.',
      'Use clear information architecture, real copy, strong hierarchy, restrained motion, and meaningful interaction states.',
      'For SaaS or operational tools, prefer dense but organized UI over oversized hero cards.',
    ].join('\n'),
  },
  app: {
    label: 'App Prototype',
    shortLabel: 'APP',
    intent: 'clickable iOS, Android, tablet, and desktop app prototypes',
    deliverable: 'multi-screen prototype in one HTML file with real navigation state',
    prompt: [
      'Build a clickable app prototype, not a static poster.',
      'Include realistic device framing only when it helps the product story.',
      'Default to an overview board with 4-7 screens unless the user asks for one flow; each screen needs product-specific information density.',
      'Wire real interactions with stateful JavaScript: tab changes, screen transitions, toggles, filters, forms, and selected states.',
    ].join('\n'),
  },
  deck: {
    label: 'Slide Deck',
    shortLabel: 'DECK',
    intent: 'presentation decks, pitch decks, keynote-style narratives, and browser-presented slides',
    deliverable: '16:9 HTML deck with slide navigation, speaker notes, and export-friendly dimensions',
    prompt: [
      'Build an HTML slide deck, not a scrolling web page.',
      'Use 1920x1080 slide frames, varied slide archetypes, strong editorial rhythm, and large readable type.',
      'Include speaker notes in data attributes or hidden note panels so the deck can be presented.',
      'Use 1-indexed slide labels and keep each slide focused on one idea.',
    ].join('\n'),
  },
  motion: {
    label: 'Motion',
    shortLabel: 'MOTION',
    intent: 'HTML motion design, launch animations, explainer scenes, and short product videos',
    deliverable: 'time-based HTML animation with replay controls and recording-ready canvas/stage',
    prompt: [
      'Build a time-based motion piece with a clear beginning, middle, and ending.',
      'Define a visible timeline, scene phases, and replay controls.',
      'Use CSS variables and JavaScript timing helpers for consistent easing; prefer purposeful motion over constant movement.',
      'Every text beat must stay readable long enough to understand.',
    ].join('\n'),
  },
  infographic: {
    label: 'Infographic',
    shortLabel: 'INFO',
    intent: 'editorial infographics, data visualizations, explainers, reports, and print-grade visual systems',
    deliverable: 'single-page visual artifact with precise layout and export-friendly composition',
    prompt: [
      'Build a finished infographic, not a dashboard.',
      'Use a precise editorial grid, strong typographic contrast, labeled data, and a clear reading path.',
      'If data is missing, make assumptions explicit inside the artifact and use realistic placeholder values.',
      'Favor SVG charts and semantic labels over decorative icons.',
    ].join('\n'),
  },
  critique: {
    label: 'Critique',
    shortLabel: 'REVIEW',
    intent: 'expert review, design QA, accessibility audit, and redesign recommendations',
    deliverable: 'visual critique dashboard with scores, keep/fix list, and applied redesign proposal when possible',
    prompt: [
      'Produce a rigorous design critique artifact.',
      'Score the design on philosophy coherence, hierarchy, craft, usability, accessibility, and originality.',
      'Separate Keep, Fix, and Quick Wins, then include a concrete improved version or patch when source exists.',
      'Ground every critique in observable UI details rather than generic taste claims.',
    ].join('\n'),
  },
}

interface DesignSystemPreset {
  id: string
  label: string
  category: string
  colors: string[]
  displayFont: string
  bodyFont: string
  summary: string
  prompt: string
}

const DESIGN_SYSTEM_PRESETS: DesignSystemPreset[] = [
  {
    id: 'neutral-modern',
    label: 'Neutral Modern',
    category: 'Starter',
    colors: ['#fafafa', '#ffffff', '#111827', '#6b7280', '#2563eb'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Quiet modern software UI with clean spacing, strong hierarchy, and restrained blue accent.',
    prompt: 'Use neutral surfaces, compact hierarchy, hairline borders, practical product screenshots, and one restrained blue accent. Avoid decorative gradients.',
  },
  {
    id: 'claude-warm',
    label: 'Claude Warm Editorial',
    category: 'AI & LLM',
    colors: ['#f5f4ed', '#faf9f5', '#141413', '#5e5d59', '#c96442'],
    displayFont: 'Georgia, Iowan Old Style, serif',
    bodyFont: 'system-ui, -apple-system, Segoe UI, sans-serif',
    summary: 'Parchment canvas, serif headlines, terracotta accent, warm neutral editorial rhythm.',
    prompt: 'Use warm parchment backgrounds, Georgia-style serif display type, terracotta accent, warm neutrals only, soft ring borders, and essay-like section pacing. Avoid cool blue-gray palettes.',
  },
  {
    id: 'linear-minimal',
    label: 'Linear Minimal',
    category: 'Developer Tools',
    colors: ['#fbfbfc', '#ffffff', '#171717', '#737373', '#5e6ad2'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Precise product UI with crisp borders, compact typography, and one violet-blue accent.',
    prompt: 'Use tight software-native spacing, one saturated accent, subtle panels, status pills, keyboardable controls, and product-first composition. No oversized marketing illustrations.',
  },
  {
    id: 'vercel-mono',
    label: 'Vercel Mono',
    category: 'Developer Tools',
    colors: ['#ffffff', '#fafafa', '#000000', '#666666', '#000000'],
    displayFont: 'Geist, Inter, system-ui, sans-serif',
    bodyFont: 'Geist, Inter, system-ui, sans-serif',
    summary: 'Black-and-white developer aesthetic with strong type, command surfaces, and exact spacing.',
    prompt: 'Use monochrome surfaces, exact 1px borders, command-line and deployment metaphors, sharp contrast, and restrained interaction polish. Do not add color unless it communicates state.',
  },
  {
    id: 'stripe-gradient',
    label: 'Stripe Product',
    category: 'Fintech',
    colors: ['#f6f9fc', '#ffffff', '#0a2540', '#425466', '#635bff'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Fintech polish with layered product surfaces, careful gradients, and data-rich UI.',
    prompt: 'Use financial-product clarity, layered cards, precise data examples, rich but controlled gradients, diagonal rhythm when useful, and trust-building copy.',
  },
  {
    id: 'apple-glass',
    label: 'Apple Glass',
    category: 'Consumer',
    colors: ['#f5f5f7', '#ffffff', '#1d1d1f', '#6e6e73', '#0071e3'],
    displayFont: 'SF Pro Display, system-ui, sans-serif',
    bodyFont: 'SF Pro Text, system-ui, sans-serif',
    summary: 'Premium consumer layout with large product imagery, calm surfaces, and cinematic pacing.',
    prompt: 'Use product-first hero composition, large clear media, calm gray surfaces, precise copy, generous whitespace, and restrained blue CTAs. No fake device renders.',
  },
  {
    id: 'airbnb-warm',
    label: 'Airbnb Warm',
    category: 'Marketplace',
    colors: ['#fff8f6', '#ffffff', '#222222', '#717171', '#ff385c'],
    displayFont: 'Circular, Inter, system-ui, sans-serif',
    bodyFont: 'Circular, Inter, system-ui, sans-serif',
    summary: 'Human marketplace UI with warm cards, photography-forward layout, and friendly interactions.',
    prompt: 'Use human-centered copy, warm whitespace, photography-led cards, rounded but disciplined controls, and clear booking/filter interactions.',
  },
  {
    id: 'notion-editorial',
    label: 'Notion Editorial',
    category: 'Productivity',
    colors: ['#fbfbfa', '#ffffff', '#2f3437', '#787774', '#2383e2'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Document-native product design with database cues, blocks, and quiet utility.',
    prompt: 'Use document blocks, database rows, calm neutral surfaces, sparse icons, and content hierarchy that feels editable and structured.',
  },
  {
    id: 'supabase-dev',
    label: 'Supabase Dev',
    category: 'Backend & Data',
    colors: ['#0f1512', '#151f1a', '#f8fafc', '#8b949e', '#3ecf8e'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Dark developer dashboard with database objects, green signal color, and terminal confidence.',
    prompt: 'Use dark database-native UI, green success accents, schema/table metaphors, code snippets, tabular density, and clear developer onboarding flow.',
  },
  {
    id: 'figma-creative',
    label: 'Figma Creative',
    category: 'Design Tools',
    colors: ['#ffffff', '#f5f5f5', '#1f1f1f', '#6b7280', '#a259ff'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Creative tool surface with palettes, layers, collaborative cursors, and expressive controls.',
    prompt: 'Use canvas metaphors, layer panels, swatches, selection outlines, collaborative presence, and playful but purposeful accent use.',
  },
  {
    id: 'github-utility',
    label: 'GitHub Utility',
    category: 'Developer Tools',
    colors: ['#0d1117', '#161b22', '#f0f6fc', '#8b949e', '#2f81f7'],
    displayFont: 'system-ui, -apple-system, Segoe UI, sans-serif',
    bodyFont: 'system-ui, -apple-system, Segoe UI, sans-serif',
    summary: 'Dense engineering UI with repos, diffs, checks, issues, and exact state treatment.',
    prompt: 'Use dense engineering information, diff/check/status patterns, tabular lists, issue labels, monospace code, and exact empty/error states.',
  },
  {
    id: 'shopify-commerce',
    label: 'Shopify Commerce',
    category: 'Commerce',
    colors: ['#f3f6ef', '#ffffff', '#1f2d1f', '#60705c', '#008060'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Merchant-first commerce system with trustworthy green accents and operational panels.',
    prompt: 'Use merchant operations language, commerce metrics, product grids, inventory/order states, trustworthy green accents, and practical workflow density.',
  },
  {
    id: 'magazine-bold',
    label: 'Magazine Bold',
    category: 'Editorial',
    colors: ['#f8f1e8', '#fffaf2', '#111111', '#6a5b4f', '#d13f22'],
    displayFont: 'Georgia, Times New Roman, serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Large serif headlines, editorial spreads, pull quotes, and strong visual pacing.',
    prompt: 'Use magazine spread composition, oversized serif headlines, pull quotes, asymmetric columns, captions, and one decisive image or data figure.',
  },
  {
    id: 'neo-brutal',
    label: 'Neo Brutal',
    category: 'Experimental',
    colors: ['#fffdf2', '#ffffff', '#111111', '#333333', '#ff4d00'],
    displayFont: 'Arial Black, Impact, system-ui, sans-serif',
    bodyFont: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    summary: 'Hard borders, loud type, minimal radius, and intentionally assertive composition.',
    prompt: 'Use strong black borders, almost no radius, loud display type, asymmetric grids, visible structure, and one hot accent. No soft shadows or glass.',
  },
  {
    id: 'luxury-premium',
    label: 'Luxury Premium',
    category: 'Luxury',
    colors: ['#0b0a08', '#17130f', '#f7efe4', '#b7a58d', '#c8a45d'],
    displayFont: 'Didot, Bodoni 72, Georgia, serif',
    bodyFont: 'Avenir Next, Inter, system-ui, sans-serif',
    summary: 'Dark premium surfaces, refined serif type, gold restraint, and high-end spacing.',
    prompt: 'Use dark premium surfaces, elegant serif display type, gold used sparingly, cinematic product focus, and restrained copy. Avoid busy card grids.',
  },
  {
    id: 'japanese-minimal',
    label: 'Japanese Minimal',
    category: 'Editorial',
    colors: ['#f7f3ea', '#fffdf8', '#20201d', '#706a60', '#9b2c1f'],
    displayFont: 'Hiragino Mincho ProN, Yu Mincho, Georgia, serif',
    bodyFont: 'system-ui, -apple-system, Segoe UI, sans-serif',
    summary: 'Quiet asymmetry, paper texture cues, sparse accents, and refined negative space.',
    prompt: 'Use asymmetry, quiet paper-like surfaces, sparse warm accent, calm vertical rhythm, and labels/captions that feel typeset rather than decorated.',
  },
  {
    id: 'cyberpunk-neon',
    label: 'Cyberpunk Neon',
    category: 'Futuristic',
    colors: ['#070812', '#111827', '#e5faff', '#7dd3fc', '#00f5d4'],
    displayFont: 'Orbitron, Rajdhani, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Futuristic panels, neon accents, kinetic data, and dark sci-fi atmosphere.',
    prompt: 'Use neon accents with restraint, dark high-contrast panels, scanline or HUD motifs only when useful, kinetic data modules, and cinematic lighting. Avoid generic purple gradients.',
  },
  {
    id: 'openai-research',
    label: 'OpenAI Research',
    category: 'AI & LLM',
    colors: ['#f7f7f2', '#ffffff', '#111111', '#6b6962', '#10a37f'],
    displayFont: 'Sohne, Inter, system-ui, sans-serif',
    bodyFont: 'Sohne, Inter, system-ui, sans-serif',
    summary: 'Research-product clarity with quiet neutrals, confident copy, and minimal green signal.',
    prompt: 'Use research-lab restraint, clean prose, neutral layouts, sparse green accents, careful diagrams, and accessible product examples. Avoid sci-fi AI cliches.',
  },
  {
    id: 'anthropic-editorial',
    label: 'Anthropic Editorial',
    category: 'AI & LLM',
    colors: ['#f3efe7', '#fbfaf7', '#191714', '#6f6860', '#d97757'],
    displayFont: 'Tiempos, Georgia, serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Warm research editorial with serif scale, measured spacing, and muted clay accent.',
    prompt: 'Use warm paper surfaces, serif-led hierarchy, calm product framing, measured copy, and clay accents. Keep the layout humane and not dashboard-heavy.',
  },
  {
    id: 'cursor-agentic',
    label: 'Cursor Agentic',
    category: 'Developer Tools',
    colors: ['#0c0d10', '#15171c', '#f4f4f5', '#9ca3af', '#7c3aed'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'JetBrains Mono, ui-monospace, monospace',
    summary: 'Coding-agent workbench with command surfaces, diffs, composer states, and purple signal.',
    prompt: 'Use developer-agent UI patterns: editors, diffs, command bars, file trees, context chips, and precise status feedback. Purple is a signal, not a background wash.',
  },
  {
    id: 'raycast-command',
    label: 'Raycast Command',
    category: 'Productivity',
    colors: ['#111113', '#1c1c21', '#f5f5f7', '#a1a1aa', '#ff6363'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Fast command-center UI with keyboard-first lists, hotkeys, and crisp dark surfaces.',
    prompt: 'Use command palette structure, keyboard hints, dense list rows, crisp icons, strong empty states, and fast interaction affordances.',
  },
  {
    id: 'webflow-creator',
    label: 'Webflow Creator',
    category: 'Design Tools',
    colors: ['#0b0d18', '#111827', '#f8fafc', '#94a3b8', '#4353ff'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Creator-platform polish with canvas, component panels, site previews, and blue energy.',
    prompt: 'Use creator-tool patterns: canvas previews, component controls, publishing states, responsive breakpoints, and practical visual polish.',
  },
  {
    id: 'canva-playful',
    label: 'Canva Playful',
    category: 'Design Tools',
    colors: ['#f8fbff', '#ffffff', '#1f2937', '#64748b', '#00c4cc'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Accessible creative workspace with friendly color, template grids, and approachable controls.',
    prompt: 'Use template-first creative UI, friendly controls, colorful accents, approachable language, and clear preview/edit affordances. Keep it structured, not childish.',
  },
  {
    id: 'miro-workshop',
    label: 'Miro Workshop',
    category: 'Collaboration',
    colors: ['#fff8d8', '#ffffff', '#1f2937', '#6b7280', '#ffd02f'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Collaborative board energy with sticky-note semantics, workshop flows, and yellow accent.',
    prompt: 'Use board/collaboration metaphors, sticky notes, voting, cursors, facilitation controls, and optimistic yellow accents with disciplined layout.',
  },
  {
    id: 'framer-motion',
    label: 'Framer Motion',
    category: 'Design Tools',
    colors: ['#050506', '#111116', '#f6f7fb', '#9ca3af', '#0099ff'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'High-motion creator site aesthetic with crisp dark canvas and blue interaction cues.',
    prompt: 'Use motion-aware composition, timeline/state metaphors, sharp product previews, and precise interaction copy. Avoid animated clutter.',
  },
  {
    id: 'spotify-audio',
    label: 'Spotify Audio',
    category: 'Media',
    colors: ['#0b0b0b', '#181818', '#ffffff', '#b3b3b3', '#1db954'],
    displayFont: 'Circular, Inter, system-ui, sans-serif',
    bodyFont: 'Circular, Inter, system-ui, sans-serif',
    summary: 'Audio-first dark interface with strong playlists, media rows, and green playback signal.',
    prompt: 'Use audio/media hierarchy, album grids, playback controls, queue states, dark surfaces, and green only for active listening or primary action.',
  },
  {
    id: 'pinterest-discovery',
    label: 'Pinterest Discovery',
    category: 'Social & Media',
    colors: ['#ffffff', '#f7f7f7', '#111111', '#767676', '#e60023'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Visual discovery grids with masonry rhythm, save flows, and decisive red actions.',
    prompt: 'Use masonry/image discovery, intent chips, save/share states, visual-first cards, and concise overlays. Avoid generic symmetrical card grids.',
  },
  {
    id: 'nike-performance',
    label: 'Nike Performance',
    category: 'Consumer',
    colors: ['#f5f5f5', '#ffffff', '#111111', '#666666', '#fa5400'],
    displayFont: 'Helvetica Neue, Arial Black, system-ui, sans-serif',
    bodyFont: 'Helvetica Neue, Inter, system-ui, sans-serif',
    summary: 'Performance retail with bold type, product motion, and high-contrast orange energy.',
    prompt: 'Use athlete/product-first imagery, bold type, confident contrast, product specs, drops, and motion cues. Keep CTAs hard-working and direct.',
  },
  {
    id: 'tesla-product',
    label: 'Tesla Product',
    category: 'Automotive',
    colors: ['#f4f4f4', '#ffffff', '#171a20', '#5c5e62', '#e82127'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Minimal automotive product storytelling with clean specs and direct purchase flows.',
    prompt: 'Use product-first composition, specs, configurator states, clean photo zones, and restrained red for action/status. Avoid decorative car cliches.',
  },
  {
    id: 'bmw-premium',
    label: 'BMW Premium',
    category: 'Automotive',
    colors: ['#f6f7f8', '#ffffff', '#101820', '#6b7280', '#1c69d4'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Premium mobility UI with precision grids, cool neutrals, and confident blue.',
    prompt: 'Use premium automotive restraint, clear configurator/state flows, technical specs, immersive media, and precise blue accents.',
  },
  {
    id: 'nvidia-ai',
    label: 'NVIDIA AI',
    category: 'Enterprise AI',
    colors: ['#0b0f0a', '#111a10', '#f7fee7', '#9ca3af', '#76b900'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'AI infrastructure design with black-green contrast, technical diagrams, and enterprise trust.',
    prompt: 'Use technical diagrams, GPU/infrastructure metaphors, enterprise proof, dark surfaces, and green as a performance signal.',
  },
  {
    id: 'ibm-carbon',
    label: 'IBM Carbon',
    category: 'Enterprise',
    colors: ['#f4f4f4', '#ffffff', '#161616', '#6f6f6f', '#0f62fe'],
    displayFont: 'IBM Plex Sans, Inter, system-ui, sans-serif',
    bodyFont: 'IBM Plex Sans, Inter, system-ui, sans-serif',
    summary: 'Enterprise grid discipline with Carbon-like spacing, data density, and blue action states.',
    prompt: 'Use enterprise information architecture, strong grid, data tables, precise forms, accessibility-first states, and IBM Plex-style type rhythm.',
  },
  {
    id: 'material-google',
    label: 'Google Material',
    category: 'Platform',
    colors: ['#f8fafd', '#ffffff', '#1f1f1f', '#5f6368', '#1a73e8'],
    displayFont: 'Google Sans, Roboto, system-ui, sans-serif',
    bodyFont: 'Roboto, Inter, system-ui, sans-serif',
    summary: 'Material-style product UI with clear elevation, system components, and blue primary actions.',
    prompt: 'Use Material interaction states, clear elevation hierarchy, accessible forms, navigation rails, and practical Google-style system behavior.',
  },
  {
    id: 'microsoft-fluent',
    label: 'Microsoft Fluent',
    category: 'Platform',
    colors: ['#f5f5f5', '#ffffff', '#1b1a19', '#605e5c', '#0078d4'],
    displayFont: 'Segoe UI, Inter, system-ui, sans-serif',
    bodyFont: 'Segoe UI, Inter, system-ui, sans-serif',
    summary: 'Fluent productivity UI with panes, ribbons, command bars, and enterprise blue.',
    prompt: 'Use productivity panes, command bars, contextual menus, dense tables, accessible focus states, and Fluent-style spacing.',
  },
  {
    id: 'atlassian-team',
    label: 'Atlassian Team',
    category: 'Collaboration',
    colors: ['#f7f8f9', '#ffffff', '#172b4d', '#626f86', '#0c66e4'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Team software UI with work items, boards, status colors, and practical hierarchy.',
    prompt: 'Use work-management flows, boards, issue states, breadcrumbs, compact lists, and sensible team collaboration affordances.',
  },
  {
    id: 'mailchimp-friendly',
    label: 'Mailchimp Friendly',
    category: 'Marketing',
    colors: ['#ffe01b', '#fff8dc', '#241c15', '#6b5d4d', '#007c89'],
    displayFont: 'Cooper Black, Georgia, serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Friendly marketing tooling with yellow identity, playful serif type, and practical campaign UI.',
    prompt: 'Use campaign-builder patterns, friendly copy, warm yellow accents, helpful empty states, and tasteful illustration only when it supports workflow.',
  },
  {
    id: 'dropbox-work',
    label: 'Dropbox Work',
    category: 'Productivity',
    colors: ['#f7f5f2', '#ffffff', '#1e1919', '#736c64', '#0061ff'],
    displayFont: 'Sharp Grotesk, Inter, system-ui, sans-serif',
    bodyFont: 'Atlas Grotesk, Inter, system-ui, sans-serif',
    summary: 'File/workspace system with crisp blue actions, organized content, and collaboration details.',
    prompt: 'Use file/workspace metaphors, sharing permissions, previews, folders, collaboration status, and crisp blue primary actions.',
  },
  {
    id: 'wise-fintech',
    label: 'Wise Fintech',
    category: 'Fintech',
    colors: ['#f5f6ef', '#ffffff', '#163300', '#51624a', '#9fe870'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Money-transfer clarity with lime action, transparent comparisons, and trust-first copy.',
    prompt: 'Use transparent pricing/comparison modules, calculator controls, trust cues, lime as primary action, and no vague financial claims.',
  },
  {
    id: 'revolut-finance',
    label: 'Revolut Finance',
    category: 'Fintech',
    colors: ['#f7f7fb', '#ffffff', '#101828', '#667085', '#191cff'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Consumer finance app polish with cards, balances, security, and confident blue.',
    prompt: 'Use banking/card flows, balance states, transaction lists, security cues, and confident app-first product presentation.',
  },
  {
    id: 'coinbase-crypto',
    label: 'Coinbase Crypto',
    category: 'Fintech',
    colors: ['#f7f8fa', '#ffffff', '#0a0b0d', '#5b616e', '#0052ff'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Crypto-finance clarity with asset tables, portfolio states, and strict blue trust.',
    prompt: 'Use asset tables, portfolio cards, price deltas, verification states, compliance copy, and restrained blue action patterns.',
  },
  {
    id: 'duolingo-playful',
    label: 'Duolingo Playful',
    category: 'Education',
    colors: ['#f7fff0', '#ffffff', '#1f2937', '#6b7280', '#58cc02'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Learning app energy with progress loops, achievements, and friendly green feedback.',
    prompt: 'Use lesson/progress loops, streaks, levels, friendly microcopy, and green success states. Keep the interface usable for real learning.',
  },
  {
    id: 'theverge-editorial',
    label: 'The Verge Editorial',
    category: 'Editorial',
    colors: ['#0b0b0f', '#17171f', '#ffffff', '#a1a1aa', '#e2127a'],
    displayFont: 'Georgia, Times New Roman, serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Tech publication energy with bold editorial rhythm, dark contrast, and hot magenta.',
    prompt: 'Use editorial tech-magazine hierarchy, strong headlines, issue/date metadata, media modules, and hot accent sparingly.',
  },
  {
    id: 'wired-magazine',
    label: 'WIRED Magazine',
    category: 'Editorial',
    colors: ['#f5f2ec', '#ffffff', '#111111', '#555555', '#e31b23'],
    displayFont: 'Helvetica Neue, Arial Black, system-ui, sans-serif',
    bodyFont: 'Georgia, Times New Roman, serif',
    summary: 'High-contrast magazine system with bold covers, red rules, and analytical storytelling.',
    prompt: 'Use magazine cover/spread discipline, bold headline locks, captions, red rules, and strong article packaging.',
  },
  {
    id: 'runwayml-cinematic',
    label: 'Runway Cinematic',
    category: 'Media AI',
    colors: ['#050505', '#111111', '#f5f5f5', '#8a8a8a', '#d7ff5f'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Cinematic AI creation UI with black canvas, timeline controls, and acid highlight.',
    prompt: 'Use cinematic media creation patterns, timelines, prompt controls, gallery previews, render states, and neon-lime accents with restraint.',
  },
  {
    id: 'huggingface-community',
    label: 'Hugging Face Community',
    category: 'AI & LLM',
    colors: ['#fff8e7', '#ffffff', '#1f2937', '#6b7280', '#ffcc4d'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Open AI community UI with model cards, datasets, approachable yellow, and technical metadata.',
    prompt: 'Use model/dataset cards, community metadata, benchmarks, tabs, tags, and approachable yellow accents without turning technical content into cartoons.',
  },
  {
    id: 'posthog-analytics',
    label: 'PostHog Analytics',
    category: 'Analytics',
    colors: ['#fff7ed', '#ffffff', '#1c1917', '#78716c', '#f97316'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Product analytics with event pipelines, charts, feature flags, and orange builder energy.',
    prompt: 'Use analytics dashboards, event streams, funnels, flags, compact charts, and orange as a product-builder signal.',
  },
  {
    id: 'sentry-ops',
    label: 'Sentry Ops',
    category: 'Developer Tools',
    colors: ['#120f1f', '#1d1830', '#f8fafc', '#a8a3b8', '#6f42c1'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Observability UI with issues, traces, releases, severity, and pragmatic dark panels.',
    prompt: 'Use observability patterns, error grouping, traces, releases, severity badges, and operational workflows with clear escalation paths.',
  },
  {
    id: 'mintlify-docs',
    label: 'Mintlify Docs',
    category: 'Developer Docs',
    colors: ['#f8fafc', '#ffffff', '#0f172a', '#64748b', '#16a34a'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Modern developer docs with sidebar IA, code tabs, API examples, and green freshness.',
    prompt: 'Use docs-native layout, search, sidebar navigation, code tabs, API examples, callouts, and responsive reading surfaces.',
  },
  {
    id: 'resend-email',
    label: 'Resend Email',
    category: 'Developer Tools',
    colors: ['#fafafa', '#ffffff', '#111111', '#737373', '#000000'],
    displayFont: 'Geist, Inter, system-ui, sans-serif',
    bodyFont: 'Geist, Inter, system-ui, sans-serif',
    summary: 'Email infrastructure minimalism with black-white precision, logs, and deliverability states.',
    prompt: 'Use email developer patterns, logs, DNS records, API snippets, delivery states, and black-white minimal precision.',
  },
  {
    id: 'shadcn-system',
    label: 'shadcn System',
    category: 'Component Systems',
    colors: ['#fafafa', '#ffffff', '#09090b', '#71717a', '#18181b'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    summary: 'Composable component library style with neutral tokens, slots, variants, and exact states.',
    prompt: 'Use component-system thinking, variants, tokens, neutral surfaces, crisp controls, accessible focus rings, and copy that feels implementation-ready.',
  },
  {
    id: 'xiaohongshu-social',
    label: 'Xiaohongshu Social',
    category: 'Social & Commerce',
    colors: ['#ffffff', '#f5f5f5', '#303034', '#8a8a8f', '#ff2442'],
    displayFont: 'PingFang SC, Inter, system-ui, sans-serif',
    bodyFont: 'PingFang SC, Inter, system-ui, sans-serif',
    summary: 'Lifestyle social commerce with white canvas, red engagement states, and image-led feeds.',
    prompt: 'Use image-led social commerce, tabs, engagement states, creator metadata, clean white surfaces, and red only for active/action states.',
  },
]

const DESIGN_DIRECTIONS: Record<DesignDirection, {
  label: string
  summary: string
  colors: string[]
  displayFont: string
  bodyFont: string
  references: string[]
  prompt: string
}> = {
  auto: {
    label: 'Auto',
    summary: 'Let Kodo choose based on the brief and selected design system.',
    colors: ['#6366f1', '#06b6d4', '#111827'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    references: ['Brief-led', 'Best fit', '3 directions'],
    prompt: 'Choose the most fitting direction from the brief and design system. If the brief is vague, show three distinct directions before committing.',
  },
  'editorial-monocle': {
    label: 'Editorial Monocle',
    summary: 'Print-magazine hierarchy, serif display, borders, and restrained warm accent.',
    colors: ['#f7f1e7', '#ffffff', '#211f1a', '#b4532d'],
    displayFont: 'Georgia, Iowan Old Style, serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    references: ['Monocle', 'The Financial Times', 'NYT Magazine'],
    prompt: 'Use magazine-like pacing, serif display type, one warm accent, visible editorial structure, captions, pull quotes, and confident whitespace.',
  },
  'modern-minimal': {
    label: 'Modern Minimal',
    summary: 'Linear/Vercel-like precision with monochrome surfaces and one clear accent.',
    colors: ['#ffffff', '#f8fafc', '#111827', '#4f46e5'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    references: ['Linear', 'Vercel', 'Notion 2024'],
    prompt: 'Use precise software-native spacing, hairline borders, minimal chrome, compact UI, and one saturated accent for action/state only.',
  },
  'warm-soft': {
    label: 'Warm Soft',
    summary: 'Cream surfaces, gentle radii, serif-led warmth, and human product language.',
    colors: ['#fbf4ea', '#fffaf3', '#271f1b', '#c75f3f'],
    displayFont: 'Georgia, Iowan Old Style, serif',
    bodyFont: 'system-ui, -apple-system, Segoe UI, sans-serif',
    references: ['Stripe pre-2020', 'Headspace', 'Claude'],
    prompt: 'Use warm cream surfaces, soft corners, friendly editorial rhythm, gentle accents, and product imagery or honest placeholders.',
  },
  'tech-utility': {
    label: 'Tech Utility',
    summary: 'Dense engineering UI with tables, states, code, charts, and tabular numerics.',
    colors: ['#f8fafc', '#ffffff', '#111827', '#16a34a'],
    displayFont: 'Inter, system-ui, sans-serif',
    bodyFont: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    references: ['GitHub', 'Supabase', 'Sentry'],
    prompt: 'Use dense but organized information, tabular numerics, status pills, code/terminal blocks, tight controls, and utility-first hierarchy.',
  },
  'brutalist-experimental': {
    label: 'Brutalist Experimental',
    summary: 'Hard borders, oversized type, asymmetric grid, and deliberate edge.',
    colors: ['#fffdf2', '#ffffff', '#111111', '#ff3b00'],
    displayFont: 'Arial Black, Impact, system-ui, sans-serif',
    bodyFont: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    references: ['Brutalist web', 'MSCHF', 'Are.na'],
    prompt: 'Use strong borders, minimal radius, oversized type, asymmetric layout, visible grid, underlined links, and almost no shadows.',
  },
}

const DESIGN_SURFACES: Record<DesignSurface, string> = {
  auto: 'Infer the best surface from the user brief.',
  'saas-landing': 'SaaS/product landing page with product-first hero, features, proof, pricing or CTA.',
  dashboard: 'Analytics or admin dashboard with high information density, filters, charts, tables, and states.',
  pricing: 'Standalone pricing and plan comparison with billing toggles, proof, FAQs, and conversion focus.',
  docs: 'Documentation page with navigation, search, code samples, content hierarchy, and developer trust.',
  blog: 'Editorial article or publication layout with reading rhythm, pull quotes, media, and author metadata.',
  commerce: 'Commerce experience with product grid/detail, filters, cart states, trust signals, and checkout cues.',
  portfolio: 'Portfolio or personal site with work samples, credibility, case studies, and contact path.',
  'mobile-onboarding': 'Mobile onboarding flow with multiple screens, progress, CTAs, and realistic app state.',
  email: 'Email marketing artifact with table-safe mental model, single-column hierarchy, hero, CTA, and footer.',
  'social-carousel': 'Social carousel with multiple square cards, connected narrative, and platform-ready composition.',
  poster: 'Poster or campaign visual with strong typographic lockup and print-ready composition.',
  'admin-tool': 'Operational tool UI with side navigation, dense lists, workflows, empty/error/loading states.',
}

const FIDELITY_PROMPTS: Record<DesignFidelity, string> = {
  wireframe: 'Work as a wireframe/structure pass: grayscale, labeled blocks, honest placeholders, clear flow, minimal decoration, fast feedback.',
  'high-fidelity': 'Work as a high-fidelity design pass: polished type, layout, real copy, responsive states, accessible contrast, and production-quality visual decisions.',
  production: 'Work as a production-polish pass: implementation-ready HTML/CSS/JS, precise spacing, interaction states, performance-conscious motion, and a final QA pass.',
}

const MOTION_PROMPTS: Record<DesignMotion, string> = {
  none: 'Use no decorative animation; include only necessary UI state transitions.',
  subtle: 'Use subtle motion for hover, focus, reveal, and state changes; keep it restrained and accessible.',
  expressive: 'Use expressive micro-interactions and section transitions that reinforce the product story.',
  cinematic: 'Use staged, timeline-aware motion and replay controls when appropriate; maintain readability and reduce-motion fallback.',
}

const DEVICE_FRAME_PROMPTS: Record<DeviceFrame, string> = {
  auto: 'Use a device frame only when it improves the artifact.',
  none: 'Do not wrap the design in a device frame.',
  'iphone-15-pro': 'For mobile previews, show an iPhone 15 Pro-style frame with Dynamic Island, status bar, rounded screen, and home indicator.',
  'android-pixel': 'For mobile previews, show an Android Pixel-style frame with punch-hole camera and Android navigation affordance.',
  'ipad-pro': 'For tablet previews, show an iPad Pro-style frame and tablet-appropriate layout density.',
  macbook: 'For desktop app previews, show a MacBook-style frame only if showcasing product screens.',
  'browser-chrome': 'For website previews, use a browser chrome frame only when presenting a screenshot-style showcase.',
}

function normalizeDesignMode(value: unknown): DesignMode {
  return value === 'app' || value === 'deck' || value === 'motion' || value === 'infographic' || value === 'critique'
    ? value
    : 'web'
}

export function buildKodoDesignModePrompt(mode: DesignMode): string {
  const def = DESIGN_MODES[mode]
  return [
    `Kodo Design Mode: ${def.label}`,
    `Intent: ${def.intent}.`,
    `Expected deliverable: ${def.deliverable}.`,
    '',
    'Universal creative rules:',
    '- Work like a senior product designer using HTML as the production medium.',
    '- Start from existing context: uploaded screenshots, code, brand rules, product facts, and user constraints outrank generic intuition.',
    '- If a specific brand, product, person, technology, release, or current fact is mentioned, use available web/search tools before making factual claims.',
    '- For branded work, use a core asset protocol: logo, product images, UI screenshots, colors, fonts, and source links. If assets are missing, state assumptions inside the artifact and design honest placeholders instead of fake product silhouettes.',
    '- If the brief is vague, generate three meaningfully different design directions in the artifact, each with a short rationale and a clear recommendation.',
    '- Avoid AI-looking defaults: purple-blue hero gradients, emoji-as-icons, fake glass cards everywhere, generic SaaS blobs, random orbit decorations, lorem ipsum, stock-like dark blur backgrounds, and CSS-only fake product renders.',
    '- Use real content, concrete product-specific details, responsive constraints, accessible contrast, keyboard/focus states, and clear empty/error/loading states where relevant.',
    '- Every generated artifact must look deliberate enough to present to a design lead without apologizing for AI output.',
    '',
    'Mode-specific rules:',
    def.prompt,
  ].join('\n')
}

export interface DesignFile {
  id: string
  name: string
  language: string
  content: string
}

interface DesignMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  files?: DesignFile[]
}

interface UploadedAsset {
  id: string
  name: string
  size: number
  type: string
  dataUrl: string
  textContent?: string
}

interface HistoryEntry {
  files: DesignFile[]
  timestamp: number
  label?: string
}

interface InlineComment {
  id: string
  text: string
  xPct: number
  yPct: number
  createdAt: number
  resolved?: boolean
}

interface DesignSharePayload {
  version: number
  files: DesignFile[]
  selectedFileId: string | null
  viewMode: ViewMode
  device: DeviceMode
  inlineComments: InlineComment[]
  shareAccess: ShareAccess
}

interface PersistedDesignStudioState {
  messages: DesignMessage[]
  files: DesignFile[]
  selectedFileId: string | null
  history: HistoryEntry[]
  inlineComments: InlineComment[]
  projectContext: string
  designMode: DesignMode
  shareAccess: ShareAccess
  device: DeviceMode
  viewMode: ViewMode
  fileTreeW: number
  chatW: number
  splitCodeW: number
  fileTreeOpen: boolean
  expandedFolders: Record<string, boolean>
  updatedAt: number
}

export interface DesignFileTreeNode {
  type: 'folder' | 'file'
  name: string
  path: string
  file?: DesignFile
  children?: DesignFileTreeNode[]
}

interface DesignSystemConfig {
  brandName: string
  presetId: string
  fidelity: DesignFidelity
  direction: DesignDirection
  surface: DesignSurface
  motion: DesignMotion
  deviceFrame: DeviceFrame
  audience: string
  scale: string
  brandAssets: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  fontFamily: string
  borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'full'
  style: 'minimal' | 'material' | 'glassmorphism' | 'neumorphism' | 'brutalist'
  customRules: string
}

interface DesignProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  messages: DesignMessage[]
  files: DesignFile[]
  selectedFileId: string | null
  history: HistoryEntry[]
  inlineComments: InlineComment[]
  projectContext: string
  designMode: DesignMode
  shareAccess: ShareAccess
  device: DeviceMode
  viewMode: ViewMode
  fileTreeW: number
  chatW: number
  splitCodeW: number
  fileTreeOpen: boolean
  expandedFolders: Record<string, boolean>
}

interface ProjectSummary {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  fileNames: string[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function genId() { return Math.random().toString(36).slice(2, 11) }

function isHtmlLanguage(language: string): boolean {
  const normalized = language.trim().toLowerCase()
  return normalized === 'html' || normalized === 'htm'
}

function isHtmlFileName(fileName: string): boolean {
  const normalized = normalizeDesignPath(fileName).toLowerCase()
  return normalized.endsWith('.html') || normalized.endsWith('.htm')
}

function normalizeMalformedHtml(content: string): string {
  return content
    .replace(/<<(?=\s*[a-zA-Z!/])/g, '<')
    .replace(/<!DOCTYPEDOCTYPE/gi, '<!DOCTYPE')
    .replace(/<(?!\/)([a-zA-Z][a-zA-Z0-9-]{1,})(\1)(?=(?:\s|>|\/))/g, '<$1')
    .replace(/<\/(?:([a-zA-Z][a-zA-Z0-9-]{1,})(\1))(?=\s*>)/g, '</$1')
    .replace(/<(?!\/)(a|p|i|b|u|s|q)\1(?=(?:\s|>|\/))/gi, '<$1')
    .replace(/<\/(a|p|i|b|u|s|q)\1(?=\s*>)/gi, '</$1')
    .replace(/<(?!\/)hh([1-6])(?=(?:\s|>|\/))/gi, '<h$1')
    .replace(/<\/hh([1-6])(?=\s*>)/gi, '</h$1')
}

function sanitizeDesignFileContent(name: string, language: string, content: string): string {
  if (!isHtmlLanguage(language) && !isHtmlFileName(name)) {
    return content
  }
  return normalizeMalformedHtml(content)
}

function toDesignFile(value: unknown): DesignFile | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<DesignFile>
  const name = typeof candidate.name === 'string' ? normalizeDesignPath(candidate.name) : ''
  const content = typeof candidate.content === 'string' ? candidate.content : ''
  if (!name || !content.trim()) return null
  const language = typeof candidate.language === 'string' && candidate.language.trim()
    ? candidate.language
    : (name.split('.').pop() || 'text')
  const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : genId()
  const sanitizedContent = sanitizeDesignFileContent(name, language, content)
  return { id, name, language, content: sanitizedContent }
}

function toDesignMessage(value: unknown): DesignMessage | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<DesignMessage>
  const role = candidate.role === 'assistant' || candidate.role === 'user' ? candidate.role : null
  const content = typeof candidate.content === 'string' ? candidate.content : ''
  if (!role) return null
  const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : genId()
  const files = Array.isArray(candidate.files)
    ? candidate.files.map(toDesignFile).filter((f): f is DesignFile => f !== null)
    : undefined
  return {
    id,
    role,
    content,
    isStreaming: false,
    files: files && files.length > 0 ? files : undefined,
  }
}

function toInlineComment(value: unknown): InlineComment | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<InlineComment>
  const text = typeof candidate.text === 'string' ? candidate.text.trim() : ''
  if (!text) return null

  const rawX = typeof candidate.xPct === 'number' ? candidate.xPct : Number(candidate.xPct)
  const rawY = typeof candidate.yPct === 'number' ? candidate.yPct : Number(candidate.yPct)
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : genId(),
    text,
    xPct: Math.max(0, Math.min(100, rawX)),
    yPct: Math.max(0, Math.min(100, rawY)),
    createdAt: typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt)
      ? candidate.createdAt
      : Date.now(),
    resolved: Boolean(candidate.resolved),
  }
}

function toBase64Url(value: string): string {
  const encoded = btoa(unescape(encodeURIComponent(value)))
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): string {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  return decodeURIComponent(escape(atob(padded)))
}

export function buildHandoffPrompt(files: DesignFile[]): string {
  if (files.length === 0) return ''
  const sections = files.map((file) => {
    const language = (file.language || file.name.split('.').pop() || 'txt').toLowerCase()
    return ['```' + language + ' ' + file.name, file.content, '```'].join('\n')
  })
  return [
    'Implement this generated design in the workspace. Use these files exactly as the baseline and refine where needed:',
    ...sections,
  ].join('\n\n')
}

export function encodeDesignSharePayload(payload: DesignSharePayload): string {
  return toBase64Url(JSON.stringify(payload))
}

export function decodeDesignSharePayload(raw: string): DesignSharePayload | null {
  try {
    const parsed = JSON.parse(fromBase64Url(raw)) as Partial<DesignSharePayload>
    const files = Array.isArray(parsed.files)
      ? parsed.files.map(toDesignFile).filter((row): row is DesignFile => row !== null)
      : []
    if (files.length === 0) return null

    const selectedFileId = typeof parsed.selectedFileId === 'string' ? parsed.selectedFileId : null
    const selectedExists = selectedFileId ? files.some((file) => file.id === selectedFileId) : false
    const shareAccess: ShareAccess = parsed.shareAccess === 'view' || parsed.shareAccess === 'comment'
      ? parsed.shareAccess
      : 'edit'
    const viewMode: ViewMode = parsed.viewMode === 'code' || parsed.viewMode === 'split' || parsed.viewMode === 'editor'
      ? parsed.viewMode
      : 'preview'
    const device: DeviceMode = parsed.device === 'tablet' || parsed.device === 'mobile'
      ? parsed.device
      : 'desktop'
    const inlineComments = Array.isArray(parsed.inlineComments)
      ? parsed.inlineComments.map(toInlineComment).filter((row): row is InlineComment => row !== null)
      : []

    return {
      version: 1,
      files,
      selectedFileId: selectedExists ? selectedFileId : (files[0]?.id ?? null),
      viewMode,
      device,
      inlineComments,
      shareAccess,
    }
  } catch {
    return null
  }
}

function readSharePayloadFromHash(hashValue: string): DesignSharePayload | null {
  const hash = hashValue.startsWith('#') ? hashValue.slice(1) : hashValue
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const raw = params.get('designShare')
  if (!raw) return null
  return decodeDesignSharePayload(raw)
}

function clampWidth(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function loadPersistedDesignStudioState(): PersistedDesignStudioState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DESIGN_STUDIO_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedDesignStudioState>
    if (!parsed || typeof parsed !== 'object') return null

    const files = Array.isArray(parsed.files)
      ? parsed.files.map(toDesignFile).filter((f): f is DesignFile => f !== null)
      : []
    const messages = Array.isArray(parsed.messages)
      ? parsed.messages.map(toDesignMessage).filter((m): m is DesignMessage => m !== null)
      : []
    const history = Array.isArray(parsed.history)
      ? parsed.history
        .map((entry): HistoryEntry | null => {
          if (!entry || typeof entry !== 'object') return null
          const row = entry as Partial<HistoryEntry>
          const rowFiles = Array.isArray(row.files)
            ? row.files.map(toDesignFile).filter((f): f is DesignFile => f !== null)
            : []
          if (rowFiles.length === 0) return null
          const timestamp = typeof row.timestamp === 'number' && Number.isFinite(row.timestamp)
            ? row.timestamp
            : Date.now()
          const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : undefined
          return {
            files: rowFiles,
            timestamp,
            ...(label ? { label } : {}),
          }
        })
        .filter((entry): entry is HistoryEntry => entry !== null)
      : []
    const inlineComments = Array.isArray(parsed.inlineComments)
      ? parsed.inlineComments.map(toInlineComment).filter((entry): entry is InlineComment => entry !== null)
      : []

    const selectedFileId = typeof parsed.selectedFileId === 'string' ? parsed.selectedFileId : null
    const selectedExists = selectedFileId ? files.some((f) => f.id === selectedFileId) : false
    const normalizedSelected = selectedExists ? selectedFileId : (files[0]?.id ?? null)

    const device: DeviceMode = parsed.device === 'tablet' || parsed.device === 'mobile' ? parsed.device : 'desktop'
    const viewMode: ViewMode = parsed.viewMode === 'preview' || parsed.viewMode === 'code' || parsed.viewMode === 'split' || parsed.viewMode === 'editor'
      ? parsed.viewMode
      : 'preview'
    const shareAccess: ShareAccess = parsed.shareAccess === 'view' || parsed.shareAccess === 'comment'
      ? parsed.shareAccess
      : 'edit'
    const designMode = normalizeDesignMode(parsed.designMode)
    const projectContext = typeof parsed.projectContext === 'string' ? parsed.projectContext : ''
    const expandedFolders = (() => {
      if (!parsed.expandedFolders || typeof parsed.expandedFolders !== 'object') return {}
      const output: Record<string, boolean> = {}
      for (const [key, value] of Object.entries(parsed.expandedFolders)) {
        if (typeof value === 'boolean') output[key] = value
      }
      return output
    })()

    return {
      messages: messages.slice(-MAX_PERSISTED_MESSAGES),
      files,
      selectedFileId: normalizedSelected,
      history: history.slice(-MAX_PERSISTED_HISTORY),
      inlineComments,
      projectContext,
      designMode,
      shareAccess,
      device,
      viewMode,
      fileTreeW: clampWidth(parsed.fileTreeW, 140, 420, 200),
      chatW: clampWidth(parsed.chatW, 260, 560, 340),
      splitCodeW: clampWidth(parsed.splitCodeW, 25, 75, 50),
      fileTreeOpen: typeof parsed.fileTreeOpen === 'boolean' ? parsed.fileTreeOpen : true,
      expandedFolders,
      updatedAt: typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : Date.now(),
    }
  } catch {
    return null
  }
}

function normalizeDesignPath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .trim()
}

function getFolderPathChain(filePath: string): string[] {
  const normalized = normalizeDesignPath(filePath)
  if (!normalized) return []
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length <= 1) return []

  const folders: string[] = []
  for (let i = 0; i < parts.length - 1; i += 1) {
    folders.push(parts.slice(0, i + 1).join('/'))
  }
  return folders
}

function compareTreeNodes(a: DesignFileTreeNode, b: DesignFileTreeNode): number {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
  return a.name.localeCompare(b.name)
}

export function buildDesignFileTree(files: DesignFile[]): DesignFileTreeNode[] {
  const root: DesignFileTreeNode = { type: 'folder', name: '', path: '', children: [] }

  for (const rawFile of files) {
    const normalizedName = normalizeDesignPath(rawFile.name) || rawFile.name
    const file = { ...rawFile, name: normalizedName }
    const parts = normalizedName.split('/').filter(Boolean)
    if (parts.length === 0) continue

    let cursor = root
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]
      const isLeaf = i === parts.length - 1
      const nextPath = cursor.path ? `${cursor.path}/${part}` : part
      if (!cursor.children) cursor.children = []

      if (isLeaf) {
        const existingFile = cursor.children.find(
          (node) => node.type === 'file' && node.path === nextPath,
        )
        if (existingFile) {
          existingFile.file = file
          existingFile.name = part
        } else {
          cursor.children.push({ type: 'file', name: part, path: nextPath, file })
        }
        continue
      }

      let folder = cursor.children.find(
        (node) => node.type === 'folder' && node.path === nextPath,
      )
      if (!folder) {
        folder = { type: 'folder', name: part, path: nextPath, children: [] }
        cursor.children.push(folder)
      }
      cursor = folder
    }
  }

  const sortTree = (nodes: DesignFileTreeNode[]): DesignFileTreeNode[] =>
    [...nodes]
      .sort(compareTreeNodes)
      .map((node) => {
        if (node.type === 'folder' && node.children) {
          return { ...node, children: sortTree(node.children) }
        }
        return node
      })

  return sortTree(root.children || [])
}


const LANG_EXT: Record<string, string> = {
  html: 'html', css: 'css', javascript: 'js', js: 'js',
  typescript: 'ts', ts: 'ts', jsx: 'jsx', tsx: 'tsx',
  json: 'json', svg: 'svg', markdown: 'md', md: 'md',
  python: 'py', shell: 'sh', bash: 'sh',
}

const KNOWN_FENCE_LANGS = new Set<string>(Object.keys(LANG_EXT))

const FILE_ICONS: Record<string, string> = {
  html: 'HTML', css: 'CSS', js: 'JS', ts: 'TS', jsx: 'JSX', tsx: 'TSX',
  json: 'JSON', svg: 'SVG', md: 'MD', py: 'PY', sh: 'SH',
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return FILE_ICONS[ext] || 'FILE'
}

export function extractFiles(content: string): DesignFile[] {
  const re = /```([^\n`]*)\n([\s\S]*?)```/g
  const files: DesignFile[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  let idx = 0

  while ((m = re.exec(content)) !== null) {
    const info = (m[1] || '').trim()
    const code = m[2] || ''
    if (!code.trim()) continue

    const tokens = info.split(/\s+/).filter(Boolean)
    const firstToken = (tokens[0] || '').toLowerCase()
    const hasKnownLang = firstToken ? KNOWN_FENCE_LANGS.has(firstToken) : false

    let lang = hasKnownLang ? firstToken : ''
    let name = ''

    if (hasKnownLang && tokens.length > 1) {
      name = tokens.slice(1).join(' ').trim()
    } else if (!hasKnownLang && tokens.length === 1) {
      const maybePath = normalizeDesignPath(tokens[0])
      if (maybePath && /\.\w+$/.test(maybePath)) {
        name = maybePath
      }
    }

    if (!name && !lang) continue

    if (!name) {
      idx += 1
      const ext = LANG_EXT[lang] || lang || 'txt'
      name = `file-${idx}.${ext}`
    }

    name = normalizeDesignPath(name) || name
    if (!lang) {
      lang = inferLanguageFromFileName(name)
    }

    if (!name) {
      idx += 1
      name = `file-${idx}.txt`
    }

    const sanitizedCode = sanitizeDesignFileContent(name, lang, code)
    const dedupeKey = name.toLowerCase()
    if (seen.has(dedupeKey)) {
      const existing = files.find(f => f.name.toLowerCase() === dedupeKey)
      if (existing) existing.content = sanitizedCode
    } else {
      seen.add(dedupeKey)
      files.push({ id: genId(), name, language: lang, content: sanitizedCode })
    }
  }

  // Fallback: treat raw HTML (no code fence) as index.html
  if (files.length === 0) {
    const trimmed = content.trim()
    const sanitized = sanitizeDesignFileContent('index.html', 'html', trimmed)
    const lower = sanitized.toLowerCase()
    if (lower.startsWith('<!doctype') || lower.startsWith('<html')) {
      files.push({ id: genId(), name: 'index.html', language: 'html', content: sanitized })
    }
  }

  return files
}

function buildPreviewHtml(files: DesignFile[]): string {
  const htmlFile = files.find(f => f.language === 'html' || f.name.endsWith('.html'))
  const cssFiles = files.filter(f => (f.language === 'css' || f.name.endsWith('.css')) && f !== htmlFile)
  const jsFiles = files.filter(f => ['javascript', 'js', 'jsx'].includes(f.language) || f.name.match(/\.(js|jsx)$/))

  if (htmlFile) {
    let html = sanitizeDesignFileContent(htmlFile.name, htmlFile.language, htmlFile.content)
    const cssInject = cssFiles.map(f => `<style>/* ${f.name} */\n${f.content}</style>`).join('\n')
    const jsInject = jsFiles.map(f => `<script>/* ${f.name} */\n${f.content}<\/script>`).join('\n')

    // Ensure the document has <head> and <body> so injections always land
    if (!/<head[\s>]/i.test(html)) {
      if (/<html[\s>]/i.test(html)) {
        html = html.replace(/<html[^>]*>/i, (m) => m + '<head></head>')
      } else {
        html = `<!DOCTYPE html><html><head></head><body>${html}</body></html>`
      }
    }
    if (!/<\/body>/i.test(html)) {
      html = html.replace(/<\/html>/i, `</body></html>`) || html + '</body>'
    }

    html = html.replace(/<\/head>/i, `${cssInject}\n</head>`)
    html = html.replace(/<\/body>/i, `${jsInject}\n</body>`)
    return html
  }

  if (files.length === 1 && files[0].language === 'svg') {
    return `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff">${files[0].content}</body></html>`
  }

  // Wrap loose CSS/JS in an HTML shell
  const css = cssFiles.map(f => f.content).join('\n')
  const js = jsFiles.map(f => f.content).join('\n')
  return `<!DOCTYPE html><html><head><style>${css}</style></head><body>${js ? `<script>${js}<\/script>` : ''}</body></html>`
}

function normalizePlanItemText(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupePlanItems(items: string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const item of items) {
    const cleaned = normalizePlanItemText(item)
    if (!cleaned) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(cleaned)
  }
  return deduped
}

export function extractPlanItemsFromAssistant(content: string): string[] {
  const sectionMatch = content.match(/(?:^|\n)(?:#{1,4}\s*)?(?:plan|build plan|todo|to-do|tasks?|implementation plan|roadmap)\s*:?\s*\n([\s\S]*?)(?=\n#{1,6}\s+\S|\n```|$)/i)

  const parseListLines = (value: string): string[] => value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^(?:(?:-\s*)?\[[ xX]\]\s+|\d+[.)]\s+|[-*+]\s+)/.test(line))
    .map((line) => line.replace(/^(?:(?:-\s*)?\[[ xX]\]\s+|\d+[.)]\s+|[-*+]\s+)/, '').trim())
    .filter((line) => line.length >= 3)

  let items = sectionMatch ? parseListLines(sectionMatch[1]) : []
  if (items.length === 0) {
    const listLines = parseListLines(content)
    if (listLines.length >= 2) items = listLines
  }

  return dedupePlanItems(items).slice(0, 8)
}

export function buildPromptPlanItems(prompt: string): string[] {
  const cleanedPrompt = prompt.replace(/\s+/g, ' ').trim()
  if (!cleanedPrompt) return []

  const subjectMatch = cleanedPrompt.match(/\b(?:build|create|design|make|generate|develop|craft)\b\s+(.+?)(?:\b(?:with|using|for|that|including|where)\b|[.?!]|$)/i)
  const rawSubject = (subjectMatch?.[1] || cleanedPrompt)
    .replace(/^(a|an|the)\s+/i, '')
    .trim()
  const subject = rawSubject.length > 72 ? `${rawSubject.slice(0, 69).trim()}...` : rawSubject

  const featureSegment = (cleanedPrompt.match(/\b(?:with|including|plus|featuring)\b\s+(.+)$/i)?.[1] || '')
  const featureItems = dedupePlanItems(
    featureSegment
      .split(/,|\band\b/i)
      .map((part) => part.trim())
      .filter((part) => part.length >= 4)
      .map((part) => part.replace(/[.]+$/, '')),
  ).slice(0, 2)

  const base = [
    `Understand goals and constraints for ${subject || 'the requested design'}`,
    `Build the core layout and semantic structure for ${subject || 'the page'}`,
    ...featureItems.map((item) => `Implement ${item}`),
    'Polish responsiveness, interactions, and accessibility',
    'Validate generated files and preview output before delivery',
  ]

  return dedupePlanItems(base).slice(0, 8)
}

function inferLanguageFromFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (!ext) return 'text'
  const byExt: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
    md: 'markdown',
    yml: 'yaml',
  }
  return byExt[ext] || ext
}

function upsertDesignFileInMap(map: Map<string, DesignFile>, filePath: string, content: string): boolean {
  const normalizedPath = normalizeDesignPath(filePath)
  if (!normalizedPath || typeof content !== 'string') return false

  const key = normalizedPath.toLowerCase()
  const existing = map.get(key)
  const language = existing?.language || inferLanguageFromFileName(normalizedPath)
  map.set(key, {
    id: existing?.id || genId(),
    name: normalizedPath,
    language,
    // Keep raw tool content so subsequent file_edit old_str matching remains exact.
    content,
  })
  return true
}

function applyFileEditToMap(
  map: Map<string, DesignFile>,
  filePath: string,
  oldStr: string,
  newStr: string,
): boolean {
  const normalizedPath = normalizeDesignPath(filePath)
  if (!normalizedPath || !oldStr) return false

  const key = normalizedPath.toLowerCase()
  const existing = map.get(key)
  if (!existing || !existing.content.includes(oldStr)) return false

  map.set(key, {
    ...existing,
    content: existing.content.replace(oldStr, newStr),
  })
  return true
}

function applyToolStartEventToDesignFiles(
  event: unknown,
  map: Map<string, DesignFile>,
): boolean {
  if (!event || typeof event !== 'object') return false
  const payload = event as Record<string, unknown>
  if (String(payload.type || '').toLowerCase() !== 'tool_start') return false

  const toolName = String(payload.tool || '').toLowerCase().trim()
  const input = payload.input
  if (!input || typeof input !== 'object') return false
  const toolInput = input as Record<string, unknown>

  if (toolName === 'file_write') {
    const path = typeof toolInput.path === 'string' ? toolInput.path : ''
    const content = typeof toolInput.content === 'string' ? toolInput.content : ''
    if (!path) return false
    return upsertDesignFileInMap(map, path, content)
  }

  if (toolName === 'file_edit') {
    const path = typeof toolInput.path === 'string' ? toolInput.path : ''
    const oldStr = typeof toolInput.old_str === 'string' ? toolInput.old_str : ''
    const newStr = typeof toolInput.new_str === 'string' ? toolInput.new_str : ''
    if (!path) return false
    return applyFileEditToMap(map, path, oldStr, newStr)
  }

  return false
}


const STARTERS = [
  { icon: 'DIR', label: '3 directions', prompt: 'Create three distinct design directions for a modern AI product homepage. Show them side by side with rationale, tradeoffs, and a recommendation.' },
  { icon: 'DASH', label: 'Dashboard', prompt: 'Create a dense but calm analytics dashboard for an operations team with real metrics, filters, table states, SVG charts, alerts, and keyboard-focusable controls.' },
  { icon: 'APP', label: 'App prototype', prompt: 'Design a clickable habit tracker app prototype with 6 screens, realistic data, navigation state, charts, streaks, settings, and polished mobile interactions.' },
  { icon: 'DECK', label: 'Pitch deck', prompt: 'Create a 10-slide product pitch deck for an AI workflow tool with varied slide layouts, speaker notes, data slides, and a strong visual system.' },
  { icon: 'MOVE', label: 'Motion piece', prompt: 'Build a 20-second HTML product launch animation with scene phases, replay controls, readable text beats, and recording-ready layout.' },
  { icon: 'INFO', label: 'Infographic', prompt: 'Create a print-quality infographic explaining how autonomous agents plan, use tools, verify results, and hand off artifacts.' },
  { icon: 'REV', label: 'Critique', prompt: 'Review the current design with a scored critique across hierarchy, craft, usability, accessibility, originality, and provide a concrete improved version.' },
]

// ─── Project Storage ─────────────────────────────────────────────────────────

const DS_PROJECTS_INDEX = 'kodo.ds.projects.v1'
const dsProjectKey = (id: string) => `kodo.ds.p.${id}`

function listProjectSummaries(): ProjectSummary[] {
  try {
    const raw = localStorage.getItem(DS_PROJECTS_INDEX)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((s): s is ProjectSummary => Boolean(s?.id))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  } catch { return [] }
}

function saveProjectToStorage(project: DesignProject): void {
  try {
    const stripped: DesignProject = {
      ...project,
      updatedAt: Date.now(),
      messages: project.messages.slice(-MAX_PERSISTED_MESSAGES).map(m => ({
        ...m,
        isStreaming: false,
        files: m.files?.map(f => ({
          ...f,
          content: typeof f.content === 'string'
            ? f.content.slice(0, MAX_PERSISTED_MESSAGE_FILE_CHARS)
            : '',
        })),
      })),
      history: project.history.slice(-MAX_PERSISTED_HISTORY),
    }
    const key = dsProjectKey(project.id)
    localStorage.setItem(key, JSON.stringify(stripped))

    const summaries = listProjectSummaries().filter((s) => s.id !== project.id)
    const summary: ProjectSummary = {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: Date.now(),
      fileNames: project.files.map(f => f.name).slice(0, 5),
    }
    summaries.unshift(summary)
    localStorage.setItem(DS_PROJECTS_INDEX, JSON.stringify(summaries))
  } catch { /* quota — ignore */ }
}

function loadProjectFromStorage(id: string): DesignProject | null {
  try {
    const raw = localStorage.getItem(dsProjectKey(id))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DesignProject>

    const history = Array.isArray(parsed.history)
      ? parsed.history
        .map((entry): HistoryEntry | null => {
          if (!entry || typeof entry !== 'object') return null
          const row = entry as Partial<HistoryEntry>
          const rowFiles = Array.isArray(row.files)
            ? row.files.map(toDesignFile).filter((f): f is DesignFile => f !== null)
            : []
          if (rowFiles.length === 0) return null
          return {
            files: rowFiles,
            timestamp: typeof row.timestamp === 'number' && Number.isFinite(row.timestamp)
              ? row.timestamp
              : Date.now(),
            label: typeof row.label === 'string' && row.label.trim() ? row.label.trim() : undefined,
          }
        })
        .filter((row): row is HistoryEntry => row !== null)
      : []

    return {
      id: String(parsed.id || id),
      name: String(parsed.name || 'Untitled'),
      createdAt: Number(parsed.createdAt) || Date.now(),
      updatedAt: Number(parsed.updatedAt) || Date.now(),
      messages: Array.isArray(parsed.messages)
        ? parsed.messages.map(toDesignMessage).filter((m): m is DesignMessage => m !== null)
        : [],
      files: Array.isArray(parsed.files)
        ? parsed.files.map(toDesignFile).filter((f): f is DesignFile => f !== null)
        : [],
      selectedFileId: typeof parsed.selectedFileId === 'string' ? parsed.selectedFileId : null,
      history,
      inlineComments: Array.isArray(parsed.inlineComments) ? parsed.inlineComments : [],
      projectContext: typeof parsed.projectContext === 'string' ? parsed.projectContext : '',
      designMode: normalizeDesignMode(parsed.designMode),
      shareAccess: parsed.shareAccess === 'view' || parsed.shareAccess === 'comment' ? parsed.shareAccess : 'edit',
      device: parsed.device === 'tablet' || parsed.device === 'mobile' ? parsed.device : 'desktop',
      viewMode: parsed.viewMode === 'code' || parsed.viewMode === 'split' || parsed.viewMode === 'editor' ? parsed.viewMode : 'preview',
      fileTreeW: clampWidth(parsed.fileTreeW, 140, 420, 200),
      chatW: clampWidth(parsed.chatW, 260, 560, 340),
      splitCodeW: clampWidth(parsed.splitCodeW, 25, 75, 50),
      fileTreeOpen: typeof parsed.fileTreeOpen === 'boolean' ? parsed.fileTreeOpen : true,
      expandedFolders: parsed.expandedFolders && typeof parsed.expandedFolders === 'object'
        ? parsed.expandedFolders as Record<string, boolean>
        : {},
    }
  } catch { return null }
}

function deleteProjectFromStorage(id: string): void {
  try {
    localStorage.removeItem(dsProjectKey(id))
    const summaries = listProjectSummaries().filter(s => s.id !== id)
    localStorage.setItem(DS_PROJECTS_INDEX, JSON.stringify(summaries))
  } catch { /* */ }
}

function renameProjectInStorage(id: string, name: string): void {
  try {
    const summaries = listProjectSummaries()
    const idx = summaries.findIndex(s => s.id === id)
    if (idx >= 0) { summaries[idx] = { ...summaries[idx], name }; localStorage.setItem(DS_PROJECTS_INDEX, JSON.stringify(summaries)) }
    const raw = localStorage.getItem(dsProjectKey(id))
    if (raw) {
      const parsed = JSON.parse(raw)
      localStorage.setItem(dsProjectKey(id), JSON.stringify({ ...parsed, name }))
    }
  } catch { /* */ }
}

function blankProject(name = 'New Design'): DesignProject {
  return {
    id: genId(), name, createdAt: Date.now(), updatedAt: Date.now(),
    messages: [], files: [], selectedFileId: null, history: [],
    inlineComments: [], projectContext: '', shareAccess: 'edit',
    designMode: 'web', device: 'desktop', viewMode: 'preview',
    fileTreeW: 200, chatW: 340, splitCodeW: 50, fileTreeOpen: true, expandedFolders: {},
  }
}

function migrateOldDesignData(): void {
  try {
    const raw = localStorage.getItem('kodo.design-studio.state.v1')
    if (!raw) return
    if (listProjectSummaries().length > 0) { localStorage.removeItem('kodo.design-studio.state.v1'); return }
    const persisted = loadPersistedDesignStudioState()
    if (!persisted || persisted.messages.length === 0) { localStorage.removeItem('kodo.design-studio.state.v1'); return }
    const project = blankProject('Restored Project')
    project.messages = persisted.messages
    project.files = persisted.files
    project.selectedFileId = persisted.selectedFileId
    project.history = persisted.history
    project.inlineComments = persisted.inlineComments
    project.projectContext = persisted.projectContext
    project.designMode = persisted.designMode
    project.shareAccess = persisted.shareAccess
    saveProjectToStorage(project)
    localStorage.removeItem('kodo.design-studio.state.v1')
  } catch { /* */ }
}

// ─── Design System ───────────────────────────────────────────────────────────

const DS_DESIGN_SYSTEM_KEY = 'kodo.ds.designSystem.v1'

const DEFAULT_DESIGN_SYSTEM: DesignSystemConfig = {
  brandName: '', presetId: 'neutral-modern',
  fidelity: 'high-fidelity', direction: 'auto', surface: 'auto',
  motion: 'subtle', deviceFrame: 'auto',
  audience: '', scale: '', brandAssets: '',
  primaryColor: '#6366f1', secondaryColor: '#8b5cf6',
  accentColor: '#06b6d4', fontFamily: 'Inter, system-ui, sans-serif',
  borderRadius: 'md', style: 'minimal', customRules: '',
}

function loadDesignSystem(): DesignSystemConfig {
  try {
    const raw = localStorage.getItem(DS_DESIGN_SYSTEM_KEY)
    if (!raw) return { ...DEFAULT_DESIGN_SYSTEM }
    const parsed = { ...DEFAULT_DESIGN_SYSTEM, ...JSON.parse(raw) } as DesignSystemConfig
    return {
      ...parsed,
      presetId: DESIGN_SYSTEM_PRESETS.some((preset) => preset.id === parsed.presetId) ? parsed.presetId : DEFAULT_DESIGN_SYSTEM.presetId,
      fidelity: parsed.fidelity === 'wireframe' || parsed.fidelity === 'production' ? parsed.fidelity : 'high-fidelity',
      direction: Object.keys(DESIGN_DIRECTIONS).includes(parsed.direction) ? parsed.direction : 'auto',
      surface: Object.keys(DESIGN_SURFACES).includes(parsed.surface) ? parsed.surface : 'auto',
      motion: parsed.motion === 'none' || parsed.motion === 'expressive' || parsed.motion === 'cinematic' ? parsed.motion : 'subtle',
      deviceFrame: Object.keys(DEVICE_FRAME_PROMPTS).includes(parsed.deviceFrame) ? parsed.deviceFrame : 'auto',
    }
  } catch { return { ...DEFAULT_DESIGN_SYSTEM } }
}

function saveDesignSystem(ds: DesignSystemConfig): void {
  try { localStorage.setItem(DS_DESIGN_SYSTEM_KEY, JSON.stringify(ds)) } catch { /* */ }
}

export function buildDesignSystemPrompt(ds: DesignSystemConfig): string {
  const preset = DESIGN_SYSTEM_PRESETS.find((row) => row.id === ds.presetId) || DESIGN_SYSTEM_PRESETS[0]
  const direction = DESIGN_DIRECTIONS[ds.direction] || DESIGN_DIRECTIONS.auto
  const lines: string[] = ['Kodo Creative Brief and Design System:']
  lines.push(`- Fidelity: ${ds.fidelity} — ${FIDELITY_PROMPTS[ds.fidelity]}`)
  lines.push(`- Surface: ${ds.surface} — ${DESIGN_SURFACES[ds.surface]}`)
  lines.push(`- Motion: ${ds.motion} — ${MOTION_PROMPTS[ds.motion]}`)
  lines.push(`- Device frame: ${ds.deviceFrame} — ${DEVICE_FRAME_PROMPTS[ds.deviceFrame]}`)
  lines.push(`- Design system preset: ${preset.label} (${preset.category}) — ${preset.summary}`)
  lines.push(`- Preset rules: ${preset.prompt}`)
  lines.push(`- Visual direction: ${direction.label} — ${direction.summary}`)
  lines.push(`- Direction rules: ${direction.prompt}`)
  if (ds.brandName) lines.push(`- Brand: ${ds.brandName}`)
  if (ds.audience) lines.push(`- Audience: ${ds.audience}`)
  if (ds.scale) lines.push(`- Scope/scale: ${ds.scale}`)
  if (ds.brandAssets) lines.push(`- Brand/context assets available: ${ds.brandAssets}`)
  lines.push(`- Primary color: ${ds.primaryColor}`)
  lines.push(`- Secondary color: ${ds.secondaryColor}`)
  lines.push(`- Accent color: ${ds.accentColor}`)
  lines.push(`- Font: ${ds.fontFamily}`)
  const radii: Record<DesignSystemConfig['borderRadius'], string> = { none: '0px', sm: '4px', md: '8px', lg: '16px', full: '9999px' }
  lines.push(`- Border radius: ${radii[ds.borderRadius]}`)
  lines.push(`- Visual style: ${ds.style}`)
  if (ds.customRules) lines.push(`- Rules: ${ds.customRules}`)
  lines.push('- Discovery discipline: if required context is missing, ask a compact batch of questions or render three directions instead of guessing one generic answer.')
  return lines.join('\n')
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function buildDesignSystemPresetPatch(presetId: string): Partial<DesignSystemConfig> {
  const preset = DESIGN_SYSTEM_PRESETS.find((row) => row.id === presetId) || DESIGN_SYSTEM_PRESETS[0]
  return {
    presetId: preset.id,
    primaryColor: preset.colors[4] || DEFAULT_DESIGN_SYSTEM.primaryColor,
    secondaryColor: preset.colors[2] || DEFAULT_DESIGN_SYSTEM.secondaryColor,
    accentColor: preset.colors[4] || DEFAULT_DESIGN_SYSTEM.accentColor,
    fontFamily: preset.bodyFont,
  }
}

function DragHandle({ onDrag, handleId, order }: { onDrag: (delta: number) => void; handleId?: string; order?: number }) {
  const dragging = useRef(false)
  const last = useRef(0)

  const onMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault()
    dragging.current = true
    last.current = e.clientX

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      onDrag(ev.clientX - last.current)
      last.current = ev.clientX
    }
    const onUp = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      data-handle={handleId}
      style={{
        width: 5, flexShrink: 0, cursor: 'col-resize',
        background: 'var(--border)', transition: 'background 120ms',
        zIndex: 1,
        order,
      }}
      onMouseEnter={e => { (e.target as HTMLDivElement).style.background = 'var(--accent)' }}
      onMouseLeave={e => { (e.target as HTMLDivElement).style.background = 'var(--border)' }}
    />
  )
}

// ─── Project Picker ──────────────────────────────────────────────────────────

interface ProjectPickerProps {
  projects: ProjectSummary[]
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onCreate: () => void
  onClose: () => void
}

export function ProjectPicker({ projects, onOpen, onDelete, onCreate, onClose }: ProjectPickerProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1001,
      background: 'var(--bg-0)', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        height: 56, display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-1)', flexShrink: 0,
      }}>
        <button type="button" onClick={onClose}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 12, padding: '4px 8px', borderRadius: 6 }}>
          <ArrowLeft size={14} /> Kodo
        </button>
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        <Wand2 size={18} color="var(--accent)" />
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-0)' }}>Design Studio</span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onCreate}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--accent)', border: 'none', borderRadius: 8,
            color: '#fff', fontSize: 12, fontWeight: 600, padding: '7px 16px', cursor: 'pointer',
          }}>
          <Plus size={14} /> New Design
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '32px 32px' }}>
        {projects.length === 0 ? (
          /* Empty state */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, color: 'var(--text-2)' }}>
            <Wand2 size={56} style={{ opacity: 0.15 }} />
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>Start your first design</div>
            <div style={{ fontSize: 13, opacity: 0.6, textAlign: 'center', maxWidth: 360 }}>
              Create websites, dashboards, and interactive prototypes by describing what you want.
            </div>
            <button type="button" onClick={onCreate}
              style={{
                marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--accent)', border: 'none', borderRadius: 10,
                color: '#fff', fontSize: 14, fontWeight: 600, padding: '12px 28px', cursor: 'pointer',
              }}>
              <Plus size={16} /> Create your first design
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 16, fontWeight: 600 }}>
              YOUR PROJECTS — {projects.length}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16,
            }}>
              {/* New Design card */}
              <button type="button" onClick={onCreate}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  height: 180, borderRadius: 12, border: '2px dashed var(--border)',
                  background: 'transparent', cursor: 'pointer', color: 'var(--text-2)', gap: 8,
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)' }}
              >
                <Plus size={24} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>New Design</span>
              </button>

              {/* Project cards */}
              {projects.map(p => (
                <div
                  key={p.id}
                  style={{
                    borderRadius: 12, border: `2px solid ${hoveredId === p.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: 'var(--bg-1)', overflow: 'hidden', cursor: 'pointer',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    boxShadow: hoveredId === p.id ? '0 4px 24px rgba(0,0,0,0.18)' : 'none',
                    display: 'flex', flexDirection: 'column',
                  }}
                  onMouseEnter={() => setHoveredId(p.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onOpen(p.id)}
                >
                  {/* Thumbnail */}
                  <div style={{
                    height: 120, background: 'linear-gradient(135deg, var(--bg-2) 0%, var(--bg-3) 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Wand2 size={32} style={{ opacity: 0.2 }} color="var(--accent)" />
                  </div>

                  {/* Card body */}
                  <div style={{ padding: '10px 12px', flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-0)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
                      {new Date(p.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {p.fileNames.slice(0, 3).map(n => (
                        <span key={n} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'var(--bg-3)', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                          {n}
                        </span>
                      ))}
                      {p.fileNames.length > 3 && (
                        <span style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>+{p.fileNames.length - 3}</span>
                      )}
                    </div>
                  </div>

                  {/* Footer actions */}
                  <div style={{
                    padding: '6px 12px', borderTop: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'flex-end', gap: 4,
                    opacity: hoveredId === p.id ? 1 : 0, transition: 'opacity 0.15s',
                  }}>
                    {confirmDelete === p.id ? (
                      <>
                        <span style={{ fontSize: 10, color: '#ff7070', flex: 1, display: 'flex', alignItems: 'center' }}>Delete?</span>
                        <button type="button" onClick={e => { e.stopPropagation(); onDelete(p.id); setConfirmDelete(null) }}
                          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: 'none', background: '#ff4040', color: '#fff', cursor: 'pointer' }}>
                          Yes
                        </button>
                        <button type="button" onClick={e => { e.stopPropagation(); setConfirmDelete(null) }}
                          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-1)', cursor: 'pointer' }}>
                          No
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={e => { e.stopPropagation(); setConfirmDelete(p.id) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}>
                        <Trash2 size={11} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

function OpenDesignProjectPicker({ projects, onOpen, onDelete, onCreate, onClose }: {
  projects: ProjectSummary[]
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onCreate: (draft?: ProjectCreateDraft) => void
  onClose: () => void
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [mode, setMode] = useState<DesignMode>('web')
  const [name, setName] = useState('')
  const [presetId, setPresetId] = useState(DEFAULT_DESIGN_SYSTEM.presetId)
  const [fidelity, setFidelity] = useState<DesignFidelity>('high-fidelity')
  const selectedPreset = DESIGN_SYSTEM_PRESETS.find((preset) => preset.id === presetId) || DESIGN_SYSTEM_PRESETS[0]
  const featuredPresets = DESIGN_SYSTEM_PRESETS.slice(0, 12)
  const createLabel = projects.length === 0 ? 'Create your first design' : 'Create'
  const createDraft = () => onCreate({ name: name.trim() || undefined, mode, presetId, fidelity })

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1001,
      background: 'var(--bg-0)',
      color: 'var(--text-0)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        height: 52,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 18px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-1)',
        flexShrink: 0,
      }}>
        <button type="button" onClick={onClose}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 12, padding: '4px 8px', borderRadius: 6 }}>
          <ArrowLeft size={14} /> Kodo
        </button>
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        <div style={{ width: 22, height: 22, borderRadius: 7, border: '1px solid var(--border-bright)', display: 'grid', placeItems: 'center', background: 'var(--bg-2)' }}>
          <Wand2 size={14} color="var(--accent)" />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.1 }}>Kodo Design</div>
          <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>Research Preview</div>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={createDraft}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, padding: '7px 16px', cursor: 'pointer' }}>
          <Plus size={14} /> New Design
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <aside style={{
          width: 258,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-1)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2, padding: '10px 10px 0', borderBottom: '1px solid var(--border)' }}>
            {(Object.keys(DESIGN_MODES) as DesignMode[]).map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => setMode(entry)}
                style={{
                  padding: '8px 6px',
                  border: 'none',
                  borderBottom: mode === entry ? '2px solid var(--accent)' : '2px solid transparent',
                  background: mode === entry ? 'var(--bg-2)' : 'transparent',
                  color: mode === entry ? 'var(--text-0)' : 'var(--text-2)',
                  borderRadius: '6px 6px 0 0',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {DESIGN_MODES[entry].label.replace(' Design', '')}
              </button>
            ))}
          </div>

          <div style={{ padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>NEW {DESIGN_MODES[mode].shortLabel}</div>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Project name"
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-0)', padding: '8px 9px', fontSize: 12, outline: 'none' }}
              />
            </div>

            <div>
              <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>DESIGN SYSTEM</div>
              <select
                value={presetId}
                onChange={(event) => setPresetId(event.target.value)}
                style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-0)', fontSize: 11, padding: '7px 8px', outline: 'none' }}
              >
                {DESIGN_SYSTEM_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.category} / {preset.label}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 4, marginTop: 7 }}>
                {selectedPreset.colors.map((color) => (
                  <span key={color} title={color} style={{ height: 16, flex: 1, borderRadius: 4, background: color, border: '1px solid var(--border)' }} />
                ))}
              </div>
              <div style={{ color: 'var(--text-2)', fontSize: 10, lineHeight: 1.45, marginTop: 6 }}>{selectedPreset.summary}</div>
            </div>

            <div>
              <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>FIDELITY</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['wireframe', 'high-fidelity'] as DesignFidelity[]).map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => setFidelity(entry)}
                    aria-pressed={fidelity === entry}
                    style={{
                      border: `1px solid ${fidelity === entry ? 'var(--accent)' : 'var(--border)'}`,
                      background: fidelity === entry ? 'var(--accent-dim)' : 'var(--bg-2)',
                      color: fidelity === entry ? 'var(--accent)' : 'var(--text-1)',
                      borderRadius: 8,
                      padding: 8,
                      minHeight: 74,
                      cursor: 'pointer',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{
                      height: 34,
                      borderRadius: 5,
                      border: '1px solid var(--border)',
                      display: 'grid',
                      gridTemplateColumns: entry === 'wireframe' ? '1fr 1fr' : '1fr 1fr 1fr',
                      gap: 4,
                      padding: 5,
                      background: 'var(--bg-1)',
                    }}>
                      <span style={{ borderRadius: 3, background: entry === 'wireframe' ? 'var(--bg-3)' : 'var(--accent)' }} />
                      <span style={{ borderRadius: 3, background: 'var(--bg-3)' }} />
                      {entry === 'high-fidelity' && <span style={{ borderRadius: 3, background: 'var(--text-2)' }} />}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700 }}>{entry === 'wireframe' ? 'Wireframe' : 'High fidelity'}</span>
                  </button>
                ))}
              </div>
            </div>

            <button type="button" onClick={createDraft}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', padding: '9px 12px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={13} /> {createLabel}
            </button>
            <div style={{ fontSize: 10, color: 'var(--text-2)', textAlign: 'center' }}>Local-first. Your projects stay in this browser.</div>
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-0)' }}>
          <div style={{ height: 45, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 22px', gap: 20 }}>
            {['Designs', 'Examples', 'Design systems'].map((tab, index) => (
              <button key={tab} type="button"
                style={{ background: 'none', border: 'none', color: index === 0 ? 'var(--text-0)' : 'var(--text-2)', fontSize: 12, fontWeight: index === 0 ? 700 : 500, cursor: 'pointer' }}>
                {tab}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <input
              placeholder="Search..."
              style={{ width: 220, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-1)', padding: '7px 9px', fontSize: 12, outline: 'none' }}
            />
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '24px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <span style={{ padding: '5px 10px', borderRadius: 999, background: 'var(--text-0)', color: 'var(--bg-0)', fontSize: 11, fontWeight: 700 }}>Recent</span>
              <span style={{ padding: '5px 10px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 11 }}>Your designs</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginBottom: 28 }}>
              <button type="button" onClick={createDraft}
                style={{ border: '1px dashed var(--border-bright)', background: 'var(--bg-1)', borderRadius: 8, minHeight: 132, color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                <Plus size={20} />
                <span style={{ fontSize: 12, fontWeight: 700 }}>New sketch</span>
              </button>
              {projects.map(p => (
                <div
                  key={p.id}
                  style={{ borderRadius: 8, border: `1px solid ${hoveredId === p.id ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--bg-1)', overflow: 'hidden', cursor: 'pointer', boxShadow: hoveredId === p.id ? '0 12px 40px rgba(0,0,0,0.22)' : 'none' }}
                  onMouseEnter={() => setHoveredId(p.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onOpen(p.id)}
                >
                  <div style={{ height: 88, background: 'linear-gradient(135deg, var(--bg-2), var(--bg-3))', display: 'grid', placeItems: 'center' }}>
                    <div style={{ width: 38, height: 42, borderRadius: 5, background: 'var(--bg-0)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.22)' }} />
                  </div>
                  <div style={{ padding: '9px 10px' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-0)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-2)' }}>Updated {new Date(p.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 7 }}>
                      {confirmDelete === p.id ? (
                        <>
                          <button type="button" onClick={e => { e.stopPropagation(); onDelete(p.id); setConfirmDelete(null) }} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: 'none', background: '#ff4040', color: '#fff', cursor: 'pointer' }}>Delete</button>
                          <button type="button" onClick={e => { e.stopPropagation(); setConfirmDelete(null) }} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}>Cancel</button>
                        </>
                      ) : (
                        <button type="button" onClick={e => { e.stopPropagation(); setConfirmDelete(p.id) }} style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', padding: 2 }} title="Delete design">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>DESIGN SYSTEMS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
              {featuredPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setPresetId(preset.id)}
                  style={{
                    textAlign: 'left',
                    border: `1px solid ${presetId === preset.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: presetId === preset.id ? 'var(--accent-dim)' : 'var(--bg-1)',
                    borderRadius: 8,
                    padding: 10,
                    color: 'var(--text-1)',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: 9,
                    alignItems: 'center',
                  }}
                >
                  <span style={{ width: 34, height: 34, display: 'grid', gridTemplateColumns: '1fr 1fr', borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                    {preset.colors.slice(0, 4).map((color) => <span key={color} style={{ background: color }} />)}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preset.label}</span>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preset.category}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

type Props = { onClose: () => void }

export function DesignStudio({ onClose }: Props) {
  // Panel widths (px)
  const containerRef = useRef<HTMLDivElement>(null)
  const [fileTreeW, setFileTreeW] = useState(200)
  const [chatW, setChatW] = useState(340)
  const [splitCodeW, setSplitCodeW] = useState(50)

  // Design state
  const [messages, setMessages] = useState<DesignMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [files, setFiles] = useState<DesignFile[]>([])
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [device, setDevice] = useState<DeviceMode>('desktop')
  const [viewMode, setViewMode] = useState<ViewMode>('preview')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [assets, setAssets] = useState<UploadedAsset[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [fileTreeOpen, setFileTreeOpen] = useState(true)
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [inlineComments, setInlineComments] = useState<InlineComment[]>([])
  const [commentMode, setCommentMode] = useState(false)
  const [projectContext, setProjectContext] = useState('')
  const [designMode, setDesignMode] = useState<DesignMode>('web')
  const [shareAccess, setShareAccess] = useState<ShareAccess>('edit')
  const [hydrated, setHydrated] = useState(false)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('New Design')
  const [projectCreatedAt, setProjectCreatedAt] = useState<number>(Date.now())
  const [allProjects, setAllProjects] = useState<ProjectSummary[]>([])
  const [leftPanelTab, setLeftPanelTab] = useState<'sessions' | 'files'>('files')
  const [isRenamingProject, setIsRenamingProject] = useState(false)
  const [projectRenameInput, setProjectRenameInput] = useState('')
  const [planItems, setPlanItems] = useState<{ id: string; text: string; done: boolean }[]>([])
  const [expandedArtifacts, setExpandedArtifacts] = useState<Record<string, boolean>>({})
  const [isEditingCode, setIsEditingCode] = useState(false)
  const [designSystem, setDesignSystem] = useState<DesignSystemConfig>(DEFAULT_DESIGN_SYSTEM)
  const [showDesignSystem, setShowDesignSystem] = useState(false)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const filesRef = useRef(files)
  filesRef.current = files

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ── Project callbacks ───────────────────────────────────────────────────────
  const applyProject = useCallback((project: DesignProject) => {
    setActiveProjectId(project.id)
    setProjectName(project.name)
    setProjectCreatedAt(project.createdAt)
    setMessages(project.messages)
    setFiles(project.files)
    setSelectedFileId(project.selectedFileId)
    setHistory(project.history)
    setInlineComments(project.inlineComments)
    setProjectContext(project.projectContext)
    setDesignMode(project.designMode)
    setShareAccess(project.shareAccess)
    setDevice(project.device)
    setViewMode(project.viewMode)
    setFileTreeW(project.fileTreeW)
    setChatW(project.chatW)
    setSplitCodeW(project.splitCodeW)
    setFileTreeOpen(project.fileTreeOpen)
    setExpandedFolders(project.expandedFolders)
    setPlanItems([])
    setError(null)
    if (project.files.length > 0) setPreviewHtml(buildPreviewHtml(project.files))
    else setPreviewHtml(null)
  }, [])

  const handleOpenProject = useCallback((id: string) => {
    const project = loadProjectFromStorage(id)
    if (!project) return
    applyProject(project)
    setLeftPanelTab('files')
  }, [applyProject])

  const handleCreateProject = useCallback((draft?: ProjectCreateDraft) => {
    const project = blankProject(draft?.name || 'New Design')
    if (draft?.mode) project.designMode = draft.mode
    saveProjectToStorage(project)
    applyProject(project)
    if (draft?.mode) setDesignMode(draft.mode)
    if (draft?.presetId || draft?.fidelity) {
      const base = loadDesignSystem()
      const next: DesignSystemConfig = {
        ...base,
        ...(draft?.presetId ? buildDesignSystemPresetPatch(draft.presetId) : {}),
        fidelity: draft?.fidelity || base.fidelity,
      }
      setDesignSystem(next)
      saveDesignSystem(next)
    }
    setAllProjects(listProjectSummaries())
    setLeftPanelTab('files')
  }, [applyProject])

  const handleDeleteProject = useCallback((id: string) => {
    deleteProjectFromStorage(id)
    setAllProjects(listProjectSummaries())
    if (activeProjectId === id) {
      setActiveProjectId(null)
      setProjectName('New Design')
      setProjectCreatedAt(Date.now())
      setMessages([]); setFiles([]); setSelectedFileId(null)
      setHistory([]); setInlineComments([]); setProjectContext('')
      setDesignMode('web')
      setPreviewHtml(null); setPlanItems([]); setError(null)
    }
  }, [activeProjectId])

  const handleRenameProject = useCallback((id: string, name: string) => {
    renameProjectInStorage(id, name)
    setAllProjects(listProjectSummaries())
    if (id === activeProjectId) setProjectName(name)
  }, [activeProjectId])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setDesignSystem(loadDesignSystem())
    const shared = typeof window !== 'undefined'
      ? readSharePayloadFromHash(window.location.hash)
      : null
    if (shared) {
      const project = blankProject('Shared Design')
      project.files = shared.files
      project.selectedFileId = shared.selectedFileId
      project.viewMode = shared.viewMode
      project.device = shared.device
      project.inlineComments = shared.inlineComments
      project.shareAccess = shared.shareAccess
      saveProjectToStorage(project)
      applyProject(project)
      setAllProjects(listProjectSummaries())
      setHydrated(true)
      return
    }
    migrateOldDesignData()
    const projects = listProjectSummaries()
    setAllProjects(projects)
    setHydrated(true)
    // Do NOT auto-open last project — show project picker instead
  }, [applyProject])

  useEffect(() => {
    if (shareAccess === 'view' && commentMode) {
      setCommentMode(false)
    }
  }, [shareAccess, commentMode])

  useEffect(() => {
    if (!hydrated || !activeProjectId) return
    const project: DesignProject = {
      id: activeProjectId, name: projectName,
      createdAt: projectCreatedAt, updatedAt: Date.now(),
      messages, files, selectedFileId, history, inlineComments,
      projectContext, designMode, shareAccess, device, viewMode,
      fileTreeW, chatW, splitCodeW, fileTreeOpen, expandedFolders,
    }
    saveProjectToStorage(project)
    setAllProjects(listProjectSummaries())
  }, [hydrated, activeProjectId, projectName, projectCreatedAt, messages, files, selectedFileId,
      history, inlineComments, projectContext, designMode, shareAccess, device, viewMode,
      fileTreeW, chatW, splitCodeW, fileTreeOpen, expandedFolders])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (files.length === 0) return
    const html = buildPreviewHtml(files)
    if (html !== previewHtml) {
      setPreviewHtml(html)
    }
  }, [files]) // intentionally omit previewHtml to avoid loop

  // Init session
  useEffect(() => {
    fetch(`${API}/new-session`, { method: 'POST', headers: buildApiHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.session_id) setSessionId(String(d.session_id)) })
      .catch(() => { /* ignore */ })
    return () => { abortRef.current?.abort() }
  }, [])

  // Fullscreen API
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!previewContainerRef.current || typeof previewContainerRef.current.requestFullscreen !== 'function') return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void previewContainerRef.current.requestFullscreen()
    }
  }, [])

  // Send message
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return
    if (shareAccess === 'view') {
      setError('This shared design is view-only. Switch access to edit to send changes.')
      return
    }
    setError(null)
    setInput('')

    const isFirst = messagesRef.current.length === 0
    const prefix = isFirst
      ? `You are Kodo Design Studio, an expert product designer, UX strategist, motion designer, and front-end craftsperson. Your goal is to produce original, production-quality visual work that does not look AI-generated.

RESPONSE FORMAT - follow this exactly:
## Plan
1. [Specific component or section you will build]
2. [Next component]
(3-8 items, each concrete and descriptive - e.g. "Sticky nav with logo, links, and CTA button")

Then output all code files immediately after the plan.

RULES:
- Output HTML in \`\`\`html index.html code blocks. Embed all CSS inside <style> tags and all JS inside <script> tags.
- You may also output separate \`\`\`css styles.css and \`\`\`js script.js blocks.
- Never reference external files that are not included in your response.
- Designs must be visually distinctive, modern, pixel-perfect, accessible, and fully responsive.
- Use real placeholder content (no "Lorem ipsum"). Write realistic copy for the industry/use-case.
- Animations and micro-interactions are encouraged only when they improve comprehension or perceived quality.
- After the plan, output ONLY code blocks — no prose, no explanations, no commentary.
- Do NOT write markdown text between code blocks.

`
      : ''

    const contextSections: string[] = [buildKodoDesignModePrompt(designMode)]
    if (projectContext.trim()) {
      contextSections.push(`Project context:\n${projectContext.trim()}`)
    }
    const dsPrompt = buildDesignSystemPrompt(designSystem)
    if (dsPrompt) contextSections.push(dsPrompt)

    const textAssets = assets
      .filter((asset) => Boolean(asset.textContent && asset.textContent.trim()))
      .slice(0, 4)
    if (textAssets.length > 0) {
      const assetSummary = textAssets
        .map((asset) => `--- ${asset.name} ---\n${String(asset.textContent || '').slice(0, 5000)}`)
        .join('\n\n')
      contextSections.push(`Attached codebase and design context:\n${assetSummary}`)
    }

    const openComments = inlineComments
      .filter((comment) => !comment.resolved)
      .slice(-5)
    if (openComments.length > 0) {
      contextSections.push(
        'Open inline canvas comments:\n'
        + openComments
          .map((comment) => `- (${Math.round(comment.xPct)}%, ${Math.round(comment.yPct)}%) ${comment.text}`)
          .join('\n'),
      )
    }

    const fullMsg = [
      contextSections.length > 0 ? `${contextSections.join('\n\n')}\n\n` : '',
      prefix,
      trimmed,
    ].join('')

    const uid = genId()
    const aid = genId()
    setMessages(prev => [
      ...prev,
      { id: uid, role: 'user', content: trimmed },
      { id: aid, role: 'assistant', content: '', isStreaming: true },
    ])
    setIsLoading(true)

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    let sid = sessionId
    if (!sid) {
      try {
        const r = await fetch(`${API}/new-session`, { method: 'POST', headers: buildApiHeaders() })
        if (r.ok) { const d = await r.json(); sid = String(d.session_id || ''); setSessionId(sid) }
      } catch { /* ignore */ }
    }

    try {
      const toolDerivedFiles = new Map<string, DesignFile>()
      for (const existingFile of filesRef.current) {
        const normalizedName = normalizeDesignPath(existingFile.name)
        if (!normalizedName) continue
        toolDerivedFiles.set(normalizedName.toLowerCase(), { ...existingFile, name: normalizedName })
      }
      let sawToolFileMutation = false

      const res = await fetch(`${API}/send`, {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ session_id: sid, message: fullMsg, project_dir: null, mode: 'execute', artifact_mode: true }),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        let detail = `${res.status} ${res.statusText}`
        try { const d = await res.json(); detail = d.detail || detail } catch { /* */ }
        throw new Error(detail)
      }
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = '', acc = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          try {
            const ev = JSON.parse(raw)
            if (applyToolStartEventToDesignFiles(ev, toolDerivedFiles)) {
              sawToolFileMutation = true
            }
            if (ev.type === 'text') {
              acc += String(ev.content || '')
              setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: acc } : m))
            }
          } catch { /* */ }
        }
      }

      const assistantPlan = extractPlanItemsFromAssistant(acc)
      const fallbackPlan = assistantPlan.length === 0 ? buildPromptPlanItems(trimmed) : []
      const resolvedPlan = assistantPlan.length > 0 ? assistantPlan : fallbackPlan
      if (resolvedPlan.length > 0) {
        setPlanItems(resolvedPlan.map((item) => ({ id: genId(), text: item, done: false })))
      }

      // Parse files and update preview after streaming completes
      const extracted = extractFiles(acc)
      const derivedFromTools = sawToolFileMutation
        ? Array.from(toolDerivedFiles.values())
          .map((file) => ({
            ...file,
            content: sanitizeDesignFileContent(file.name, file.language, file.content),
          }))
          .filter((file) => file.content.trim().length > 0)
        : []
      const resolvedFiles = extracted.length > 0 ? extracted : derivedFromTools

      if (resolvedFiles.length > 0) {
        const selected = resolvedFiles.find((file) => file.language === 'html' || file.name.endsWith('.html'))
          || resolvedFiles[0]

        setFiles(resolvedFiles)
        setSelectedFileId(selected.id)
        const html = buildPreviewHtml(resolvedFiles)
        setPreviewHtml(html)
        setRefreshKey(k => k + 1)
        setHistory(prev => [...prev, {
          files: resolvedFiles,
          timestamp: Date.now(),
          label: `Generation ${prev.length + 1}`,
        }])
        setMessages(prev => prev.map(m => m.id === aid ? { ...m, files: resolvedFiles } : m))
        // Mark all plan items done when files are generated
        setPlanItems(prev => prev.map(item => ({ ...item, done: true })))
      } else if (acc.trim()) {
        // No code blocks found — show raw response as a fallback text file so
        // the user can see what the model actually returned
        const fallback: DesignFile = { id: genId(), name: 'response.txt', language: 'text', content: acc }
        setFiles([fallback])
        setSelectedFileId(fallback.id)
        setViewMode('code')
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      const msg = String(e)
      setError(msg)
      setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: `Error: ${msg}`, isStreaming: false } : m))
    } finally {
      setMessages(prev => prev.map(m => m.id === aid ? { ...m, isStreaming: false } : m))
      setIsLoading(false)
    }
  }, [assets, designMode, designSystem, inlineComments, isLoading, projectContext, sessionId, shareAccess])

  const handleVisualEditorSourceChange = useCallback((payload: VisualEditorSourcePayload) => {
    // Strip injected harness script so it isn't double-injected on reload
    const cleanHtml = payload.html
      .replace(/<script[^>]*id="__veh"[\s\S]*?<\/script>/gi, '')
      .replace(/<div[^>]*id="__veo"[^>]*><\/div>/gi, '')
    const nextFiles: DesignFile[] = [
      { id: 'visual-editor-index', name: 'index.html', language: 'html', content: cleanHtml },
      { id: 'visual-editor-styles', name: 'styles.css', language: 'css', content: payload.css },
    ]

    setFiles(nextFiles)
    setSelectedFileId((prev) => (prev && nextFiles.some((file) => file.id === prev) ? prev : nextFiles[0].id))
    setPreviewHtml(cleanHtml)
  }, [])

  const restoreHistory = (entry: HistoryEntry) => {
    setFiles(entry.files)
    setSelectedFileId(entry.files[0]?.id ?? null)
    setPreviewHtml(buildPreviewHtml(entry.files))
    setRefreshKey(k => k + 1)
  }

  const handleAssetUpload = async (list: FileList | null) => {
    if (!list) return
    const isTextLikeAsset = (file: File): boolean => {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      const textExt = new Set(['txt', 'md', 'json', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'py', 'sh', 'yaml', 'yml'])
      return textExt.has(ext) || file.type.startsWith('text/') || file.type.includes('json')
    }

    const next: UploadedAsset[] = []
    for (const f of Array.from(list)) {
      const dataUrl = await new Promise<string>(res => {
        const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f)
      })
      let textContent: string | undefined
      if (isTextLikeAsset(f)) {
        try {
          textContent = (await f.text()).slice(0, 120000)
        } catch {
          textContent = undefined
        }
      }
      next.push({ id: genId(), name: f.name, size: f.size, type: f.type, dataUrl, textContent })
    }
    setAssets(prev => [...prev, ...next])
  }

  const saveRevision = () => {
    if (files.length === 0) return
    const suggested = `Revision ${history.length + 1}`
    const label = window.prompt('Revision name', suggested)?.trim() || suggested
    setHistory((prev) => [...prev, {
      files: files.map((file) => ({ ...file })),
      timestamp: Date.now(),
      label,
    }])
  }

  const downloadFile = (f: DesignFile) => {
    const blob = new Blob([f.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = f.name; a.click()
    URL.revokeObjectURL(url)
  }

  const downloadAll = () => {
    if (previewHtml) {
      const blob = new Blob([previewHtml], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'design.html'; a.click()
      URL.revokeObjectURL(url)
    }
  }

  const downloadZip = async () => {
    if (files.length === 0) return
    const zip = new JSZip()
    files.forEach((file) => {
      zip.file(file.name, file.content)
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'design-bundle.zip'
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPdf = () => {
    const html = previewHtml || (files.length > 0 ? buildPreviewHtml(files) : '')
    if (!html.trim()) return

    const win = window.open('', '_blank')
    if (!win) return

    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    window.setTimeout(() => {
      win.print()
    }, 350)
  }

  const renderDesignExport = async (format: 'png' | 'pdf') => {
    const html = previewHtml || (files.length > 0 ? buildPreviewHtml(files) : '')
    if (!html.trim()) return
    try {
      const res = await fetch('/api/design/render', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          html,
          format,
          width: format === 'pdf' ? 1920 : 1440,
          height: format === 'pdf' ? 1080 : 1000,
          full_page: format === 'png',
        }),
      })
      if (!res.ok) {
        let detail = `${res.status} ${res.statusText}`
        try { const data = await res.json(); detail = data.detail || detail } catch { /* */ }
        throw new Error(detail)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kodo-design.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const cancelRequest = () => {
    abortRef.current?.abort()
    setIsLoading(false)
    setMessages(prev => prev.map(m =>
      m.isStreaming ? { ...m, isStreaming: false, content: m.content || '(Cancelled)' } : m,
    ))
  }

  const openInTab = () => {
    if (!previewHtml) return
    const blob = new Blob([previewHtml], { type: 'text/html' })
    window.open(URL.createObjectURL(blob), '_blank')
  }

  const copyShareLink = async () => {
    if (files.length === 0 || typeof window === 'undefined') return
    const payload: DesignSharePayload = {
      version: 1,
      files,
      selectedFileId,
      viewMode,
      device,
      inlineComments,
      shareAccess,
    }

    const url = new URL(window.location.href)
    const params = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : '')
    params.set('designShare', encodeDesignSharePayload(payload))
    url.hash = params.toString()

    try {
      await navigator.clipboard.writeText(url.toString())
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 2000)
    } catch {
      setError('Could not copy share link. Check clipboard permissions and try again.')
    }
  }

  const handoffToLocalAgent = () => {
    const prompt = buildHandoffPrompt(files)
    if (!prompt || typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('kodo:insert-prompt', { detail: { text: prompt } }))
    onClose()
  }

  const copyCode = async () => {
    const sel = files.find(f => f.id === selectedFileId)
    if (!sel) return
    await navigator.clipboard.writeText(sel.content)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const selectedFile = files.find(f => f.id === selectedFileId) ?? files[0] ?? null
  const canEdit = shareAccess === 'edit'
  const canComment = shareAccess !== 'view'
  const activePreset = useMemo(
    () => DESIGN_SYSTEM_PRESETS.find((preset) => preset.id === designSystem.presetId) || DESIGN_SYSTEM_PRESETS[0],
    [designSystem.presetId],
  )
  const updateDesignSystem = useCallback((patch: Partial<DesignSystemConfig>) => {
    setDesignSystem((prev) => {
      const next = { ...prev, ...patch }
      saveDesignSystem(next)
      return next
    })
  }, [])
  const applyDesignSystemPreset = useCallback((presetId: string) => {
    updateDesignSystem(buildDesignSystemPresetPatch(presetId))
  }, [updateDesignSystem])
  const fileTree = useMemo(() => buildDesignFileTree(files), [files])
  const sessionEntries = useMemo(() => {
    const messageEntries: Array<{ id: string; prompt: string; files: DesignFile[]; timestamp?: number }> = []

    for (let i = 0; i < messages.length; i += 1) {
      const message = messages[i]
      if (message.role !== 'assistant' || !Array.isArray(message.files) || message.files.length === 0) continue

      const filesForSession = message.files.filter((file) => file.content.trim().length > 0)
      if (filesForSession.length === 0) continue

      const previous = i > 0 ? messages[i - 1] : undefined
      const promptSource = previous?.role === 'user' ? previous.content : 'Generation'
      const prompt = promptSource.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Generation'

      messageEntries.push({
        id: `message-${message.id}`,
        prompt,
        files: filesForSession,
      })
    }

    if (messageEntries.length > 0) return messageEntries.reverse()

    return [...history]
      .reverse()
      .map((entry, idx) => ({
        id: `history-${entry.timestamp}-${idx}`,
        prompt: entry.label || `Generation ${history.length - idx}`,
        files: entry.files.filter((file) => file.content.trim().length > 0),
        timestamp: entry.timestamp,
      }))
      .filter((entry) => entry.files.length > 0)
  }, [messages, history])

  const handleCodeEdit = useCallback((content: string) => {
    if (!selectedFileId) return
    setFiles(prev => {
      const next = prev.map(f => f.id === selectedFileId ? { ...f, content } : f)
      const html = buildPreviewHtml(next)
      setPreviewHtml(html)
      setRefreshKey(k => k + 1)
      return next
    })
  }, [selectedFileId])

  const renderAssistantMessage = (msg: DesignMessage): JSX.Element => {
    const content = msg.content
    // During streaming with no content yet
    if (msg.isStreaming && !content) {
      return <span style={{ color: 'var(--text-2)', fontStyle: 'italic' }}>Generating...</span>
    }

    const parts: JSX.Element[] = []
    const re = /```([^\n`]*)\n([\s\S]*?)```/g
    let last = 0
    let match: RegExpExecArray | null
    let codeIndex = 0

    while ((match = re.exec(content)) !== null) {
      // Text before this code block
      const before = content.slice(last, match.index).trim()
      if (before) {
        parts.push(
          <span key={`text-${match.index}`} style={{ whiteSpace: 'pre-wrap', display: 'block', marginBottom: 6 }}>
            {before}
          </span>
        )
      }

      const info = match[1].trim()
      const code = match[2]
      const lineCount = code.split('\n').length
      // Infer filename from fence info
      const infoTokens = info.split(/\s+/)
      const lang = infoTokens[0] || 'text'
      const possibleName = infoTokens[1] || ''
      const fileName = possibleName && /\.\w+$/.test(possibleName) ? possibleName : `${lang || 'code'}.${LANG_EXT[lang] || lang || 'txt'}`
      const artifactKey = `${msg.id}-${codeIndex}`
      const isExpanded = expandedArtifacts[artifactKey] ?? false

      parts.push(
        <div key={artifactKey} style={{
          background: 'var(--bg-3)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 10px', marginBottom: 6,
        }}>
          <button
            type="button"
            onClick={() => setExpandedArtifacts(prev => ({ ...prev, [artifactKey]: !prev[artifactKey] }))}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: 'var(--text-0)', fontSize: 11, fontFamily: 'var(--font-mono)',
            }}
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>{getFileIcon(fileName)}</span>
            <span style={{ flex: 1, textAlign: 'left' }}>{fileName}</span>
            <span style={{ color: 'var(--text-2)', fontSize: 10 }}>{lineCount} lines</span>
          </button>
          {isExpanded && (
            <div style={{ marginTop: 6, borderRadius: 4, overflow: 'hidden' }}>
              <SyntaxHighlighter
                style={vscDarkPlus}
                language={lang || 'text'}
                PreTag="div"
                customStyle={{ margin: 0, borderRadius: 4, fontSize: 11, padding: '8px 10px', lineHeight: 1.6 }}
              >
                {code}
              </SyntaxHighlighter>
            </div>
          )}
        </div>
      )
      codeIndex++
      last = match.index + match[0].length
    }

    // Remaining text after last code block
    const tail = content.slice(last).trim()

    // During streaming: show animated label if there's an open/partial fence
    if (msg.isStreaming && tail.includes('```')) {
      const partialLangMatch = tail.match(/```([^\n`]*)/)
      const partialInfo = partialLangMatch ? partialLangMatch[1].trim() : ''
      const partialTokens = partialInfo.split(/\s+/)
      const partialName = partialTokens[1] && /\.\w+$/.test(partialTokens[1]) ? partialTokens[1] : (partialTokens[0] ? `${partialTokens[0]}.${LANG_EXT[partialTokens[0]] || partialTokens[0]}` : 'code')
      parts.push(
        <div key="streaming-artifact" style={{
          background: 'var(--bg-3)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 10px', marginBottom: 6,
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)',
        }}>
          <Loader size={11} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
          Building {partialName}…
        </div>
      )
    } else if (tail) {
      parts.push(
        <span key="tail" style={{ whiteSpace: 'pre-wrap', display: 'block' }}>{tail}</span>
      )
    }

    if (parts.length === 0) {
      return <span style={{ whiteSpace: 'pre-wrap' }}>{content}</span>
    }
    return <>{parts}</>
  }

  const addInlineCommentAtPoint = (xPct: number, yPct: number) => {
    if (!canComment) return
    const text = window.prompt('Inline comment for this canvas area:')?.trim()
    if (!text) return
    setInlineComments((prev) => [...prev, {
      id: genId(),
      text,
      xPct: Math.max(0, Math.min(100, xPct)),
      yPct: Math.max(0, Math.min(100, yPct)),
      createdAt: Date.now(),
      resolved: false,
    }])
  }

  const handlePreviewCommentClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!commentMode || !canComment) return
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const xPct = ((event.clientX - rect.left) / rect.width) * 100
    const yPct = ((event.clientY - rect.top) / rect.height) * 100
    addInlineCommentAtPoint(xPct, yPct)
  }

  const toggleInlineComment = (id: string) => {
    setInlineComments((prev) => prev.map((comment) => (
      comment.id === id ? { ...comment, resolved: !comment.resolved } : comment
    )))
  }

  const removeInlineComment = (id: string) => {
    setInlineComments((prev) => prev.filter((comment) => comment.id !== id))
  }

  const applyInlineComment = (comment: InlineComment) => {
    const prompt = `Apply this inline canvas comment at (${Math.round(comment.xPct)}%, ${Math.round(comment.yPct)}%): ${comment.text}`
    void sendMessage(prompt)
  }

  const requestVariations = () => {
    void sendMessage('Show 3 significantly different design directions for the current artifact. Vary layout, visual language, typography, interaction model, and information density. Keep content goals intact and include a recommendation.')
  }

  const requestAccessibilityReview = () => {
    void sendMessage('Run a craft and accessibility pass on the current design: contrast, hierarchy, focus order, target size, semantics, responsiveness, content specificity, and AI-looking visual defaults. Apply fixes directly in the generated files.')
  }

  const renderInlineCommentLayer = () => (
    <>
      <div
        onClick={handlePreviewCommentClick}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          cursor: commentMode && canComment ? 'crosshair' : 'default',
          pointerEvents: commentMode && canComment ? 'auto' : 'none',
          background: commentMode && canComment ? 'rgba(0,0,0,0.02)' : 'transparent',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
        {inlineComments.map((comment, idx) => (
          <button
            key={comment.id}
            type="button"
            title={comment.text}
            onClick={(event) => {
              event.stopPropagation()
              toggleInlineComment(comment.id)
            }}
            style={{
              position: 'absolute',
              left: `${comment.xPct}%`,
              top: `${comment.yPct}%`,
              transform: 'translate(-50%, -50%)',
              width: 18,
              height: 18,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.95)',
              background: comment.resolved ? '#2f9a51' : '#ff9f1a',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              pointerEvents: 'auto',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            {idx + 1}
          </button>
        ))}
      </div>
    </>
  )

  useEffect(() => {
    if (!selectedFile) return
    const folderChain = getFolderPathChain(selectedFile.name)
    if (folderChain.length === 0) return
    setExpandedFolders((prev) => {
      const next = { ...prev }
      for (const path of folderChain) {
        next[path] = true
      }
      return next
    })
  }, [selectedFile])

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [path]: prev[path] === false,
    }))
  }

  const handleSelectFile = (file: DesignFile) => {
    setSelectedFileId(file.id)
    setIsEditingCode(false)
    if (viewMode === 'preview') setViewMode('code')
  }

  const handleSplitDrag = (delta: number) => {
    const container = splitContainerRef.current
    if (!container) return
    const deltaPercent = (delta / container.clientWidth) * 100
    setSplitCodeW((prev) => Math.max(25, Math.min(75, prev + deltaPercent)))
  }

  const renderTreeNodes = (nodes: DesignFileTreeNode[], depth = 0): JSX.Element[] => {
    const rowPaddingLeft = 10 + depth * 14
    return nodes.map((node) => {
      if (node.type === 'folder') {
        const isOpen = expandedFolders[node.path] !== false
        return (
          <div key={`folder-${node.path}`}>
            <button
              type="button"
              onClick={() => toggleFolder(node.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                width: '100%',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: `4px 8px 4px ${rowPaddingLeft}px`,
                color: 'var(--text-2)',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                textAlign: 'left',
              }}
              title={node.path}
            >
              {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {isOpen ? <FolderOpen size={12} /> : <Folder size={12} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
            </button>
            {isOpen && node.children && renderTreeNodes(node.children, depth + 1)}
          </div>
        )
      }

      const file = node.file
      if (!file) return <div key={`file-${node.path}`} />
      return (
        <div
          key={file.id}
          onClick={() => handleSelectFile(file)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: `5px 10px 5px ${rowPaddingLeft + 14}px`, cursor: 'pointer',
            background: selectedFileId === file.id ? 'var(--bg-3)' : 'transparent',
            borderLeft: selectedFileId === file.id ? '2px solid var(--accent)' : '2px solid transparent',
            fontSize: 11, color: selectedFileId === file.id ? 'var(--text-0)' : 'var(--text-1)',
            fontFamily: 'var(--font-mono)',
          }}
          title={file.name}
        >
          <span style={{ fontSize: 13, flexShrink: 0 }}>{getFileIcon(file.name)}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={e => { e.stopPropagation(); downloadFile(file) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 0, opacity: 0.6 }}
            title={`Download ${file.name}`}
          >
            <Download size={10} />
          </button>
        </div>
      )
    })
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const btn = (active: boolean, accent = false) => ({
    display: 'flex', alignItems: 'center' as const, gap: 4,
    padding: '3px 8px', borderRadius: 5,
    border: active ? '1px solid var(--border-bright)' : '1px solid transparent',
    background: active ? (accent ? 'var(--accent)' : 'var(--bg-3)') : 'transparent',
    color: active ? (accent ? '#fff' : 'var(--text-0)') : 'var(--text-2)',
    fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)',
    whiteSpace: 'nowrap' as const, flexShrink: 0 as const,
  })

  // ── Render ─────────────────────────────────────────────────────────────────

  // Show project picker when no active project
  if (!activeProjectId) {
    return (
      <OpenDesignProjectPicker
        projects={allProjects}
        onOpen={handleOpenProject}
        onDelete={handleDeleteProject}
        onCreate={handleCreateProject}
        onClose={onClose}
      />
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-0)', animation: 'fadeIn 0.15s ease',
    }} ref={containerRef}>

      {/* ══ TOP BAR ══════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 12px', height: 48,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-1)', flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={() => setActiveProjectId(null)}
          title="Back to projects"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--bg-2)',
            color: 'var(--text-1)', fontSize: 11,
            cursor: 'pointer', fontFamily: 'var(--font-mono)',
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={12} /> Projects
        </button>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <Wand2 size={15} color="var(--accent)" />
        {/* Project name (inline rename) */}
        {isRenamingProject ? (
          <input
            autoFocus
            value={projectRenameInput}
            onChange={e => setProjectRenameInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const n = projectRenameInput.trim()
                if (n) { setProjectName(n); handleRenameProject(activeProjectId, n) }
                setIsRenamingProject(false)
              }
              if (e.key === 'Escape') setIsRenamingProject(false)
            }}
            onBlur={() => {
              const n = projectRenameInput.trim()
              if (n) { setProjectName(n); handleRenameProject(activeProjectId, n) }
              setIsRenamingProject(false)
            }}
            style={{
              background: 'var(--bg-2)', border: '1px solid var(--accent)', borderRadius: 5,
              color: 'var(--text-0)', fontSize: 12, padding: '2px 8px', outline: 'none',
              fontWeight: 600, width: 160,
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => { setProjectRenameInput(projectName); setIsRenamingProject(true) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 5,
              border: 'none', background: 'transparent', color: 'var(--text-0)', fontSize: 12,
              cursor: 'pointer', fontWeight: 600, maxWidth: 200, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {projectName} <Pencil size={10} color="var(--text-2)" />
          </button>
        )}
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

        {/* View mode */}
        <button type="button" style={btn(viewMode === 'preview')} onClick={() => setViewMode('preview')}><Eye size={11} />Preview</button>
        <button type="button" style={btn(viewMode === 'code')} onClick={() => setViewMode('code')}><Code size={11} />Code</button>
        <button type="button" style={btn(viewMode === 'split')} onClick={() => setViewMode('split')}><SplitSquareHorizontal size={11} />Split</button>
        <button type="button" style={btn(viewMode === 'editor')} onClick={() => setViewMode('editor')}><Wand2 size={11} />Editor</button>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

        {/* Device */}
        <button type="button" style={btn(device === 'desktop')} onClick={() => setDevice('desktop')} title="Desktop"><Monitor size={12} /></button>
        <button type="button" style={btn(device === 'tablet')} onClick={() => setDevice('tablet')} title="Tablet"><Tablet size={12} /></button>
        <button type="button" style={btn(device === 'mobile')} onClick={() => setDevice('mobile')} title="Mobile"><Smartphone size={12} /></button>

        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <select
          value={shareAccess}
          onChange={(event) => setShareAccess(event.target.value as ShareAccess)}
          title="Share access"
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text-1)',
            fontSize: 11,
            padding: '2px 8px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <option value="view">View-only</option>
          <option value="comment">Comment</option>
          <option value="edit">Edit</option>
        </select>
        <button
          type="button"
          style={btn(commentMode, true)}
          onClick={() => setCommentMode((prev) => !prev)}
          title="Inline comment mode"
          disabled={!canComment}
        >
          <MessageSquare size={11} />
          Comment
        </button>

        {/* History */}
        {history.length > 1 && (
          <>
            <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
            <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>v{history.length}</span>
            <button type="button" style={btn(false)} onClick={() => restoreHistory(history[history.length - 2])} title="Undo to previous version">
              <RotateCcw size={11} />
            </button>
          </>
        )}
        <button type="button" style={btn(false)} onClick={saveRevision} title="Save revision" disabled={!canEdit || files.length === 0}>
          <Save size={11} />
          Save revision
        </button>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <button type="button" style={btn(showDesignSystem)} onClick={() => setShowDesignSystem(s => !s)} title="Design system">
          <Package size={11} />DS
        </button>
        <select
          value={designMode}
          onChange={(event) => setDesignMode(normalizeDesignMode(event.target.value))}
          title="Kodo design mode"
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text-1)',
            fontSize: 10,
            padding: '2px 7px',
            fontFamily: 'var(--font-mono)',
            maxWidth: 124,
          }}
        >
          {(Object.keys(DESIGN_MODES) as DesignMode[]).map((mode) => (
            <option key={mode} value={mode}>{DESIGN_MODES[mode].shortLabel}</option>
          ))}
        </select>
        <select
          value={designSystem.fidelity}
          onChange={(event) => updateDesignSystem({ fidelity: event.target.value as DesignFidelity })}
          title="Design fidelity"
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text-1)',
            fontSize: 10,
            padding: '2px 7px',
            fontFamily: 'var(--font-mono)',
            maxWidth: 116,
          }}
        >
          <option value="wireframe">WIREFRAME</option>
          <option value="high-fidelity">HI-FI</option>
          <option value="production">PROD</option>
        </select>

        <div style={{ flex: 1 }} />

        {/* Actions */}
        {(previewHtml || files.length > 0) && (
          <>
            {previewHtml && (
              <>
                <button type="button" style={btn(false)} onClick={() => setRefreshKey(k => k + 1)} title="Refresh"><RefreshCw size={12} /></button>
                <button type="button" style={btn(false)} onClick={openInTab} title="Open in new tab"><ExternalLink size={12} /></button>
                <button type="button" style={btn(false)} onClick={downloadAll} title="Download HTML"><Download size={12} /></button>
                <button type="button" style={btn(false)} onClick={() => void renderDesignExport('png')} title="Render PNG"><Eye size={12} /></button>
              </>
            )}
            {files.length > 0 && (
              <>
                <button type="button" style={btn(false)} onClick={() => void downloadZip()} title="Download ZIP"><Package size={12} /></button>
                <button type="button" style={btn(false)} onClick={exportPdf} title="Export PDF"><Printer size={12} /></button>
                <button type="button" style={btn(false)} onClick={() => void renderDesignExport('pdf')} title="Render PDF"><FileIcon size={12} /></button>
                <button type="button" style={btn(shareCopied)} onClick={() => void copyShareLink()} title="Copy share link"><Share2 size={12} />{shareCopied ? 'Copied' : 'Share'}</button>
                <button type="button" style={btn(false)} onClick={handoffToLocalAgent} title="Handoff to local coding agent"><Send size={12} />Handoff</button>
              </>
            )}
          </>
        )}
      </div>

      {/* ══ BODY ══════════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

        {/* ── FILE TREE ─────────────────────────────────────────────────────── */}
        <div style={{
          order: 4,
          width: fileTreeOpen ? fileTreeW : 36,
          minWidth: fileTreeOpen ? 140 : 36,
          flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg-1)',
          transition: 'width 0.15s ease',
          overflow: 'hidden',
        }}>
          {/* Tree header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 8px', height: 36, borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <button type="button" onClick={() => setFileTreeOpen(o => !o)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-2)', display: 'flex', alignItems: 'center', padding: 2,
            }}>
              {fileTreeOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            {fileTreeOpen && (
              <>
                {/* Tab switcher */}
                <button type="button" onClick={() => setLeftPanelTab('sessions')} style={{
                  display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
                  cursor: 'pointer', padding: '2px 4px', borderRadius: 4, fontSize: 9,
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
                  color: leftPanelTab === 'sessions' ? 'var(--accent)' : 'var(--text-2)',
                  fontWeight: leftPanelTab === 'sessions' ? 700 : 400,
                }}>
                  <Clock size={10} />SESSIONS
                </button>
                <button type="button" onClick={() => setLeftPanelTab('files')} style={{
                  display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
                  cursor: 'pointer', padding: '2px 4px', borderRadius: 4, fontSize: 9,
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
                  color: leftPanelTab === 'files' ? 'var(--accent)' : 'var(--text-2)',
                  fontWeight: leftPanelTab === 'files' ? 700 : 400,
                }}>
                  <FolderOpen size={10} />FILES
                </button>
                <div style={{ flex: 1 }} />
                {leftPanelTab === 'files' && (
                  <button type="button" style={{ ...btn(false), padding: '2px 4px' }}
                    disabled={!canEdit}
                    onClick={() => fileInputRef.current?.click()} title="Upload asset">
                    <Upload size={11} />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Design System panel */}
          {fileTreeOpen && showDesignSystem && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginBottom: 8, fontWeight: 700 }}>DESIGN SYSTEM</div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>Creative mode</div>
                <select
                  value={designMode}
                  onChange={(event) => setDesignMode(normalizeDesignMode(event.target.value))}
                  style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-0)', fontSize: 10, padding: '3px 6px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                >
                  {(Object.keys(DESIGN_MODES) as DesignMode[]).map((mode) => (
                    <option key={mode} value={mode}>{DESIGN_MODES[mode].label}</option>
                  ))}
                </select>
                <div style={{ fontSize: 9, color: 'var(--text-2)', lineHeight: 1.45, marginTop: 5 }}>
                  {DESIGN_MODES[designMode].deliverable}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>Fidelity</div>
                  <select
                    value={designSystem.fidelity}
                    onChange={(event) => updateDesignSystem({ fidelity: event.target.value as DesignFidelity })}
                    style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-0)', fontSize: 10, padding: '3px 6px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                  >
                    <option value="wireframe">Wireframe</option>
                    <option value="high-fidelity">High fidelity</option>
                    <option value="production">Production</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>Surface</div>
                  <select
                    value={designSystem.surface}
                    onChange={(event) => updateDesignSystem({ surface: event.target.value as DesignSurface })}
                    style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-0)', fontSize: 10, padding: '3px 6px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                  >
                    {(Object.keys(DESIGN_SURFACES) as DesignSurface[]).map((surface) => (
                      <option key={surface} value={surface}>{surface}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>Design system library</div>
                <select
                  value={designSystem.presetId}
                  onChange={(event) => applyDesignSystemPreset(event.target.value)}
                  style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-0)', fontSize: 10, padding: '3px 6px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                >
                  {DESIGN_SYSTEM_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.category} / {preset.label}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
                  {activePreset.colors.map((color) => (
                    <span key={color} title={color} style={{ width: 18, height: 14, borderRadius: 3, background: color, border: '1px solid var(--border)', display: 'inline-block' }} />
                  ))}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-2)', lineHeight: 1.45, marginTop: 5 }}>
                  {activePreset.summary}
                </div>
                <div style={{ display: 'grid', gap: 5, marginTop: 8, maxHeight: 210, overflowY: 'auto', paddingRight: 2 }}>
                  {DESIGN_SYSTEM_PRESETS.map((preset) => {
                    const active = designSystem.presetId === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyDesignSystemPreset(preset.id)}
                        aria-pressed={active}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 7,
                          width: '100%',
                          textAlign: 'left',
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          background: active ? 'var(--accent-dim)' : 'var(--bg-2)',
                          color: 'var(--text-1)',
                          borderRadius: 7,
                          padding: 6,
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ width: 26, height: 26, display: 'grid', gridTemplateColumns: '1fr 1fr', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                          {preset.colors.slice(0, 4).map((color) => <span key={color} style={{ background: color }} />)}
                        </span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preset.label}</span>
                          <span style={{ display: 'block', fontSize: 8, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preset.category}</span>
                        </span>
                        {active && <CheckSquare size={12} color="var(--accent)" />}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>Visual direction</div>
                <select
                  value={designSystem.direction}
                  onChange={(event) => updateDesignSystem({ direction: event.target.value as DesignDirection })}
                  style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-0)', fontSize: 10, padding: '3px 6px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                >
                  {(Object.keys(DESIGN_DIRECTIONS) as DesignDirection[]).map((direction) => (
                    <option key={direction} value={direction}>{DESIGN_DIRECTIONS[direction].label}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
                  {DESIGN_DIRECTIONS[designSystem.direction].colors.map((color) => (
                    <span key={color} title={color} style={{ width: 18, height: 14, borderRadius: 3, background: color, border: '1px solid var(--border)', display: 'inline-block' }} />
                  ))}
                </div>
                <div style={{ display: 'grid', gap: 7, marginTop: 8 }}>
                  {(Object.keys(DESIGN_DIRECTIONS) as DesignDirection[]).filter((direction) => direction !== 'auto').map((direction) => {
                    const row = DESIGN_DIRECTIONS[direction]
                    const active = designSystem.direction === direction
                    return (
                      <button
                        key={direction}
                        type="button"
                        onClick={() => updateDesignSystem({ direction })}
                        aria-pressed={active}
                        style={{
                          textAlign: 'left',
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          background: active ? 'var(--accent-dim)' : 'var(--bg-2)',
                          color: 'var(--text-1)',
                          borderRadius: 8,
                          padding: 8,
                          cursor: 'pointer',
                          display: 'grid',
                          gap: 6,
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-0)' }}>{row.label}</span>
                          {active && <span style={{ fontSize: 8, color: '#fff', background: 'var(--accent)', borderRadius: 999, padding: '1px 5px', fontFamily: 'var(--font-mono)' }}>ON</span>}
                        </span>
                        <span style={{ display: 'flex', gap: 3 }}>
                          {row.colors.map((color) => <span key={color} style={{ flex: 1, height: 12, borderRadius: 3, background: color, border: '1px solid var(--border)' }} />)}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ fontFamily: row.displayFont, fontSize: 22, lineHeight: 1, color: 'var(--text-0)' }}>Aa</span>
                          <span style={{ fontFamily: row.bodyFont, fontSize: 10, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>The quick brown fox - 0123</span>
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.4 }}>{row.summary}</span>
                        <span style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', opacity: 0.8 }}>{row.references.join(' / ')}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>Motion</div>
                  <select
                    value={designSystem.motion}
                    onChange={(event) => updateDesignSystem({ motion: event.target.value as DesignMotion })}
                    style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-0)', fontSize: 10, padding: '3px 6px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                  >
                    <option value="none">None</option>
                    <option value="subtle">Subtle</option>
                    <option value="expressive">Expressive</option>
                    <option value="cinematic">Cinematic</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>Frame</div>
                  <select
                    value={designSystem.deviceFrame}
                    onChange={(event) => updateDesignSystem({ deviceFrame: event.target.value as DeviceFrame })}
                    style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-0)', fontSize: 10, padding: '3px 6px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                  >
                    {(Object.keys(DEVICE_FRAME_PROMPTS) as DeviceFrame[]).map((frame) => (
                      <option key={frame} value={frame}>{frame}</option>
                    ))}
                  </select>
                </div>
              </div>
              {([
                { key: 'audience', label: 'Audience', rows: 1 },
                { key: 'scale', label: 'Scope / scale', rows: 1 },
                { key: 'brandAssets', label: 'Brand assets / references', rows: 2 },
              ] as { key: keyof DesignSystemConfig; label: string; rows: number }[]).map(({ key, label, rows }) => (
                <div key={key} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{label}</div>
                  <textarea
                    value={String(designSystem[key] || '')}
                    rows={rows}
                    onChange={(event) => updateDesignSystem({ [key]: event.target.value } as Partial<DesignSystemConfig>)}
                    style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-0)', fontSize: 10, padding: '3px 6px', outline: 'none', fontFamily: 'var(--font-mono)', resize: 'vertical', boxSizing: 'border-box' as const }}
                  />
                </div>
              ))}
              {([
                { key: 'brandName', label: 'Brand name', type: 'text' },
                { key: 'primaryColor', label: 'Primary', type: 'color' },
                { key: 'secondaryColor', label: 'Secondary', type: 'color' },
                { key: 'accentColor', label: 'Accent', type: 'color' },
                { key: 'fontFamily', label: 'Font', type: 'text' },
              ] as { key: keyof DesignSystemConfig; label: string; type: string }[]).map(({ key, label, type }) => (
                <div key={key} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{label}</div>
                  <input
                    type={type}
                    value={String(designSystem[key])}
                    onChange={e => {
                      const updated = { ...designSystem, [key]: e.target.value }
                      setDesignSystem(updated)
                      saveDesignSystem(updated)
                    }}
                    style={{
                      width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)',
                      borderRadius: 4, color: 'var(--text-0)', fontSize: 10,
                      padding: type === 'color' ? '1px 4px' : '3px 6px',
                      outline: 'none', fontFamily: 'var(--font-mono)', boxSizing: 'border-box' as const,
                      height: type === 'color' ? 26 : 'auto',
                    }}
                  />
                </div>
              ))}
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>Radius</div>
                <select
                  value={designSystem.borderRadius}
                  onChange={e => {
                    const updated = { ...designSystem, borderRadius: e.target.value as DesignSystemConfig['borderRadius'] }
                    setDesignSystem(updated); saveDesignSystem(updated)
                  }}
                  style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-0)', fontSize: 10, padding: '3px 6px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                >
                  {(['none', 'sm', 'md', 'lg', 'full'] as const).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>Style</div>
                <select
                  value={designSystem.style}
                  onChange={e => {
                    const updated = { ...designSystem, style: e.target.value as DesignSystemConfig['style'] }
                    setDesignSystem(updated); saveDesignSystem(updated)
                  }}
                  style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-0)', fontSize: 10, padding: '3px 6px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                >
                  {(['minimal', 'material', 'glassmorphism', 'neumorphism', 'brutalist'] as const).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>Custom rules</div>
                <textarea
                  value={designSystem.customRules}
                  onChange={e => {
                    const updated = { ...designSystem, customRules: e.target.value }
                    setDesignSystem(updated); saveDesignSystem(updated)
                  }}
                  rows={3}
                  style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-0)', fontSize: 10, padding: '3px 6px', outline: 'none', fontFamily: 'var(--font-mono)', resize: 'vertical', boxSizing: 'border-box' as const }}
                />
              </div>
              <button
                type="button"
                style={{ ...btn(false), fontSize: 9, padding: '2px 6px' }}
                onClick={() => { setDesignSystem({ ...DEFAULT_DESIGN_SYSTEM }); saveDesignSystem({ ...DEFAULT_DESIGN_SYSTEM }) }}
              >
                <Plus size={9} /> Reset
              </button>
            </div>
          )}

          {/* Sessions tab */}
          {fileTreeOpen && !showDesignSystem && leftPanelTab === 'sessions' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {sessionEntries.map((entry) => {
                return (
                  <div key={entry.id}
                    onClick={() => {
                      if (entry.files.length > 0) {
                        const htmlFile = entry.files.find((file) => file.name.endsWith('.html'))
                        const selected = htmlFile || entry.files[0]
                        setFiles(entry.files)
                        setSelectedFileId(selected?.id ?? null)
                        setPreviewHtml(buildPreviewHtml(entry.files))
                        setRefreshKey((k) => k + 1)
                        setLeftPanelTab('files')
                      }
                    }}
                    style={{ padding: '8px 10px', cursor: 'pointer', borderLeft: '2px solid transparent', background: 'transparent' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-2)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                      {entry.prompt}
                    </div>
                    {entry.timestamp && (
                      <div style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                        {new Date(entry.timestamp).toLocaleString()}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {entry.files.slice(0, 3).map(f => (
                        <span key={f.id} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-3)', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                          {f.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
              {sessionEntries.length === 0 && (
                <div style={{ padding: '12px 10px', fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                  No generations yet
                </div>
              )}
            </div>
          )}

          {/* Generated files */}
          {fileTreeOpen && !showDesignSystem && leftPanelTab === 'files' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {fileTree.length === 0 && (
                <div style={{ padding: '12px 12px', fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                  Generated files will appear here
                </div>
              )}
              {renderTreeNodes(fileTree)}

              {/* Uploaded assets */}
              {assets.length > 0 && (
                <>
                  <div style={{ padding: '8px 10px 4px', fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                    ASSETS
                  </div>
                  {assets.map(a => (
                    <div key={a.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 10px', fontSize: 11, color: 'var(--text-1)', fontFamily: 'var(--font-mono)',
                    }}>
                      <span style={{ fontSize: 13 }}>{a.type.startsWith('image/') ? '🖼' : '📎'}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                      <button type="button" onClick={() => setAssets(prev => prev.filter(x => x.id !== a.id))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 0 }}>
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {/* History */}
              {history.length > 0 && (
                <>
                  <div style={{ padding: '8px 10px 4px', fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                    HISTORY
                  </div>
                  {[...history].reverse().map((h, i) => (
                    <div key={h.timestamp} onClick={() => restoreHistory(h)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', cursor: 'pointer', fontSize: 10,
                        color: i === 0 ? 'var(--accent)' : 'var(--text-2)',
                        fontFamily: 'var(--font-mono)',
                      }}>
                      <RotateCcw size={10} />
                      {h.label || `v${history.length - i}`} — {new Date(h.timestamp).toLocaleTimeString()}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {fileTreeOpen && (
          <DragHandle order={3} handleId="file-tree" onDrag={d => setFileTreeW(w => Math.max(140, Math.min(420, w - d)))} />
        )}

        {/* ── CENTER: PREVIEW / CODE ─────────────────────────────────────────── */}
        <div style={{ order: 2, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Center toolbar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '0 10px', height: 36, borderBottom: '1px solid var(--border)',
            background: 'var(--bg-0)', flexShrink: 0,
          }}>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 8px',
              borderRadius: 6,
              background: 'var(--bg-1)',
              border: '1px solid var(--border)',
              color: 'var(--text-0)',
              fontSize: 11,
              fontWeight: 700,
            }}>
              <FolderOpen size={12} /> Design Files
            </span>
            {selectedFile && (
              <span style={{ fontSize: 11, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {getFileIcon(selectedFile.name)} {selectedFile.name}
                <span style={{ fontSize: 10, color: 'var(--text-2)' }}>
                  · {selectedFile.content.split('\n').length} lines
                </span>
              </span>
            )}
            <div style={{ flex: 1 }} />
            {(viewMode === 'code' || viewMode === 'split') && selectedFile && canEdit && (
              <button type="button" style={btn(isEditingCode)} onClick={() => setIsEditingCode(e => !e)}>
                <Pencil size={11} />{isEditingCode ? 'Done' : 'Edit'}
              </button>
            )}
            {(viewMode === 'code' || viewMode === 'split') && selectedFile && (
              <button type="button" style={btn(copied)} onClick={copyCode} title="Copy code">
                <Copy size={11} />{copied ? 'Copied!' : 'Copy'}
              </button>
            )}
            {(viewMode === 'preview' || viewMode === 'split') && previewHtml && (
              <button type="button" style={btn(isFullscreen)} onClick={toggleFullscreen} title="Toggle fullscreen">
                {isFullscreen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
              </button>
            )}
          </div>

          {/* Content */}
          {viewMode === 'editor' ? (
            <div style={{ flex: 1, minHeight: 0 }}>
              <VisualWebEditorArtifact
                html={selectedFile?.language === 'html' ? selectedFile.content : (previewHtml || '')}
                onSourceChange={handleVisualEditorSourceChange}
              />
            </div>
          ) : !previewHtml && files.length === 0 ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-2)', gap: 10,
            }}>
              <Wand2 size={36} style={{ opacity: 0.2 }} />
              <div style={{ fontSize: 13, opacity: 0.6 }}>Preview will appear here</div>
              <div style={{ fontSize: 11, opacity: 0.35 }}>Describe your design in the chat →</div>
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {viewMode === 'split' ? (
                <div
                  ref={splitContainerRef}
                  style={{
                    height: '100%',
                    minHeight: 0,
                    display: 'flex',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{
                    width: `${splitCodeW}%`,
                    minWidth: 240,
                    maxWidth: '75%',
                    overflow: 'auto',
                    flexShrink: 0,
                    display: 'flex', flexDirection: 'column',
                  }} data-pane="split-code">
                    {selectedFile ? (
                      isEditingCode ? (
                        <textarea
                          value={selectedFile.content}
                          onChange={e => handleCodeEdit(e.target.value)}
                          spellCheck={false}
                          style={{
                            width: '100%', height: '100%', minHeight: '100%',
                            background: '#06060e', color: '#d4d4d4',
                            border: 'none', outline: 'none', resize: 'none',
                            fontFamily: 'var(--font-mono)', fontSize: 12,
                            lineHeight: 1.65, padding: '14px 16px',
                            boxSizing: 'border-box',
                          }}
                        />
                      ) : (
                        <SyntaxHighlighter
                          style={vscDarkPlus}
                          language={selectedFile.language || 'text'}
                          PreTag="div"
                          customStyle={{
                            margin: 0, borderRadius: 0, background: '#06060e',
                            fontSize: 12, padding: '14px 16px', minHeight: '100%', lineHeight: 1.65,
                          }}
                        >
                          {selectedFile.content}
                        </SyntaxHighlighter>
                      )
                    ) : (
                      <div style={{ padding: 16, color: 'var(--text-2)', fontSize: 12 }}>Select a file</div>
                    )}
                  </div>

                  <DragHandle handleId="split" onDrag={handleSplitDrag} />

                  <div
                    ref={previewContainerRef}
                    data-pane="split-preview"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      position: 'relative',
                      display: 'flex',
                      alignItems: device === 'desktop' ? 'stretch' : 'flex-start',
                      justifyContent: 'center',
                      background: device !== 'desktop' ? 'color-mix(in srgb, var(--bg-0) 82%, #000)' : 'var(--bg-0)',
                      overflow: 'auto',
                      padding: device !== 'desktop' ? '24px 16px' : 0,
                    }}
                  >
                    <iframe
                      key={`${refreshKey}-${device}-${viewMode}`}
                      srcDoc={previewHtml || ''}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                      style={{
                        width: DEVICE_WIDTHS[device],
                        height: DEVICE_HEIGHTS[device],
                        border: device !== 'desktop' ? '1px solid #bbb' : 'none',
                        borderRadius: device === 'mobile' ? 24 : device === 'tablet' ? 12 : 0,
                        background: '#fff',
                        boxShadow: device !== 'desktop' ? '0 16px 56px rgba(0,0,0,0.28)' : 'none',
                        transition: 'width 0.2s ease, border-radius 0.2s ease',
                        flexShrink: 0,
                      }}
                      title="Design Preview"
                    />
                    {renderInlineCommentLayer()}
                  </div>
                </div>
              ) : viewMode === 'code' ? (
                <div style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                  {selectedFile ? (
                    isEditingCode ? (
                      <textarea
                        value={selectedFile.content}
                        onChange={e => handleCodeEdit(e.target.value)}
                        spellCheck={false}
                        style={{
                          width: '100%', height: '100%', minHeight: '100%',
                          background: '#06060e', color: '#d4d4d4',
                          border: 'none', outline: 'none', resize: 'none',
                          fontFamily: 'var(--font-mono)', fontSize: 12,
                          lineHeight: 1.65, padding: '14px 16px',
                          boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={selectedFile.language || 'text'}
                        PreTag="div"
                        customStyle={{
                          margin: 0, borderRadius: 0, background: '#06060e',
                          fontSize: 12, padding: '14px 16px', minHeight: '100%', lineHeight: 1.65,
                        }}
                      >
                        {selectedFile.content}
                      </SyntaxHighlighter>
                    )
                  ) : (
                    <div style={{ padding: 16, color: 'var(--text-2)', fontSize: 12 }}>Select a file</div>
                  )}
                </div>
              ) : (
                <div
                  ref={previewContainerRef}
                  data-pane="preview"
                  style={{
                    height: '100%',
                    position: 'relative',
                    display: 'flex',
                    alignItems: device === 'desktop' ? 'stretch' : 'flex-start',
                    justifyContent: 'center',
                    background: device !== 'desktop' ? 'color-mix(in srgb, var(--bg-0) 82%, #000)' : 'var(--bg-0)',
                    overflow: 'auto',
                    padding: device !== 'desktop' ? '24px 16px' : 0,
                  }}
                >
                  <iframe
                    key={`${refreshKey}-${device}-${viewMode}`}
                    srcDoc={previewHtml || ''}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                    style={{
                      width: DEVICE_WIDTHS[device],
                      height: DEVICE_HEIGHTS[device],
                      border: device !== 'desktop' ? '1px solid #bbb' : 'none',
                      borderRadius: device === 'mobile' ? 24 : device === 'tablet' ? 12 : 0,
                      background: '#fff',
                      boxShadow: device !== 'desktop' ? '0 16px 56px rgba(0,0,0,0.28)' : 'none',
                      transition: 'width 0.2s ease, border-radius 0.2s ease',
                      flexShrink: 0,
                    }}
                    title="Design Preview"
                  />
                  {renderInlineCommentLayer()}
                </div>
              )}
            </div>
          )}
        </div>

        <DragHandle order={1} handleId="chat" onDrag={d => setChatW(w => Math.max(260, Math.min(560, w + d)))} />

        {/* ── RIGHT: CHAT ────────────────────────────────────────────────────── */}
        <div style={{
          order: 0,
          width: chatW, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-1)',
        }}>
          {/* Chat header */}
          <div style={{
            height: 36, display: 'flex', alignItems: 'center',
            padding: '0 12px', borderBottom: '1px solid var(--border)',
            gap: 6, flexShrink: 0,
          }}>
            <span style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>DESIGN CHAT</span>
            <div style={{ flex: 1 }} />
            <button type="button" style={{ ...btn(false), padding: '2px 6px', fontSize: 10 }} onClick={requestVariations} disabled={!canEdit || isLoading}>3 Variants</button>
            <button type="button" style={{ ...btn(false), padding: '2px 6px', fontSize: 10 }} onClick={requestAccessibilityReview} disabled={!canEdit || isLoading}>A11y pass</button>
            {isLoading && <Loader size={11} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />}
          </div>

          {inlineComments.length > 0 && (
            <div style={{
              borderBottom: '1px solid var(--border)',
              padding: '8px 10px',
              background: 'var(--bg-0)',
              maxHeight: 180,
              overflowY: 'auto',
              flexShrink: 0,
            }}>
              <div style={{
                fontSize: 9,
                letterSpacing: '0.1em',
                color: 'var(--text-2)',
                fontFamily: 'var(--font-mono)',
                marginBottom: 6,
              }}>
                INLINE COMMENTS ({inlineComments.filter((row) => !row.resolved).length} open)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...inlineComments].slice(-6).map((comment) => (
                  <div key={comment.id} style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '6px 8px',
                    background: comment.resolved ? 'var(--bg-2)' : 'var(--bg-1)',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-1)', lineHeight: 1.45, marginBottom: 6 }}>
                      ({Math.round(comment.xPct)}%, {Math.round(comment.yPct)}%) {comment.text}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button type="button" style={{ ...btn(false), padding: '2px 6px', fontSize: 10 }} onClick={() => applyInlineComment(comment)} disabled={!canEdit || isLoading}>Apply</button>
                      <button type="button" style={{ ...btn(Boolean(comment.resolved)), padding: '2px 6px', fontSize: 10 }} onClick={() => toggleInlineComment(comment.id)}>{comment.resolved ? 'Reopen' : 'Done'}</button>
                      <button type="button" style={{ ...btn(false), padding: '2px 6px', fontSize: 10 }} onClick={() => removeInlineComment(comment.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {messages.length === 0 && (
              <div style={{ paddingTop: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>Quick starts</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                  {STARTERS.map(s => (
                    <button key={s.label} type="button" onClick={() => void sendMessage(s.prompt)}
                      style={{
                        textAlign: 'left', padding: '7px 9px', borderRadius: 8,
                        border: '1px solid var(--border)', background: 'var(--bg-2)',
                        color: 'var(--text-1)', fontSize: 10, cursor: 'pointer', lineHeight: 1.4,
                      }}>
                      <div style={{ fontSize: 16, marginBottom: 3 }}>{s.icon}</div>
                      <div style={{ fontWeight: 500 }}>{s.label}</div>
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 10, border: '1px solid var(--border)', background: 'var(--bg-2)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 18, height: 18, borderRadius: 999, background: 'var(--accent-dim)', color: 'var(--accent)', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800 }}>?</span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-0)' }}>Quick brief - 30 seconds</div>
                      <div style={{ fontSize: 9, color: 'var(--text-2)' }}>Seed the project like Open Design before generation.</div>
                    </div>
                  </div>
                  <div style={{ padding: 10, display: 'grid', gap: 7 }}>
                    {[
                      ['Studio name and one-line positioning', 'e.g. Field Studio - design practice for climate-tech founders'],
                      ['Who you are pitching', 'e.g. seed-stage VCs / design-led SaaS buyers'],
                      ['The ask', 'e.g. 10-screen pitch deck, landing page, mobile app'],
                    ].map(([label, placeholder]) => (
                      <label key={label} style={{ display: 'grid', gap: 3 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{label}</span>
                        <input
                          placeholder={placeholder}
                          onChange={(event) => {
                            const value = event.target.value.trim()
                            if (value) setInput((prev) => prev || value)
                          }}
                          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text-1)', fontSize: 10, padding: '5px 7px', outline: 'none' }}
                        />
                      </label>
                    ))}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <button type="button" onClick={() => { setShowDesignSystem(true); updateDesignSystem({ direction: 'auto' }) }} style={{ ...btn(false), justifyContent: 'center', fontSize: 9, padding: '5px 6px' }}>Pick direction</button>
                      <button type="button" onClick={() => fileInputRef.current?.click()} style={{ ...btn(false), justifyContent: 'center', fontSize: 9, padding: '5px 6px' }}>Attach reference</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Plan checklist card */}
            {planItems.length > 0 && (
              <div style={{
                marginBottom: 10, padding: '10px 12px', borderRadius: 10,
                background: 'var(--bg-2)', border: '1px solid var(--border)',
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                  color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginBottom: 8,
                }}>
                  BUILD PLAN
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {planItems.map((item, i) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPlanItems(prev => prev.map(p => p.id === item.id ? { ...p, done: !p.done } : p))}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 7,
                        background: 'none', border: 'none', cursor: 'pointer',
                        textAlign: 'left', padding: '2px 0',
                      }}
                    >
                      {item.done
                        ? <CheckSquare size={13} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
                        : <Square size={13} color="var(--text-2)" style={{ flexShrink: 0, marginTop: 1 }} />}
                      <span style={{
                        fontSize: 11, lineHeight: 1.45,
                        color: item.done ? 'var(--text-2)' : 'var(--text-0)',
                        textDecoration: item.done ? 'line-through' : 'none',
                      }}>
                        {i + 1}. {item.text}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} style={{
                marginBottom: 10, display: 'flex', flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '95%', padding: '7px 11px',
                  borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-2)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-0)',
                  fontSize: 12, lineHeight: 1.55, wordBreak: 'break-word',
                }}>
                  {msg.role === 'assistant'
                    ? renderAssistantMessage(msg)
                    : msg.content}
                </div>
                {msg.role === 'assistant' && msg.files && msg.files.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {msg.files.map(f => (
                      <button key={f.id} type="button"
                        onClick={() => { setSelectedFileId(f.id); setViewMode('code') }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '2px 7px', borderRadius: 4,
                          border: '1px solid var(--border)', background: 'var(--bg-3)',
                          color: 'var(--text-1)', fontSize: 10, cursor: 'pointer',
                          fontFamily: 'var(--font-mono)',
                        }}>
                        {getFileIcon(f.name)} {f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {error && (
              <div style={{
                padding: '8px 10px', borderRadius: 8, marginBottom: 8,
                background: 'rgba(255,60,60,0.08)', border: '1px solid rgba(255,80,80,0.25)',
                color: '#ff7070', fontSize: 11,
              }}>
                ⚠ {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Assets strip */}
          {assets.length > 0 && (
            <div style={{
              borderTop: '1px solid var(--border)', padding: '6px 10px',
              display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0,
            }}>
              {assets.map(a => (
                <div key={a.id} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 2, flexShrink: 0, width: 52,
                }}>
                  {a.type.startsWith('image/') ? (
                    <img src={a.dataUrl} alt={a.name}
                      style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />
                  ) : (
                    <div style={{ width: 40, height: 40, background: 'var(--bg-2)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileIcon size={16} color="var(--text-2)" />
                    </div>
                  )}
                  <span style={{ fontSize: 9, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 52 }}>{a.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px', flexShrink: 0 }}>
            <textarea
              value={projectContext}
              onChange={e => setProjectContext(e.target.value)}
              placeholder="Project context (design system rules, codebase constraints, target users)..."
              rows={2}
              style={{
                width: '100%', resize: 'vertical', background: 'var(--bg-1)',
                border: '1px solid var(--border)', borderRadius: 8,
                color: 'var(--text-1)', fontSize: 11, padding: '6px 8px',
                outline: 'none', fontFamily: 'var(--font-mono)', lineHeight: 1.4,
                boxSizing: 'border-box', display: 'block', marginBottom: 6,
              }}
            />
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(input) }
              }}
              onPaste={(e: React.ClipboardEvent<HTMLTextAreaElement>) => {
                const items = e.clipboardData?.items
                if (!items) return
                const files: File[] = []
                for (let i = 0; i < items.length; i++) {
                  if (items[i].kind === 'file') {
                    const f = items[i].getAsFile()
                    if (f) {
                      const name = f.name && f.name !== 'image.png' ? f.name : `screenshot-${Date.now()}.png`
                      files.push(new File([f], name, { type: f.type }))
                    }
                  }
                }
                if (files.length > 0) {
                  e.preventDefault()
                  const dt = new DataTransfer()
                  files.forEach(f => dt.items.add(f))
                  void handleAssetUpload(dt.files)
                }
              }}
              placeholder="Describe your design or request changes — paste screenshots directly"
              rows={3}
              style={{
                width: '100%', resize: 'none', background: 'var(--bg-2)',
                border: '1px solid var(--border)', borderRadius: 8,
                color: 'var(--text-0)', fontSize: 12, padding: '7px 9px',
                outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
                boxSizing: 'border-box', display: 'block',
              }}
            />
            <div style={{ display: 'flex', gap: 5, marginTop: 6, alignItems: 'center' }}>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                disabled={!canEdit}
                style={{ ...btn(false), fontSize: 10 }}>
                <Upload size={11} /> Asset
              </button>
              <input ref={fileInputRef} type="file" multiple accept="image/*,.css,.js,.json,.html,.ts,.tsx,.jsx,.md,.txt,.py,.yaml,.yml"
                style={{ display: 'none' }}
                onChange={e => void handleAssetUpload(e.target.files)} />
              <div style={{ flex: 1 }} />
              {isLoading ? (
                <button
                  type="button"
                  onClick={cancelRequest}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 14px', borderRadius: 7, border: '1px solid rgba(255,80,80,0.4)',
                    background: 'rgba(255,60,60,0.08)',
                    color: '#ff6b6b',
                    fontSize: 12, cursor: 'pointer', fontWeight: 500,
                  }}
                >
                  <StopCircle size={12} /> Cancel
                </button>
              ) : (
                <button type="button"
                  disabled={!input.trim() || !canEdit}
                  onClick={() => void sendMessage(input)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 14px', borderRadius: 7, border: 'none',
                    background: input.trim() && canEdit ? 'var(--accent)' : 'var(--bg-3)',
                    color: input.trim() && canEdit ? '#fff' : 'var(--text-2)',
                    fontSize: 12, cursor: input.trim() && canEdit ? 'pointer' : 'not-allowed',
                    fontWeight: 500,
                  }}>
                  <Send size={12} /> Send
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
