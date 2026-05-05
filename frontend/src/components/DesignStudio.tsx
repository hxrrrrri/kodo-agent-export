import {
  useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent,
  MouseEvent as ReactMouseEvent, ReactNode,
} from 'react'
import {
  Monitor, Tablet, Smartphone, Download, RefreshCw,
  Upload, Send, Trash2, Eye, Code, File as FileIcon,
  ExternalLink, Wand2, SplitSquareHorizontal, Maximize2,
  Minimize2, ChevronRight, ChevronDown, RotateCcw, Copy,
  MessageSquare, Share2, Package, Printer, Save,
  Folder, FolderOpen, Loader, ArrowLeft, CheckSquare,
  StopCircle, Pencil, Plus, Clock, Images, Film, Sparkles,
  Layers, Search,
} from 'lucide-react'
import { buildApiHeaders } from '../lib/api'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import JSZip from 'jszip'
import VisualWebEditorArtifact, { VisualEditorSourcePayload } from './VisualWebEditorArtifact'
import { DESIGN_SYSTEM_PRESETS as BUNDLED_DESIGN_SYSTEM_PRESETS } from '../lib/designSystemPresets'

const API = '/api/chat'
export const DESIGN_STUDIO_STORAGE_KEY = 'kodo.design-studio.state.v1'
const MAX_PERSISTED_MESSAGES = 40
const MAX_PERSISTED_HISTORY = 20
const MAX_PERSISTED_MESSAGE_FILE_CHARS = 200000
const MAX_CHAT_MESSAGE_CHARS = 7600
const MAX_CHAT_CONTEXT_CHARS = 3200
const MAX_CHAT_ASSET_CHARS = 900
const DESIGN_GENERATION_MAX_TOKENS = 16384

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  if (maxChars <= 80) return value.slice(0, maxChars)
  return `${value.slice(0, maxChars - 48).trimEnd()}\n...[truncated for request size]`
}

function formatApiErrorDetail(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const sizeError = detail.find((item) => {
      if (!item || typeof item !== 'object') return false
      const msg = 'msg' in item ? String((item as { msg?: unknown }).msg || '') : ''
      return msg.includes('at most 12000')
    })
    if (sizeError) {
      return 'The design brief was too large to send. Kodo compacted future prompts automatically; try sending again.'
    }
    return detail
      .map((item) => {
        if (!item || typeof item !== 'object') return String(item)
        const loc = 'loc' in item ? (item as { loc?: unknown }).loc : undefined
        const msg = 'msg' in item ? (item as { msg?: unknown }).msg : undefined
        return [Array.isArray(loc) ? loc.join('.') : '', msg ? String(msg) : ''].filter(Boolean).join(': ')
      })
      .filter(Boolean)
      .join('\n') || fallback
  }
  if (detail && typeof detail === 'object') {
    try { return JSON.stringify(detail) } catch { return fallback }
  }
  return fallback
}

export function buildChatMessagePayload(contextSections: string[], prefix: string, prompt: string): string {
  const compactedSections = contextSections.map((section) => truncateText(section, MAX_CHAT_CONTEXT_CHARS))
  const build = (sections: string[]) => [
    prefix,
    sections.length > 0 ? `${sections.join('\n\n')}\n\n` : '',
    prompt,
  ].join('')

  const full = build(compactedSections)
  if (full.length <= MAX_CHAT_MESSAGE_CHARS) return full

  const reserved = prefix.length + prompt.length + 4
  const contextBudget = Math.max(0, MAX_CHAT_MESSAGE_CHARS - reserved)
  if (contextBudget <= 0) {
    return `${prefix}${truncateText(prompt, Math.max(500, MAX_CHAT_MESSAGE_CHARS - prefix.length))}`
  }

  const nextSections: string[] = []
  let remaining = contextBudget
  compactedSections.forEach((section, index) => {
    if (remaining <= 0) return
    const remainingSections = compactedSections.length - index - 1
    const sectionBudget = Math.max(260, remaining - remainingSections * 260)
    const next = truncateText(section, sectionBudget)
    nextSections.push(next)
    remaining -= next.length + 2
  })

  return truncateText(build(nextSections), MAX_CHAT_MESSAGE_CHARS)
}

function streamErrorMessage(event: Record<string, unknown>): string {
  return String(event.message || event.error || event.detail || 'The model stream failed before returning a response.')
}

function planItemsFromTodos(todos: unknown): { id: string; text: string; done: boolean }[] {
  if (!Array.isArray(todos)) return []
  return todos
    .map((todo, index) => {
      if (!todo || typeof todo !== 'object') return null
      const row = todo as Record<string, unknown>
      const title = String(row.title || row.text || '').trim()
      if (!title) return null
      return {
        id: String(row.id || `step-${index + 1}`),
        text: title,
        done: String(row.status || '').toLowerCase() === 'completed',
      }
    })
    .filter((item): item is { id: string; text: string; done: boolean } => item !== null)
}

function textFromStreamEvent(event: Record<string, unknown>): string {
  const type = String(event.type || '').toLowerCase()
  if (type !== 'text' && type !== 'assistant_text' && type !== 'content_delta') return ''
  const value = event.content ?? event.text ?? event.delta
  return typeof value === 'string' ? value : ''
}

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

interface DesignTokenRow {
  name: string
  value: string
  description: string
}

interface DesignTokenGroup {
  label: string
  tokens: DesignTokenRow[]
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
  logoUrl?: string
  sourceUrl?: string
  livePreviewHtml?: string
  tokenGroups?: DesignTokenGroup[]
  extractedAt?: string
  extraction?: {
    generator?: string
    cssVarCount?: number
    sourceCssFiles?: number
    sourceStyleBlocks?: number
  }
}

interface UserDesignPreset extends DesignSystemPreset {
  isUserDefined: true
  createdAt: number
}

const DESIGN_SYSTEM_PRESETS = BUNDLED_DESIGN_SYSTEM_PRESETS as DesignSystemPreset[]

const USER_DS_KEY = 'kodo.user.design.systems.v1'

function readUserDesignSystems(): UserDesignPreset[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const parsed = JSON.parse(localStorage.getItem(USER_DS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === 'string') : []
  } catch {
    return []
  }
}

function allDesignSystemPresets(userSystems?: UserDesignPreset[]): DesignSystemPreset[] {
  return [...(userSystems ?? readUserDesignSystems()), ...DESIGN_SYSTEM_PRESETS]
}

function useUserDesignSystems() {
  const [systems, setSystems] = useState<UserDesignPreset[]>(readUserDesignSystems)
  const save = (preset: UserDesignPreset) => setSystems(prev => {
    const next = [preset, ...prev.filter(p => p.id !== preset.id)]
    localStorage.setItem(USER_DS_KEY, JSON.stringify(next))
    return next
  })
  const remove = (id: string) => setSystems(prev => {
    const next = prev.filter(p => p.id !== id)
    localStorage.setItem(USER_DS_KEY, JSON.stringify(next))
    return next
  })
  return { systems, save, remove }
}

const PRESET_LOGOS: Record<string, string> = {
  'claude-warm': 'https://github.com/anthropics.png?size=40',
  'openai-research': 'https://github.com/openai.png?size=40',
  'anthropic-editorial': 'https://github.com/anthropics.png?size=40',
  'huggingface-community': 'https://github.com/huggingface.png?size=40',
  'mistral-ai': 'https://github.com/mistralai.png?size=40',
  'elevenlabs-audio': 'https://github.com/elevenlabs.png?size=40',
  'ollama-local': 'https://github.com/ollama.png?size=40',
  'together-ai': 'https://github.com/togethercomputer.png?size=40',
  'opencode-ai': 'https://github.com/opencode-ai.png?size=40',
  'minimax-ai': 'https://github.com/MiniMax-AI.png?size=40',
  'voltagent': 'https://github.com/VoltAgent.png?size=40',
  'cohere-enterprise': 'https://github.com/cohere-ai.png?size=40',
  'xai-mono': 'https://github.com/xai-org.png?size=40',
  'deepseek-tech': 'https://github.com/deepseek-ai.png?size=40',
  'linear-minimal': 'https://github.com/linear.png?size=40',
  'vercel-mono': 'https://github.com/vercel.png?size=40',
  'cursor-agentic': 'https://www.google.com/s2/favicons?domain=cursor.sh&sz=64',
  'supabase-dev': 'https://github.com/supabase.png?size=40',
  'github-utility': 'https://github.com/github.png?size=40',
  'raycast-command': 'https://github.com/raycast.png?size=40',
  'warp-terminal': 'https://github.com/warpdotdev.png?size=40',
  'expo-platform': 'https://github.com/expo.png?size=40',
  'hashicorp-infra': 'https://github.com/hashicorp.png?size=40',
  'sentry-ops': 'https://github.com/getsentry.png?size=40',
  'mintlify-docs': 'https://github.com/mintlify.png?size=40',
  'resend-email': 'https://github.com/resend.png?size=40',
  'replicate-ml': 'https://github.com/replicate.png?size=40',
  'composio-dev': 'https://github.com/ComposioHQ.png?size=40',
  'posthog-analytics': 'https://github.com/PostHog.png?size=40',
  'arc-browser': 'https://www.google.com/s2/favicons?domain=arc.net&sz=64',
  'stripe-gradient': 'https://github.com/stripe.png?size=40',
  'coinbase-crypto': 'https://github.com/coinbase.png?size=40',
  'revolut-finance': 'https://www.google.com/s2/favicons?domain=revolut.com&sz=64',
  'wise-fintech': 'https://www.google.com/s2/favicons?domain=wise.com&sz=64',
  'binance-crypto': 'https://www.google.com/s2/favicons?domain=binance.com&sz=64',
  'mastercard-brand': 'https://github.com/mastercard.png?size=40',
  'kraken-exchange': 'https://www.google.com/s2/favicons?domain=kraken.com&sz=64',
  'apple-glass': 'https://github.com/apple.png?size=40',
  'airbnb-warm': 'https://github.com/airbnb.png?size=40',
  'spotify-audio': 'https://github.com/spotify.png?size=40',
  'nike-performance': 'https://www.google.com/s2/favicons?domain=nike.com&sz=64',
  'starbucks-brand': 'https://github.com/starbucks.png?size=40',
  'meta-store': 'https://github.com/facebook.png?size=40',
  'tesla-product': 'https://www.google.com/s2/favicons?domain=tesla.com&sz=64',
  'ferrari-red': 'https://www.google.com/s2/favicons?domain=ferrari.com&sz=64',
  'lamborghini-hex': 'https://www.google.com/s2/favicons?domain=lamborghini.com&sz=64',
  'bugatti-mono': 'https://www.google.com/s2/favicons?domain=bugatti.com&sz=64',
  'porsche-precision': 'https://www.google.com/s2/favicons?domain=porsche.com&sz=64',
  'mercedes-luxury': 'https://www.google.com/s2/favicons?domain=mercedes-benz.com&sz=64',
  'renault-aurora': 'https://github.com/renault.png?size=40',
  'spacex-stark': 'https://www.google.com/s2/favicons?domain=spacex.com&sz=64',
  'figma-creative': 'https://github.com/figma.png?size=40',
  'framer-motion': 'https://github.com/framer.png?size=40',
  'webflow-creator': 'https://github.com/webflow.png?size=40',
  'canva-playful': 'https://github.com/Canva.png?size=40',
  'miro-workshop': 'https://github.com/miroapp.png?size=40',
  'airtable-db': 'https://github.com/Airtable.png?size=40',
  'clay-agency': 'https://github.com/clay-run.png?size=40',
  'shadcn-system': 'https://github.com/shadcn-ui.png?size=40',
  'theverge-editorial': 'https://www.google.com/s2/favicons?domain=theverge.com&sz=64',
  'wired-magazine': 'https://www.google.com/s2/favicons?domain=wired.com&sz=64',
  'ibm-carbon': 'https://github.com/ibm.png?size=40',
  'intercom-friendly': 'https://github.com/intercom.png?size=40',
  'atlassian-team': 'https://github.com/atlassian.png?size=40',
  'material-google': 'https://github.com/google.png?size=40',
  'microsoft-fluent': 'https://github.com/microsoft.png?size=40',
  'salesforce-crm': 'https://github.com/salesforce.png?size=40',
  'superhuman-email': 'https://www.google.com/s2/favicons?domain=superhuman.com&sz=64',
  'hubspot-marketing': 'https://github.com/HubSpot.png?size=40',
  'pagerduty-incident': 'https://github.com/PagerDuty.png?size=40',
  'nvidia-ai': 'https://github.com/NVIDIA.png?size=40',
  'playstation-dark': 'https://www.google.com/s2/favicons?domain=playstation.com&sz=64',
  'mongodb-db': 'https://github.com/mongodb.png?size=40',
  'sanity-cms': 'https://github.com/sanity-io.png?size=40',
  'lovable-builder': 'https://github.com/lovablelabs.png?size=40',
  'clickhouse-db': 'https://github.com/ClickHouse.png?size=40',
  'datadog-ops': 'https://github.com/DataDog.png?size=40',
  'vodafone-brand': 'https://github.com/vodafone.png?size=40',
  'netflix-streaming': 'https://github.com/Netflix.png?size=40',
  'discord-community': 'https://github.com/discord.png?size=40',
  'notion-editorial': 'https://github.com/makenotion.png?size=40',
  'dropbox-work': 'https://github.com/dropbox.png?size=40',
  'cal-scheduling': 'https://github.com/calcom.png?size=40',
  'loom-video': 'https://github.com/loomhq.png?size=40',
  'zapier-orange': 'https://github.com/zapier.png?size=40',
  'mailchimp-friendly': 'https://github.com/mailchimp.png?size=40',
  'amazon-commerce': 'https://github.com/amzn.png?size=40',
  'runwayml-cinematic': 'https://github.com/runwayml.png?size=40',
  'pinterest': 'https://github.com/pinterest.png?size=40',
  'shopify': 'https://www.google.com/s2/favicons?domain=shopify.com&sz=64',
  'apple': 'https://github.com/apple.png?size=40',
  'airbnb': 'https://github.com/airbnb.png?size=40',
  'bugatti': 'https://www.google.com/s2/favicons?domain=bugatti.com&sz=64',
  'ferrari': 'https://www.google.com/s2/favicons?domain=ferrari.com&sz=64',
  'lamborghini': 'https://www.google.com/s2/favicons?domain=lamborghini.com&sz=64',
  'renault': 'https://www.google.com/s2/favicons?domain=renault.com&sz=64',
  'spacex': 'https://www.google.com/s2/favicons?domain=spacex.com&sz=64',
  'tesla': 'https://www.google.com/s2/favicons?domain=tesla.com&sz=64',
  'nike': 'https://www.google.com/s2/favicons?domain=nike.com&sz=64',
  'starbucks': 'https://github.com/starbucks.png?size=40',
  'xiaohongshu-social': 'https://www.google.com/s2/favicons?domain=xiaohongshu.com&sz=64',
  'notion': 'https://github.com/makenotion.png?size=40',
  'airtable': 'https://github.com/Airtable.png?size=40',
  'cal': 'https://github.com/calcom.png?size=40',
  'clay': 'https://www.google.com/s2/favicons?domain=clay.com&sz=64',
  'figma': 'https://github.com/figma.png?size=40',
  'framer': 'https://github.com/framer.png?size=40',
  'lovable': 'https://github.com/lovablelabs.png?size=40',
  'miro': 'https://github.com/miroapp.png?size=40',
  'sanity': 'https://github.com/sanity-io.png?size=40',
  'webflow': 'https://github.com/webflow.png?size=40',
  'zapier': 'https://github.com/zapier.png?size=40',
  'cursor': 'https://www.google.com/s2/favicons?domain=cursor.sh&sz=64',
  'raycast': 'https://github.com/raycast.png?size=40',
  'resend': 'https://github.com/resend.png?size=40',
  'clickhouse': 'https://github.com/ClickHouse.png?size=40',
  'ibm': 'https://github.com/ibm.png?size=40',
  'intercom': 'https://github.com/intercom.png?size=40',
  'mongodb': 'https://github.com/mongodb.png?size=40',
  'superhuman': 'https://www.google.com/s2/favicons?domain=superhuman.com&sz=64',
  'vodafone': 'https://github.com/vodafone.png?size=40',
  'binance': 'https://www.google.com/s2/favicons?domain=binance.com&sz=64',
  'coinbase': 'https://github.com/coinbase.png?size=40',
  'kraken': 'https://www.google.com/s2/favicons?domain=kraken.com&sz=64',
  'mastercard': 'https://github.com/mastercard.png?size=40',
  'revolut': 'https://www.google.com/s2/favicons?domain=revolut.com&sz=64',
  'wise': 'https://www.google.com/s2/favicons?domain=wise.com&sz=64',
  'nvidia': 'https://github.com/NVIDIA.png?size=40',
  'playstation': 'https://www.google.com/s2/favicons?domain=playstation.com&sz=64',
  'theverge': 'https://www.google.com/s2/favicons?domain=theverge.com&sz=64',
  'wired': 'https://www.google.com/s2/favicons?domain=wired.com&sz=64',
  'substack-newsletter': 'https://www.google.com/s2/favicons?domain=substack.com&sz=64',
}

// â”€â”€â”€ Prompt Gallery â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type PromptTemplate = {
  id: string
  title: string
  description: string
  category: 'image' | 'video' | 'motion' | 'web' | 'deck' | 'social'
  prompt: string
  tags: string[]
}

const PROMPT_GALLERY: PromptTemplate[] = [
  // Image templates
  { id: 'img-01', title: 'Swiss Style Poster', description: 'Bold typographic poster with Swiss International grid', category: 'image', tags: ['poster', 'typography', 'print'],
    prompt: 'Swiss International style poster, bold Helvetica Neue typography, strict grid alignment, primary red and black on white, geometric precision, 1960s Zurich aesthetic, ultra-high resolution, print-ready' },
  { id: 'img-02', title: 'Product Key Art', description: 'Clean product hero image on minimal background', category: 'image', tags: ['product', 'marketing'],
    prompt: 'Premium product photograph, centered composition on pure white background, three-point studio lighting from upper left, sharp product focus, soft shadow below, commercial photography aesthetic, ultra high resolution' },
  { id: 'img-03', title: 'Dark Tech Poster', description: 'Dark cyberpunk-inspired developer conference poster', category: 'image', tags: ['tech', 'poster', 'dark'],
    prompt: 'Dark tech conference poster, deep navy background, circuit board geometric lines as subtle texture, bold sans-serif headline in electric blue, minimalist futuristic aesthetic, Dribbble-worthy digital art' },
  { id: 'img-04', title: 'Editorial Portrait', description: 'Magazine-style editorial portrait composition', category: 'image', tags: ['portrait', 'editorial', 'magazine'],
    prompt: 'Editorial magazine portrait, warm directional lighting, subject at 2/3 turn, shallow depth of field, Leica M aesthetic, natural film grain, fashion-magazine color grading, confident composed expression' },
  { id: 'img-05', title: 'Minimal App Icon', description: 'Clean iOS-style app icon with simple geometric mark', category: 'image', tags: ['icon', 'app', 'mobile'],
    prompt: 'iOS app icon, rounded square 1024x1024, centered geometric minimal symbol, gradient from deep blue to purple, glossy surface treatment, subtle inner shadow, Apple Human Interface Guidelines compliant style' },
  { id: 'img-06', title: 'Data Visualization Art', description: 'Beautiful abstract data art from flow patterns', category: 'image', tags: ['data', 'abstract', 'art'],
    prompt: 'Abstract data visualization art, fluid flow field lines, overlapping translucent curves, deep black background, electric cyan and magenta palette, resembles particle physics simulation, gallery-quality digital artwork' },
  { id: 'img-07', title: 'Brand Mark Exploration', description: 'Geometric abstract logo concept on gradient', category: 'image', tags: ['logo', 'branding'],
    prompt: 'Abstract logo mark exploration, bold geometric shapes, interlocking forms, single color on white, professional brand identity concept, vector-clean edges, timeless mark design' },
  { id: 'img-08', title: 'Social Media Avatar', description: 'Professional headshot-style avatar for social profiles', category: 'image', tags: ['avatar', 'social', 'portrait'],
    prompt: 'Professional LinkedIn-style profile photo, soft natural window light, neutral gray studio background, subject in business casual attire, genuine smile, sharp focus on eyes, bokeh background blur' },
  { id: 'img-09', title: 'Infographic Header', description: 'Bold visual header for a data-driven infographic', category: 'image', tags: ['infographic', 'header'],
    prompt: 'Bold editorial infographic header illustration, isometric city buildings, data charts integrated into architecture, vibrant blue and teal palette on dark navy, flat illustration style, editorial quality' },
  { id: 'img-10', title: 'Event Banner', description: 'Conference or event promotional banner', category: 'image', tags: ['event', 'banner', 'marketing'],
    prompt: 'Professional conference banner, 1920x1080, bold headline text zone top-left, speaker/stage photography zone right, brand color gradient overlay, clean sans-serif typography, corporate but dynamic energy' },
  { id: 'img-11', title: 'Luxury Product Photo', description: 'High-end luxury product photography style', category: 'image', tags: ['luxury', 'product', 'premium'],
    prompt: 'Luxury product photography, dark velvet or marble surface, single product centered, dramatic Rembrandt lighting, deep shadows, one specular highlight, editorial luxury magazine aesthetic, HermÃ¨s or Bottega quality' },
  { id: 'img-12', title: 'Startup Feature Illustration', description: 'Friendly tech illustration for product marketing', category: 'image', tags: ['illustration', 'startup', 'feature'],
    prompt: 'Product feature illustration, clean flat design, isometric perspective, three human figures collaborating around floating UI elements, bright accent colors on white, Notion or Linear website illustration style' },
  // Video / Seedance templates
  { id: 'vid-01', title: 'Product Launch Reveal', description: '15-second cinematic product reveal sequence', category: 'video', tags: ['product', 'reveal', 'launch'],
    prompt: 'Cinematic 15-second product reveal, black void background, product emerges from darkness with dramatic lighting, slow 360Â° rotation, fog particle effects, building orchestral score vibe, Apple-product-launch quality' },
  { id: 'vid-02', title: 'Brand Story Short', description: 'Emotional brand narrative in 15 seconds', category: 'video', tags: ['brand', 'story', 'emotional'],
    prompt: '15-second brand story, golden hour exterior shots, real people in natural settings, product integrated naturally into daily life, warm cinematic color grade, gentle music implied, honest and human' },
  { id: 'vid-03', title: 'Tech Demo Reel', description: 'Fast-cut technical product demonstration', category: 'video', tags: ['tech', 'demo', 'SaaS'],
    prompt: '15-second rapid-cut tech product demo, screen recordings of UI animated, split-screen comparisons, smooth transitions, clean corporate energy, blue and white palette, startup pitch video aesthetic' },
  { id: 'vid-04', title: 'Social Media Teaser', description: 'Punchy social-first teaser for new announcement', category: 'video', tags: ['social', 'teaser', 'announcement'],
    prompt: '15-second social teaser video, square format, punchy text reveals on black, rhythmic cut to music beat implied, neon accent colors, ending on product logo lock-up with call to action' },
  { id: 'vid-05', title: 'Conference Opener', description: 'High-energy conference opening title sequence', category: 'video', tags: ['conference', 'opener', 'event'],
    prompt: '15-second conference opening sequence, light particles converging into event logo, dramatic orchestral build, 3D volumetric light rays, dark environment, cinematic wide aspect ratio, event branding colors' },
  // Motion / HyperFrames templates
  { id: 'mot-01', title: 'Kinetic Logo Reveal', description: 'Animated logo reveal with kinetic typography', category: 'motion', tags: ['logo', 'reveal', 'kinetic'],
    prompt: 'Kinetic logo reveal animation, letters fly in from off-screen with spring easing, stagger 0.1s per character, settle into final centered position, accent underline draws in after, total duration 1.8s, clean dark background' },
  { id: 'mot-02', title: 'Data Dashboard Intro', description: 'Animated dashboard with numbers counting up', category: 'motion', tags: ['dashboard', 'data', 'numbers'],
    prompt: 'Dashboard number reveal animation, four KPI cards staggered in from bottom, numbers count up from zero with easing, sparklines draw in after, color transitions from neutral to accent on completion, 2.5s total' },
  { id: 'mot-03', title: 'Feature Spotlight', description: 'Product feature highlight with floating UI elements', category: 'motion', tags: ['feature', 'product', 'UI'],
    prompt: 'Product feature spotlight loop, central interface mockup, three feature labels orbit with gentle float, connecting lines draw in sequence, subtle glow pulse on active element, seamless 4s loop, dark premium background' },
  { id: 'mot-04', title: 'Social Story Template', description: 'Animated Instagram story with text reveals', category: 'motion', tags: ['social', 'story', 'instagram'],
    prompt: 'Instagram story animation, 1080x1920, bold headline slides in from left, supporting text fades in below, brand chip appears top-left, background is dark gradient with subtle noise, total 3s for screenshot capture' },
  { id: 'mot-05', title: 'Conference Countdown', description: 'Dramatic countdown timer with particle effects', category: 'motion', tags: ['countdown', 'event', 'conference'],
    prompt: 'Conference countdown display, large countdown numbers with flip-clock animation, particle burst on each second transition, event name above in bold caps, logo below, dark atmospheric background, total 5s loop' },
  { id: 'mot-06', title: 'Orbital Brand Loop', description: 'Rotating orbital rings brand identity animation', category: 'motion', tags: ['brand', 'orbit', 'loop'],
    prompt: 'Brand orbital loop, three concentric SVG rings rotating at different speeds (20s/12s/7s), central monogram mark, ring text labels, display serif headline below, dark full-bleed stage, infinite seamless CSS animation' },
  { id: 'mot-07', title: 'Slide Transition Pack', description: 'Smooth presentation slide reveal transitions', category: 'motion', tags: ['presentation', 'transition', 'slides'],
    prompt: 'Presentation slide transition animation, content slides in from right on each advance, headline enters with scale-up ease, supporting content fades in staggered, GSAP timeline-based, clean corporate aesthetic' },
  // Web design templates
  { id: 'web-01', title: 'SaaS Hero Section', description: 'High-converting above-fold hero for a SaaS product', category: 'web', tags: ['saas', 'hero', 'landing'],
    prompt: 'Build a SaaS product hero section: headline that states the core outcome, two-line subhead expanding on it, primary and secondary CTA buttons, product screenshot or demo mockup below, trust strip with logos beneath. No purple gradients.' },
  { id: 'web-02', title: 'Developer Tool Landing', description: 'Dark developer-focused product landing page', category: 'web', tags: ['developer', 'dark', 'landing'],
    prompt: 'Dark developer tool landing page using Linear or Vercel design system. Monochrome palette, hero with code snippet, 3-feature grid, pricing table, footer. Keyboard-first affordances visible. No stock photos.' },
  { id: 'web-03', title: 'Agency Portfolio', description: 'Creative agency portfolio with case studies', category: 'web', tags: ['portfolio', 'agency', 'creative'],
    prompt: 'Creative agency portfolio home. Bold typographic hero, case study grid (4 projects with thumbnails), services section (3 categories), team strip, contact CTA. Editorial Monocle direction. Serif headlines.' },
  { id: 'web-04', title: 'E-Commerce Product Page', description: 'Product detail page with gallery and purchase flow', category: 'web', tags: ['ecommerce', 'product', 'purchase'],
    prompt: 'E-commerce product detail page. Left: image gallery with thumbnail strip. Right: product name, price, variant selectors (color, size), Add to Cart CTA, shipping info, specs accordion, reviews section. Mobile-first layout.' },
  { id: 'web-05', title: 'Pricing Page', description: 'Clean three-tier pricing with feature comparison', category: 'web', tags: ['pricing', 'SaaS', 'conversion'],
    prompt: 'Three-tier pricing page (Starter/Pro/Enterprise), monthly/annual toggle, middle tier highlighted as Most Popular, feature comparison table below, FAQ accordion, enterprise contact strip at bottom. No fake pricing.' },
  { id: 'web-06', title: 'Docs Site Home', description: 'Documentation hub with search and category grid', category: 'web', tags: ['docs', 'developer', 'documentation'],
    prompt: 'Developer documentation home. Search bar hero, quick-start snippet, 6-category grid (Getting Started, API Reference, Guides, Examples, SDKs, Changelog), version selector in header. Mintlify quality.' },
  { id: 'web-07', title: 'Blog Home', description: 'Editorial blog with featured article and post grid', category: 'web', tags: ['blog', 'editorial', 'reading'],
    prompt: 'Editorial blog home with warm tone. Featured article hero (full-width, serif headline, author metadata). Below: 6-post grid with category tags, reading times. Subscription CTA at bottom. Magazine Bold direction.' },
  { id: 'web-08', title: 'Startup Landing Page', description: 'Modern startup landing with all conversion sections', category: 'web', tags: ['startup', 'landing', 'conversion'],
    prompt: 'Complete startup landing page. Hero -> social proof logos -> features 3-col -> how it works steps -> testimonials 2-col -> pricing 3 tiers -> final CTA -> footer. Modern Minimal direction. Real copy throughout.' },
  // Deck templates
  { id: 'deck-01', title: 'Startup Pitch Deck', description: '12-slide VC pitch deck with all standard sections', category: 'deck', tags: ['pitch', 'startup', 'fundraising'],
    prompt: 'Build a 12-slide startup pitch deck HTML presentation: Cover, Problem, Solution, Market Size, Product Demo, Business Model, Traction, Team, Competition, Financials, Ask, Closing. Dark professional theme, keyboard navigation.' },
  { id: 'deck-02', title: 'Tech Talk Slides', description: 'Conference presentation for a technical topic', category: 'deck', tags: ['conference', 'tech', 'talk'],
    prompt: 'Technical conference talk deck, 15 slides. Cover -> agenda -> 10 content slides with code snippets, architecture diagrams, and comparison tables -> key takeaways -> Q&A. Dark theme, large code blocks, speaker notes.' },
  { id: 'deck-03', title: 'Product Launch Deck', description: 'Internal product launch announcement presentation', category: 'deck', tags: ['product', 'launch', 'announcement'],
    prompt: 'Product launch presentation deck, 10 slides. Cover -> what we built -> who it\'s for -> demo screenshots (3) -> key metrics targets -> rollout timeline -> pricing -> next steps. Clean brand theme.' },
  { id: 'deck-04', title: 'Weekly Team Update', description: 'Team status update deck for async viewing', category: 'deck', tags: ['team', 'weekly', 'status'],
    prompt: 'Weekly team update deck, 8 slides. Cover (week + team) -> wins this week (bullets) -> metrics dashboard -> blockers/risks -> shipping next week -> callouts/thanks -> announcements. Clean minimal theme, readable at speed.' },
  // Social templates
  { id: 'soc-01', title: 'Founder Insight Carousel', description: '3-card carousel sharing a business insight', category: 'social', tags: ['carousel', 'founder', 'insight'],
    prompt: 'Three-card LinkedIn/Instagram carousel. Connected headline: "The biggest mistake -> founders make -> in year one." Dark full-bleed background, serif italic headline, brand chip top-left. Each card 1080x1080.' },
  { id: 'soc-02', title: 'Product Stats Carousel', description: '3-card carousel showing product metrics and proof', category: 'social', tags: ['carousel', 'metrics', 'proof'],
    prompt: 'Three-card social carousel showing product traction: card 1 has the headline metric, card 2 shows how it works, card 3 has the CTA. Dark background, large numbers, tight tracking.' },
  { id: 'soc-03', title: 'Tutorial Step Carousel', description: '3-card tutorial showing a how-to process', category: 'social', tags: ['carousel', 'tutorial', 'howto'],
    prompt: 'Three-card tutorial carousel. Step 1 -> Step 2 -> Step 3, each card shows one clear action. Connected headline flows across cards as one sentence. Icons or diagrams in each card body. Clean light background.' },
]

type GalleryCategory = 'all' | PromptTemplate['category']

const GALLERY_CATEGORIES: { id: GalleryCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'web', label: 'Web' },
  { id: 'deck', label: 'Decks' },
  { id: 'social', label: 'Social' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Video' },
  { id: 'motion', label: 'Motion' },
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

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

function looksLikeHtmlDocument(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed) return false
  return /^(?:<!doctype\s+html|<html[\s>])/i.test(trimmed)
    || (/<html[\s>]/i.test(trimmed) && /<\/html>/i.test(trimmed))
}

function extractHtmlDocument(content: string, allowPartial = false): string | null {
  const normalized = normalizeMalformedHtml(content)
  const startMatch = normalized.match(/<!doctype\s+html|<html[\s>]/i)
  if (!startMatch || startMatch.index === undefined) return null
  const endMatch = /<\/html>/i.exec(normalized.slice(startMatch.index))
  const candidate = (() => {
    if (endMatch && endMatch.index !== undefined) {
      const end = startMatch.index + endMatch.index + endMatch[0].length
      return normalized.slice(startMatch.index, end).trim()
    }
    return allowPartial ? normalized.slice(startMatch.index).trim() : ''
  })()
  return looksLikeHtmlDocument(candidate) ? candidate : null
}

const DESIGN_FILE_NAME_RE = /^[\w@./ ()-]+\.(?:html?|css|jsx?|tsx?|js|ts|svg|json|md|markdown)$/i

function stripLeadingFileNameLine(content: string): { content: string; name?: string } {
  const lines = String(content || '').replace(/^\uFEFF/, '').split(/\r?\n/)
  const firstContentLine = lines.findIndex((line) => line.trim().length > 0)
  if (firstContentLine < 0) return { content }

  const candidate = normalizeDesignPath(lines[firstContentLine].trim().replace(/^["'`]+|["'`:]+$/g, ''))
  if (!candidate || !DESIGN_FILE_NAME_RE.test(candidate)) return { content }

  return {
    content: [...lines.slice(0, firstContentLine), ...lines.slice(firstContentLine + 1)].join('\n').trimStart(),
    name: candidate,
  }
}

function extractTrailingOpenFence(content: string): { info: string; code: string } | null {
  const lastFence = content.lastIndexOf('```')
  if (lastFence < 0) return null
  const afterFence = content.slice(lastFence + 3)
  const newlineIndex = afterFence.indexOf('\n')
  if (newlineIndex < 0) return null
  const code = afterFence.slice(newlineIndex + 1)
  if (!code.trim() || code.includes('```')) return null
  return {
    info: afterFence.slice(0, newlineIndex).trim(),
    code,
  }
}

function parseFenceInfo(info: string, index: number): { lang: string; name: string } | null {
  const tokens = info.split(/\s+/).filter(Boolean)
  const firstToken = (tokens[0] || '').toLowerCase()
  const hasKnownLang = firstToken ? KNOWN_FENCE_LANGS.has(firstToken) : false

  if (firstToken === 'artifact') {
    const attrs: Record<string, string> = {}
    tokens.slice(1).forEach((token) => {
      const match = token.match(/^([a-zA-Z_:-]+)=(?:"([^"]*)"|'([^']*)'|(.+))$/)
      if (match) attrs[match[1].toLowerCase()] = match[2] || match[3] || match[4] || ''
    })
    const artifactType = (attrs.type || '').toLowerCase()
    const lang = artifactType === 'react' ? 'jsx' : artifactType
    if (!KNOWN_FENCE_LANGS.has(lang)) return null
    const ext = LANG_EXT[lang] || lang
    const rawId = (attrs.id || attrs.title || `artifact-${index}`).toLowerCase()
    const slug = rawId.replace(/[^a-z0-9._/-]+/g, '-').replace(/^-+|-+$/g, '') || `artifact-${index}`
    return {
      lang,
      name: lang === 'html' ? 'index.html' : normalizeDesignPath(slug.endsWith(`.${ext}`) ? slug : `${slug}.${ext}`) || `artifact-${index}.${ext}`,
    }
  }

  if (hasKnownLang) {
    return {
      lang: firstToken,
      name: tokens.length > 1 ? tokens.slice(1).join(' ').trim() : (firstToken === 'html' ? 'index.html' : ''),
    }
  }

  if (tokens.length === 1) {
    const maybePath = normalizeDesignPath(tokens[0])
    if (maybePath && /\.\w+$/.test(maybePath)) {
      return { lang: inferLanguageFromFileName(maybePath), name: maybePath }
    }
  }

  return null
}

export function extractFiles(content: string): DesignFile[] {
  const re = /```([^\n`]*)\n([\s\S]*?)```/g
  const files: DesignFile[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  let idx = 0

  const addFenceFile = (rawInfo: string, rawCode: string): boolean => {
    const info = (rawInfo || '').trim()
    const stripped = stripLeadingFileNameLine(rawCode || '')
    const code = stripped.content
    if (!code.trim()) return false

    const normalizedHtmlCode = sanitizeDesignFileContent('index.html', 'html', code)
    const parsed = parseFenceInfo(info, idx + 1)
      || (stripped.name ? { lang: inferLanguageFromFileName(stripped.name), name: stripped.name } : null)
      || (looksLikeHtmlDocument(normalizedHtmlCode)
        ? { lang: 'html', name: 'index.html' }
        : null)
    if (!parsed) return false
    let { lang, name } = parsed

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
    return true
  }

  while ((m = re.exec(content)) !== null) {
    addFenceFile(m[1] || '', m[2] || '')
  }

  const trailingOpenFence = extractTrailingOpenFence(content)
  if (trailingOpenFence) {
    addFenceFile(trailingOpenFence.info, trailingOpenFence.code)
  }

  // Fallback: treat raw HTML (no code fence) as index.html
  if (files.length === 0) {
    const trimmed = content.trim()
    const htmlDocument = extractHtmlDocument(trimmed, true) || sanitizeDesignFileContent('index.html', 'html', trimmed)
    if (looksLikeHtmlDocument(htmlDocument)) {
      files.push({ id: genId(), name: 'index.html', language: 'html', content: htmlDocument })
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

/**
 * Progressive checkbox tick — replaces first `tickCount` occurrences of
 * `- [ ]` with `- [x]` in streaming text. Pass Infinity to tick all.
 */
export function tickCheckboxesInText(text: string, tickCount: number): string {
  let count = 0
  return text.replace(/- \[ \] /g, () => {
    count++
    return count <= tickCount ? '- [x] ' : '- [ ] '
  })
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

// â”€â”€â”€ Project Storage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  } catch { /* quota â€” ignore */ }
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

// â”€â”€â”€ Design System â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const DS_DESIGN_SYSTEM_KEY = 'kodo.ds.designSystem.v1'

const DEFAULT_DESIGN_SYSTEM: DesignSystemConfig = {
  brandName: '', presetId: 'claude',
  fidelity: 'high-fidelity', direction: 'auto', surface: 'auto',
  motion: 'subtle', deviceFrame: 'auto',
  audience: '', scale: '', brandAssets: '',
  primaryColor: '#cc785c', secondaryColor: '#141413',
  accentColor: '#cc785c', fontFamily: 'Inter, system-ui, sans-serif',
  borderRadius: 'md', style: 'minimal', customRules: '',
}

function loadDesignSystem(): DesignSystemConfig {
  try {
    const raw = localStorage.getItem(DS_DESIGN_SYSTEM_KEY)
    if (!raw) return { ...DEFAULT_DESIGN_SYSTEM }
    const parsed = { ...DEFAULT_DESIGN_SYSTEM, ...JSON.parse(raw) } as DesignSystemConfig
    const presets = allDesignSystemPresets()
    return {
      ...parsed,
      presetId: presets.some((preset) => preset.id === parsed.presetId) ? parsed.presetId : DEFAULT_DESIGN_SYSTEM.presetId,
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
  const preset = allDesignSystemPresets().find((row) => row.id === ds.presetId) || DESIGN_SYSTEM_PRESETS[0]
  const direction = DESIGN_DIRECTIONS[ds.direction] || DESIGN_DIRECTIONS.auto
  const lines: string[] = ['Kodo Creative Brief and Design System:']
  lines.push(`- Fidelity: ${ds.fidelity} â€” ${FIDELITY_PROMPTS[ds.fidelity]}`)
  lines.push(`- Surface: ${ds.surface} â€” ${DESIGN_SURFACES[ds.surface]}`)
  lines.push(`- Motion: ${ds.motion} â€” ${MOTION_PROMPTS[ds.motion]}`)
  lines.push(`- Device frame: ${ds.deviceFrame} â€” ${DEVICE_FRAME_PROMPTS[ds.deviceFrame]}`)
  lines.push(`- Design system preset: ${preset.label} (${preset.category}) â€” ${preset.summary}`)
  lines.push(`- Preset rules: ${truncateText(preset.prompt, 3200)}`)
  if (preset.sourceUrl) lines.push(`- Extracted source URL: ${preset.sourceUrl}`)
  if (preset.extraction) {
    const facts = [
      preset.extraction.generator,
      typeof preset.extraction.cssVarCount === 'number' ? `${preset.extraction.cssVarCount} CSS variables` : '',
      typeof preset.extraction.sourceCssFiles === 'number' ? `${preset.extraction.sourceCssFiles} linked stylesheets` : '',
    ].filter(Boolean).join(', ')
    if (facts) lines.push(`- Extraction metadata: ${facts}`)
  }
  lines.push(`- Visual direction: ${direction.label} â€” ${direction.summary}`)
  lines.push(`- Direction rules: ${direction.prompt}`)
  if (ds.brandName) lines.push(`- Brand: ${ds.brandName}`)
  if (ds.audience) lines.push(`- Audience: ${ds.audience}`)
  if (ds.scale) lines.push(`- Scope/scale: ${ds.scale}`)
  if (ds.brandAssets) lines.push(`- Brand/context assets available: ${truncateText(ds.brandAssets, 700)}`)
  lines.push(`- Primary color: ${ds.primaryColor}`)
  lines.push(`- Secondary color: ${ds.secondaryColor}`)
  lines.push(`- Accent color: ${ds.accentColor}`)
  lines.push(`- Font: ${ds.fontFamily}`)
  const radii: Record<DesignSystemConfig['borderRadius'], string> = { none: '0px', sm: '4px', md: '8px', lg: '16px', full: '9999px' }
  lines.push(`- Border radius: ${radii[ds.borderRadius]}`)
  lines.push(`- Visual style: ${ds.style}`)
  if (ds.customRules) lines.push(`- Rules: ${truncateText(ds.customRules, 900)}`)
  lines.push('- Discovery discipline: if required context is missing, ask a compact batch of questions or render three directions instead of guessing one generic answer.')
  return lines.join('\n')
}

// â”€â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildDesignSystemPresetPatch(presetId: string): Partial<DesignSystemConfig> {
  const preset = allDesignSystemPresets().find((row) => row.id === presetId) || DESIGN_SYSTEM_PRESETS[0]
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

// â”€â”€â”€ Project Picker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
              YOUR PROJECTS â€” {projects.length}
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

// â”€â”€â”€ Design System Showcase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function hexLuminance(hex: string): number {
  const h = hex.replace('#', '')
  if (h.length !== 6) return 0.5
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function generateShowcaseHTML(preset: DesignSystemPreset): string {
  const [bg, surface, text, muted, accent] = preset.colors
  const bgLum = hexLuminance(bg)
  const accentLum = hexLuminance(accent)
  const isDark = bgLum < 0.18
  // Button text on accent: use black if accent is bright (lum > 0.35), else white
  const accentOnText = accentLum > 0.35 ? '#000000' : '#ffffff'
  const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
  const surfaceShadow = isDark ? '0 2px 12px rgba(0,0,0,0.4)' : '0 2px 12px rgba(0,0,0,0.08)'
  const shortName = preset.label.split(' ')[0]

  // Determine Google Fonts to load based on display font
  const fontFamilyRaw = preset.displayFont.split(',')[0].trim().replace(/'/g, '')
  const systemFonts = ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'monospace', 'sans-serif', 'serif', 'Geist', 'Circular', 'SF Pro', 'IBM Plex', 'GT Walsheim', 'Cooper Black', 'Space Grotesk', 'PolySans', 'Optimistic VF', 'Tiempos', 'Rajdhani', 'Orbitron', 'Sharp Grotesk', 'Atlas Grotesk', 'Sohne', 'Lexend']
  const needsGoogleFont = !systemFonts.some(f => fontFamilyRaw.toLowerCase().includes(f.toLowerCase()))
  const googleFontFamilies: string[] = []
  if (needsGoogleFont) googleFontFamilies.push(fontFamilyRaw)
  const bodyFontRaw = preset.bodyFont.split(',')[0].trim().replace(/'/g, '')
  if (bodyFontRaw !== fontFamilyRaw && !systemFonts.some(f => bodyFontRaw.toLowerCase().includes(f.toLowerCase()))) {
    googleFontFamilies.push(bodyFontRaw)
  }
  const googleFontLink = googleFontFamilies.length > 0
    ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?${googleFontFamilies.map(f => `family=${encodeURIComponent(f)}:wght@400;600;700;800;900`).join('&')}&display=swap" rel="stylesheet">`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${googleFontLink}
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:${bg};--surface:${surface};--text:${text};--muted:${muted};--accent:${accent};
  --font-display:${preset.displayFont};--font-body:${preset.bodyFont};
  --border:${borderColor};--shadow:${surfaceShadow};
}
html{font-size:16px;-webkit-font-smoothing:antialiased}
body{background:var(--bg);color:var(--text);font-family:var(--font-body);min-height:100vh;overflow-x:hidden}

/* Nav */
nav{display:flex;align-items:center;gap:32px;padding:0 40px;height:60px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg);z-index:10}
.nav-logo{display:flex;align-items:center;gap:10px;font-family:var(--font-display);font-weight:800;font-size:17px;color:var(--text);text-decoration:none;letter-spacing:-0.02em}
.nav-logo-dot{width:26px;height:26px;border-radius:8px;background:var(--accent);display:grid;place-items:center}
.nav-logo-dot-inner{width:10px;height:10px;border-radius:50%;background:var(--bg);opacity:0.9}
.nav-links{display:flex;gap:24px;margin-left:8px;list-style:none}
.nav-links a{color:var(--muted);font-size:14px;text-decoration:none;font-weight:500;transition:color 0.15s}
.nav-links a:hover{color:var(--text)}
.nav-actions{margin-left:auto;display:flex;align-items:center;gap:10px}
.btn-ghost{background:none;border:1px solid var(--border);color:var(--muted);font-size:13px;font-weight:500;padding:7px 16px;border-radius:8px;cursor:pointer;font-family:var(--font-body)}
.btn-primary{background:var(--accent);border:none;color:${accentOnText};font-size:13px;font-weight:700;padding:8px 18px;border-radius:8px;cursor:pointer;font-family:var(--font-body);display:flex;align-items:center;gap:6px}

/* Breadcrumb */
.breadcrumb{padding:20px 40px 0;display:flex;align-items:center;gap:8px}
.breadcrumb-item{font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted)}
.breadcrumb-sep{font-size:11px;color:var(--border)}
.breadcrumb-active{color:var(--accent);background:${accent}22;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.06em}

/* Hero */
.hero{padding:52px 40px 60px;max-width:780px}
.hero-eyebrow{font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);margin-bottom:18px}
.hero-headline{font-family:var(--font-display);font-size:clamp(36px,5vw,58px);font-weight:800;line-height:1.05;letter-spacing:-0.03em;color:var(--text);margin-bottom:20px}
.hero-headline .accent-word{color:var(--accent)}
.hero-sub{font-size:17px;color:var(--muted);line-height:1.6;max-width:520px;margin-bottom:36px}
.hero-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.btn-hero{background:var(--accent);border:none;color:${accentOnText};font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;cursor:pointer;font-family:var(--font-body);display:flex;align-items:center;gap:8px}
.btn-secondary{background:none;border:1px solid var(--border);color:var(--text);font-size:15px;font-weight:500;padding:13px 24px;border-radius:10px;cursor:pointer;font-family:var(--font-body)}
.trust-badges{display:flex;gap:28px;margin-top:36px;flex-wrap:wrap}
.trust-badge{font-size:12px;color:var(--muted)}
.trust-badge strong{color:var(--text);font-weight:700}

/* Trust strip */
.trust-strip{padding:32px 40px;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.trust-strip-label{font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);text-align:center;margin-bottom:20px}
.trust-logos{display:flex;justify-content:center;align-items:center;gap:40px;flex-wrap:wrap}
.trust-logo{font-size:14px;font-weight:700;color:var(--muted);letter-spacing:-0.01em;opacity:0.6}

/* Features */
.features{padding:64px 40px}
.section-label{font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);margin-bottom:12px}
.section-headline{font-family:var(--font-display);font-size:clamp(24px,3vw,36px);font-weight:800;letter-spacing:-0.02em;line-height:1.15;color:var(--text);margin-bottom:40px;max-width:500px}
.features-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.feature-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;box-shadow:var(--shadow)}
.feature-icon{width:40px;height:40px;border-radius:10px;background:${accent}22;display:grid;place-items:center;margin-bottom:16px;font-size:18px}
.feature-title{font-size:15px;font-weight:700;color:var(--text);margin-bottom:8px;letter-spacing:-0.01em}
.feature-desc{font-size:13px;color:var(--muted);line-height:1.55}

/* Stats */
.stats{padding:48px 40px;border-top:1px solid var(--border)}
.stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:32px}
.stat-value{font-family:var(--font-display);font-size:40px;font-weight:800;letter-spacing:-0.04em;color:var(--text);margin-bottom:6px}
.stat-label{font-size:13px;color:var(--muted);font-weight:500}
</style>
</head>
<body>

<nav>
  <a href="#" class="nav-logo">
    <span class="nav-logo-dot"><span class="nav-logo-dot-inner"></span></span>
    ${shortName}
  </a>
  <ul class="nav-links">
    <li><a href="#">Product</a></li>
    <li><a href="#">Workspace</a></li>
    <li><a href="#">Pricing</a></li>
    <li><a href="#">Docs</a></li>
    <li><a href="#">Customers</a></li>
  </ul>
  <div class="nav-actions">
    <button class="btn-ghost">Sign in</button>
    <button class="btn-primary">Get started -></button>
  </div>
</nav>

<div class="breadcrumb">
  <span class="breadcrumb-item">${preset.label.toUpperCase()}</span>
  <span class="breadcrumb-sep">â€º</span>
  <span class="breadcrumb-active">LIVE PREVIEW</span>
</div>

<section class="hero">
  <div class="hero-eyebrow">${preset.category} Design System</div>
  <h1 class="hero-headline">The system that makes<br><span class="accent-word">${shortName}</span> feel like ${shortName}.</h1>
  <p class="hero-sub">${preset.summary}</p>
  <div class="hero-actions">
    <button class="btn-hero">Start a free trial -></button>
    <button class="btn-secondary">See it in action</button>
  </div>
  <div class="trust-badges">
    <span class="trust-badge"><strong>4.9</strong> Â· App Store rating</span>
    <span class="trust-badge"><strong>SOC 2</strong> Â· Type II compliant</span>
    <span class="trust-badge"><strong>120k+</strong> active teams</span>
  </div>
</section>

<div class="trust-strip">
  <div class="trust-strip-label">Trusted by teams shipping serious work</div>
  <div class="trust-logos">
    <span class="trust-logo">Northwind</span>
    <span class="trust-logo">Pioneer</span>
    <span class="trust-logo">Lattice</span>
    <span class="trust-logo">Atlas Co.</span>
    <span class="trust-logo">Voltage</span>
    <span class="trust-logo">Foundry</span>
  </div>
</div>

<section class="features">
  <div class="section-label">Platform features</div>
  <h2 class="section-headline">Everything your team needs to move fast</h2>
  <div class="features-grid">
    <div class="feature-card">
      <div class="feature-icon">â—†</div>
      <div class="feature-title">Design system tokens</div>
      <div class="feature-desc">Consistent visual language across every surface. One source of truth for your entire product.</div>
    </div>
    <div class="feature-card">
      <div class="feature-icon">â¬¡</div>
      <div class="feature-title">Component library</div>
      <div class="feature-desc">Production-ready components built on your design tokens. Ship features 3Ã— faster.</div>
    </div>
    <div class="feature-card">
      <div class="feature-icon">â–²</div>
      <div class="feature-title">Live preview</div>
      <div class="feature-desc">See changes in real time across desktop, tablet, and mobile breakpoints instantly.</div>
    </div>
  </div>
</section>

<section class="stats">
  <div class="stats-grid">
    <div>
      <div class="stat-value">3Ã—</div>
      <div class="stat-label">Faster feature delivery</div>
    </div>
    <div>
      <div class="stat-value">98%</div>
      <div class="stat-label">Designer satisfaction score</div>
    </div>
    <div>
      <div class="stat-value">120k+</div>
      <div class="stat-label">Teams using this system</div>
    </div>
  </div>
</section>

</body>
</html>`
}

function generateTokensContent(preset: DesignSystemPreset) {
  if (preset.tokenGroups?.length) return preset.tokenGroups

  const tokenGroups = [
    {
      label: 'Color Palette',
      tokens: [
        { name: '--color-bg', value: preset.colors[0], description: 'Page background' },
        { name: '--color-surface', value: preset.colors[1], description: 'Card / panel surface' },
        { name: '--color-text', value: preset.colors[2], description: 'Primary text' },
        { name: '--color-muted', value: preset.colors[3], description: 'Secondary / muted text' },
        { name: '--color-accent', value: preset.colors[4] || preset.colors[2], description: 'Brand accent / CTA' },
      ],
    },
    {
      label: 'Typography',
      tokens: [
        { name: '--font-display', value: preset.displayFont.split(',')[0].replace(/'/g, '').trim(), description: 'Headlines & display text' },
        { name: '--font-body', value: preset.bodyFont.split(',')[0].replace(/'/g, '').trim(), description: 'Body copy & UI labels' },
        { name: '--font-size-display', value: '48â€“72px', description: 'Hero headlines' },
        { name: '--font-size-h1', value: '36â€“48px', description: 'Page titles' },
        { name: '--font-size-body', value: '15â€“16px', description: 'Body text' },
        { name: '--line-height-body', value: '1.5â€“1.6', description: 'Reading line height' },
      ],
    },
    {
      label: 'Spacing & Radius',
      tokens: [
        { name: '--spacing-unit', value: '8px', description: 'Base spacing unit' },
        { name: '--spacing-sm', value: '8px', description: 'Tight spacing' },
        { name: '--spacing-md', value: '16px', description: 'Default gap' },
        { name: '--spacing-lg', value: '32px', description: 'Section spacing' },
        { name: '--radius-sm', value: '6px', description: 'Input / badge radius' },
        { name: '--radius-md', value: '10px', description: 'Card / button radius' },
        { name: '--radius-lg', value: '16px', description: 'Panel / modal radius' },
      ],
    },
  ]
  return tokenGroups
}

const GETDESIGN_MD_SLUGS: Record<string, string> = {
  'claude-warm': 'claude',
  'mistral-ai': 'mistral.ai',
  'elevenlabs-audio': 'elevenlabs',
  'ollama-local': 'ollama',
  'together-ai': 'together.ai',
  'opencode-ai': 'opencode.ai',
  'minimax-ai': 'minimax',
  'voltagent': 'voltagent',
  'cohere-enterprise': 'cohere',
  'xai-mono': 'x.ai',
  'linear-minimal': 'linear.app',
  'vercel-mono': 'vercel',
  'cursor-agentic': 'cursor',
  'supabase-dev': 'supabase',
  'raycast-command': 'raycast',
  'warp-terminal': 'warp',
  'expo-platform': 'expo',
  'hashicorp-infra': 'hashicorp',
  'sentry-ops': 'sentry',
  'mintlify-docs': 'mintlify',
  'resend-email': 'resend',
  'replicate-ml': 'replicate',
  'composio-dev': 'composio',
  'posthog-analytics': 'posthog',
  'stripe-gradient': 'stripe',
  'coinbase-crypto': 'coinbase',
  'revolut-finance': 'revolut',
  'wise-fintech': 'wise',
  'binance-crypto': 'binance',
  'mastercard-brand': 'mastercard',
  'kraken-exchange': 'kraken',
  'apple-glass': 'apple',
  'airbnb-warm': 'airbnb',
  'spotify-audio': 'spotify',
  'nike-performance': 'nike',
  'starbucks-brand': 'starbucks',
  'meta-store': 'meta',
  'tesla-product': 'tesla',
  'bmw-premium': 'bmw',
  'bmw-m-sport': 'bmw-m',
  'ferrari-red': 'ferrari',
  'lamborghini-hex': 'lamborghini',
  'bugatti-mono': 'bugatti',
  'renault-aurora': 'renault',
  'spacex-stark': 'spacex',
  'figma-creative': 'figma',
  'framer-motion': 'framer',
  'webflow-creator': 'webflow',
  'miro-workshop': 'miro',
  'airtable-db': 'airtable',
  'clay-agency': 'clay',
  'theverge-editorial': 'theverge',
  'wired-magazine': 'wired',
  'ibm-carbon': 'ibm',
  'intercom-friendly': 'intercom',
  'superhuman-email': 'superhuman',
  'nvidia-ai': 'nvidia',
  'playstation-dark': 'playstation',
  'mongodb-db': 'mongodb',
  'sanity-cms': 'sanity',
  'lovable-builder': 'lovable',
  'clickhouse-db': 'clickhouse',
  'vodafone-brand': 'vodafone',
  'notion-editorial': 'notion',
  'cal-scheduling': 'cal',
  'zapier-orange': 'zapier',
  'runwayml-cinematic': 'runwayml',
  'openai-research': 'openai-research',
  'anthropic-editorial': 'anthropic-editorial',
  'huggingface-community': 'huggingface-community',
  'deepseek-tech': 'deepseek-tech',
  'github-utility': 'github-utility',
  'arc-browser': 'arc-browser',
  'fintech-dark': 'fintech-dark',
  'porsche-precision': 'porsche-precision',
  'mercedes-luxury': 'mercedes-luxury',
  'canva-playful': 'canva-playful',
  'shadcn-system': 'shadcn-system',
  'magazine-bold': 'magazine-bold',
  'japanese-minimal': 'japanese-minimal',
  'substack-newsletter': 'substack-newsletter',
  'atlassian-team': 'atlassian-team',
  'material-google': 'material-google',
  'microsoft-fluent': 'microsoft-fluent',
  'salesforce-crm': 'salesforce-crm',
  'hubspot-marketing': 'hubspot-marketing',
  'pagerduty-incident': 'pagerduty-incident',
  'datadog-ops': 'datadog-ops',
  'netflix-streaming': 'netflix-streaming',
  'discord-community': 'discord-community',
  'gaming-esports': 'gaming-esports',
  'dropbox-work': 'dropbox-work',
  'loom-video': 'loom-video',
  'mailchimp-friendly': 'mailchimp-friendly',
  'xiaohongshu-social': 'xiaohongshu-social',
  'amazon-commerce': 'amazon-commerce',
  'neo-brutal': 'neo-brutal',
  'neobrutalism': 'neobrutalism',
  'glassmorphism': 'glassmorphism',
  'claymorphism': 'claymorphism',
  'retro-80s': 'retro-80s',
  'cosmic-space': 'cosmic-space',
  'luxury-premium': 'luxury-premium',
  'cyberpunk-neon': 'cyberpunk-neon',
  'warmth-organic': 'warmth-organic',
}

function DesignSystemPreviewModal({
  preset,
  onClose,
  onSelect,
}: {
  preset: DesignSystemPreset
  onClose: () => void
  onSelect: () => void
}) {
  const liveSlug = GETDESIGN_MD_SLUGS[preset.id] || preset.id
  const hasLivePreview = Boolean(liveSlug || preset.livePreviewHtml)
  const defaultTab = hasLivePreview ? 'live' : 'showcase'
  const [tab, setTab] = useState<'showcase' | 'tokens' | 'live'>(defaultTab as 'showcase' | 'tokens' | 'live')
  const [fullscreen, setFullscreen] = useState(false)
  const showcaseHTML = generateShowcaseHTML(preset)
  const tokenGroups = generateTokensContent(preset)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    setTab(hasLivePreview ? 'live' : 'showcase')
  }, [preset.id, hasLivePreview])

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.6)',
        display: 'grid', placeItems: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: fullscreen ? 0 : 14,
          boxShadow: '0 32px 80px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column',
          width: fullscreen ? '100vw' : 'min(92vw, 1100px)',
          height: fullscreen ? '100vh' : 'min(90vh, 780px)',
          overflow: 'hidden',
          position: fullscreen ? 'fixed' : 'relative',
          inset: fullscreen ? 0 : 'auto',
        }}
      >
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 18px',
          borderBottom: '1px solid #e5e7eb',
          flexShrink: 0,
        }}>
          {/* Logo or color swatch */}
          {(preset.logoUrl || PRESET_LOGOS[preset.id]) ? (
            <img
              src={preset.logoUrl || PRESET_LOGOS[preset.id]}
              alt={preset.label}
              width={36} height={36}
              style={{ borderRadius: 8, border: '1px solid #e5e7eb', flexShrink: 0, objectFit: 'cover', background: '#f3f4f6' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div style={{
              width: 36, height: 36, borderRadius: 8, overflow: 'hidden',
              display: 'grid', gridTemplateColumns: '1fr 1fr', flexShrink: 0,
              border: '1px solid #e5e7eb',
            }}>
              {preset.colors.slice(0, 4).map((c, index) => (
                <span key={`${c}-${index}`} style={{ background: c }} />
              ))}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', letterSpacing: '-0.01em' }}>{preset.label}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preset.summary}</div>
          </div>
          {/* Tab pills */}
          <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', borderRadius: 8, padding: 3 }}>
            {([...(hasLivePreview ? ['live'] : []), 'showcase', 'tokens'] as const).map(t => (
              <button key={t} type="button" onClick={() => setTab(t as 'showcase' | 'tokens' | 'live')}
                style={{
                  padding: '5px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  background: tab === t ? '#ffffff' : 'transparent',
                  color: tab === t ? '#111827' : '#6b7280',
                  boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}>
                {t === 'live' ? 'Live Preview' : t === 'showcase' ? 'Showcase' : 'Tokens'}
              </button>
            ))}
          </div>
          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={() => setFullscreen(f => !f)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px solid #e5e7eb', borderRadius: 7, color: '#6b7280', fontSize: 12, fontWeight: 500, padding: '6px 12px', cursor: 'pointer' }}>
              {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              {fullscreen ? 'Exit' : 'Fullscreen'}
            </button>
            <button type="button" onClick={onSelect}
              style={{ background: preset.colors[4] || '#111827', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 700, padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Plus size={13} /> Use System
            </button>
            <button type="button" onClick={onClose}
              style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 7, color: '#6b7280', width: 32, height: 32, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              âœ•
            </button>
          </div>
        </div>

        {/* Live Preview tab: extracted or local saved HTML */}
        {tab === 'live' && hasLivePreview && (
          preset.livePreviewHtml ? (
            <iframe
              srcDoc={preset.livePreviewHtml}
              title={`${preset.label} live preview`}
              style={{ flex: 1, border: 'none', width: '100%' }}
              sandbox="allow-same-origin"
            />
          ) : (
            <iframe
              src={`/design-previews/${String(liveSlug).replace(/\./g, '-')}.html`}
              title={`${preset.label} live preview`}
              style={{ flex: 1, border: 'none', width: '100%' }}
              sandbox="allow-same-origin"
            />
          )
        )}

        {/* Showcase tab: live iframe */}
        {tab === 'showcase' && (
          <iframe
            ref={iframeRef}
            srcDoc={showcaseHTML}
            title={`${preset.label} showcase`}
            style={{ flex: 1, border: 'none', width: '100%' }}
            sandbox="allow-same-origin"
          />
        )}

        {/* Tokens tab */}
        {tab === 'tokens' && (
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
            {tokenGroups.map(group => (
              <div key={group.label} style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 10 }}>{group.label}</div>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                  {group.tokens.map((token, i) => (
                    <div key={token.name} style={{
                      display: 'grid', gridTemplateColumns: '220px 1fr 1fr',
                      alignItems: 'center', padding: '10px 14px', gap: 16,
                      borderTop: i > 0 ? '1px solid #e5e7eb' : 'none',
                      background: i % 2 === 0 ? '#fff' : '#f9fafb',
                    }}>
                      <code style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: '#7c3aed', background: '#f5f3ff', padding: '2px 6px', borderRadius: 4 }}>{token.name}</code>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {String(token.value).startsWith('#') && (
                          <span style={{ width: 20, height: 20, borderRadius: 5, background: token.value, border: '1px solid #e5e7eb', flexShrink: 0 }} />
                        )}
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', fontFamily: String(token.value).startsWith('#') ? 'ui-monospace, monospace' : 'inherit' }}>{token.value}</span>
                      </div>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{token.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// â”€â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  const [mainTab, setMainTab] = useState<'designs' | 'gallery' | 'systems'>('designs')
  const [galleryCategory, setGalleryCategory] = useState<GalleryCategory>('all')
  const [gallerySearch, setGallerySearch] = useState('')
  const [systemSearch, setSystemSearch] = useState('')
  const [previewPreset, setPreviewPreset] = useState<DesignSystemPreset | null>(null)
  const [dsSearch, setDsSearch] = useState('')
  const { systems: userSystems, save: saveUserSystem, remove: removeUserSystem } = useUserDesignSystems()
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importResult, setImportResult] = useState<UserDesignPreset | null>(null)
  const allPresets = [...userSystems, ...DESIGN_SYSTEM_PRESETS]
  const selectedPreset = allPresets.find((preset) => preset.id === presetId) || DESIGN_SYSTEM_PRESETS[0]

  const handleImportUrl = async () => {
    if (!importUrl.trim()) return
    setImporting(true); setImportError(''); setImportResult(null)
    try {
      const resp = await fetch('/api/design/extract-theme', {
        method: 'POST',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ url: importUrl.trim() }),
      })
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.detail || 'Extraction failed') }
      const data = await resp.json()
      const preset: UserDesignPreset = {
        ...data,
        id: typeof data.id === 'string' && data.id.trim() ? data.id : `user-${Date.now()}`,
        label: typeof data.label === 'string' && data.label.trim() ? data.label : 'Imported Design System',
        category: 'My Design Systems',
        colors: Array.isArray(data.colors) && data.colors.length >= 5 ? data.colors.slice(0, 5) : ['#ffffff', '#f8fafc', '#111827', '#64748b', '#2563eb'],
        displayFont: typeof data.displayFont === 'string' ? data.displayFont : 'Inter, system-ui, sans-serif',
        bodyFont: typeof data.bodyFont === 'string' ? data.bodyFont : 'Inter, system-ui, sans-serif',
        summary: typeof data.summary === 'string' ? data.summary : 'Imported design system.',
        prompt: typeof data.prompt === 'string' ? data.prompt : 'Use the extracted colors, typography, and spacing to create on-brand designs.',
        isUserDefined: true,
        createdAt: Date.now(),
        sourceUrl: importUrl.trim(),
      }
      saveUserSystem(preset)
      setPresetId(preset.id)
      setImportResult(preset)
      setPreviewPreset(preset)
      setDsSearch('')
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Unknown error')
    } finally { setImporting(false) }
  }
  const createLabel = projects.length === 0 ? 'Create your first design' : 'Create'

  // Grouped + filtered design systems for the Designs tab
  const groupedPresets = useMemo(() => {
    const q = dsSearch.trim().toLowerCase()
    const allCategories = Array.from(new Set(DESIGN_SYSTEM_PRESETS.map(p => p.category)))
    const userGroup = userSystems.length > 0 ? [{ category: 'My Design Systems', presets: userSystems as DesignSystemPreset[] }] : []

    if (!q) {
      return [
        ...userGroup,
        ...allCategories.map(cat => ({ category: cat, presets: DESIGN_SYSTEM_PRESETS.filter(p => p.category === cat) })),
      ]
    }

    const categoryHits = new Set(allCategories.filter(cat => cat.toLowerCase().includes(q)))
    const presetHits = new Set(
      DESIGN_SYSTEM_PRESETS
        .filter(p => p.label.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q))
        .map(p => p.id)
    )
    const userHits = userSystems.filter(p => p.label.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q))

    return [
      ...(userHits.length > 0 ? [{ category: 'My Design Systems', presets: userHits as DesignSystemPreset[] }] : []),
      ...allCategories
        .map(cat => ({
          category: cat,
          presets: categoryHits.has(cat)
            ? DESIGN_SYSTEM_PRESETS.filter(p => p.category === cat)
            : DESIGN_SYSTEM_PRESETS.filter(p => p.category === cat && presetHits.has(p.id)),
        }))
        .filter(g => g.presets.length > 0),
    ]
  }, [dsSearch, userSystems])

  const totalFilteredCount = groupedPresets.reduce((n, g) => n + g.presets.length, 0)
  const createDraft = () => onCreate({ name: name.trim() || undefined, mode, presetId, fidelity })

  const filteredGallery = PROMPT_GALLERY.filter((t) => {
    if (galleryCategory !== 'all' && t.category !== galleryCategory) return false
    if (gallerySearch) {
      const q = gallerySearch.toLowerCase()
      return t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.tags.some(tag => tag.includes(q))
    }
    return true
  })

  const filteredSystems = allPresets.filter((p) => {
    if (!systemSearch) return true
    const q = systemSearch.toLowerCase()
    return p.label.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q)
  })

  const galleryIconMap: Record<PromptTemplate['category'], ReactNode> = {
    image: <Images size={14} />, video: <Film size={14} />, motion: <Sparkles size={14} />,
    web: <Monitor size={14} />, deck: <Layers size={14} />, social: <Share2 size={14} />,
  }
  const galleryColorMap: Record<PromptTemplate['category'], string> = {
    image: '#8b5cf6', video: '#ef4444', motion: '#f59e0b',
    web: '#3b82f6', deck: '#10b981', social: '#ec4899',
  }

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
                {userSystems.length > 0 && (
                  <optgroup label="My Design Systems">
                    {userSystems.map((preset) => (
                      <option key={preset.id} value={preset.id}>{preset.label}</option>
                    ))}
                  </optgroup>
                )}
                {DESIGN_SYSTEM_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.category} / {preset.label}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 4, marginTop: 7 }}>
                {selectedPreset.colors.map((color, index) => (
                  <span key={`${color}-${index}`} title={color} style={{ height: 16, flex: 1, borderRadius: 4, background: color, border: '1px solid var(--border)' }} />
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
            {([['designs', 'Designs'], ['gallery', 'Prompt Gallery'], ['systems', 'Design Systems']] as [typeof mainTab, string][]).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setMainTab(id)}
                style={{ background: 'none', border: 'none', borderBottom: mainTab === id ? '2px solid var(--accent)' : '2px solid transparent', color: mainTab === id ? 'var(--text-0)' : 'var(--text-2)', fontSize: 12, fontWeight: mainTab === id ? 700 : 500, cursor: 'pointer', padding: '0 0 2px', height: 43 }}>
                {label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            {mainTab === 'gallery' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 7, padding: '0 9px' }}>
                <Search size={13} color="var(--text-2)" />
                <input value={gallerySearch} onChange={e => setGallerySearch(e.target.value)}
                  placeholder="Search templates..." style={{ width: 200, background: 'none', border: 'none', color: 'var(--text-1)', padding: '7px 0', fontSize: 12, outline: 'none' }} />
              </div>
            )}
            {mainTab === 'systems' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 7, padding: '0 9px' }}>
                <Search size={13} color="var(--text-2)" />
                <input value={systemSearch} onChange={e => setSystemSearch(e.target.value)}
                  placeholder="Search design systems..." style={{ width: 220, background: 'none', border: 'none', color: 'var(--text-1)', padding: '7px 0', fontSize: 12, outline: 'none' }} />
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '24px 22px' }}>

            {/* â”€â”€ Designs Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {mainTab === 'designs' && (<>
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
              {/* â”€â”€ Design Systems header + search â”€â”€ */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-2)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                  ALL DESIGN SYSTEMS â€” {allPresets.length} systems
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', height: 32 }}>
                  <Search size={12} color="var(--text-2)" style={{ flexShrink: 0 }} />
                  <input
                    value={dsSearch}
                    onChange={e => setDsSearch(e.target.value)}
                    placeholder="Search by name or categoryâ€¦"
                    style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-0)', fontSize: 12, fontFamily: 'inherit' }}
                  />
                  {dsSearch && (
                    <button type="button" onClick={() => setDsSearch('')}
                      style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', padding: 0, lineHeight: 1 }}>âœ•</button>
                  )}
                </div>
                {dsSearch && (
                  <span style={{ fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {totalFilteredCount} result{totalFilteredCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* â”€â”€ No results â”€â”€ */}
              {groupedPresets.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-2)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>No design systems match "{dsSearch}"</div>
                  <div style={{ fontSize: 11 }}>Try searching by name (e.g. "Stripe") or category (e.g. "Fintech")</div>
                </div>
              )}

              {/* â”€â”€ Grouped sections â”€â”€ */}
              {groupedPresets.map(group => (
                <div key={group.category} style={{ marginBottom: 28 }}>
                  {/* Category heading */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                      textTransform: 'uppercase', color: 'var(--text-2)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {group.category}
                    </span>
                    <span style={{
                      fontSize: 10, color: 'var(--text-2)',
                      background: 'var(--bg-2)', border: '1px solid var(--border)',
                      borderRadius: 999, padding: '1px 7px',
                    }}>
                      {group.presets.length}
                    </span>
                    <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>

                  {/* Preset cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                    {group.presets.map(preset => {
                      const logo = preset.logoUrl || PRESET_LOGOS[preset.id]
                      const isUser = (preset as UserDesignPreset).isUserDefined
                      return (
                        <div key={preset.id} role="button" tabIndex={0}
                          onClick={() => setPreviewPreset(preset)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPreviewPreset(preset) } }}
                          title={`Preview ${preset.label}`}
                          style={{
                            textAlign: 'left',
                            border: `1px solid ${presetId === preset.id ? 'var(--accent)' : 'var(--border)'}`,
                            background: presetId === preset.id ? 'var(--accent-dim)' : 'var(--bg-1)',
                            borderRadius: 8, padding: 10, color: 'var(--text-1)',
                            cursor: 'pointer', display: 'flex', gap: 9, alignItems: 'center',
                          }}>
                          {logo ? (
                            <img src={logo} alt={preset.label} width={34} height={34}
                              style={{ borderRadius: 7, border: '1px solid var(--border)', flexShrink: 0, objectFit: 'cover', background: 'var(--bg-2)' }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          ) : (
                            <span style={{ width: 34, height: 34, display: 'grid', gridTemplateColumns: '1fr 1fr', borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                              {preset.colors.slice(0, 4).map((color, index) => <span key={`${color}-${index}`} style={{ background: color }} />)}
                            </span>
                          )}
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preset.label}</span>
                            <span style={{ display: 'block', fontSize: 10, color: 'var(--text-2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }}>{preset.summary.slice(0, 48)}{preset.summary.length > 48 ? '…' : ''}</span>
                          </span>
                          {isUser && (
                            <button type="button" onClick={e => { e.stopPropagation(); removeUserSystem(preset.id); if (presetId === preset.id) setPresetId(DEFAULT_DESIGN_SYSTEM.presetId) }}
                              title="Delete" style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 2, flexShrink: 0, display: 'flex' }}>
                              <Trash2 size={11} />
                            </button>
                          )}
                          {presetId === preset.id && !isUser && (
                            <span style={{ marginLeft: 'auto', flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* URL Import section */}
              <div style={{ marginTop: 24, padding: '16px', border: '1px dashed var(--border-bright)', borderRadius: 10, background: 'var(--bg-1)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>
                  Import from any website
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={importUrl}
                    onChange={e => setImportUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleImportUrl() }}
                    placeholder="https://stripe.com"
                    style={{ flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-0)', fontSize: 12, padding: '7px 10px', outline: 'none' }}
                  />
                  <button type="button" onClick={handleImportUrl} disabled={importing || !importUrl.trim()}
                    style={{ background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 700, padding: '7px 14px', cursor: importing ? 'wait' : 'pointer', opacity: importing || !importUrl.trim() ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                    {importing ? 'Extracting…' : 'Extract'}
                  </button>
                </div>
                {importError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 7 }}>⚠ {importError}</div>}
                {importResult && (
                  <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      {importResult.logoUrl && <img src={importResult.logoUrl} alt="" width={24} height={24} style={{ borderRadius: 5 }} />}
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-0)' }}>{importResult.label}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-2)', flex: 1 }}>{importResult.summary.slice(0, 60)}…</span>
                    </div>
                    <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
                      {importResult.colors.map((c, index) => <span key={`${c}-${index}`} title={c} style={{ height: 12, flex: 1, borderRadius: 3, background: c, border: '1px solid var(--border)' }} />)}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => setPreviewPreset(importResult)}
                        style={{ flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontSize: 11, fontWeight: 600, padding: '5px 0', cursor: 'pointer' }}>
                        Preview
                      </button>
                      <button type="button" onClick={() => { saveUserSystem(importResult); setPresetId(importResult.id); setImportResult(null); setImportUrl('') }}
                        style={{ flex: 1, background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 0', cursor: 'pointer' }}>
                        Use System
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>)}

            {/* â”€â”€ Prompt Gallery Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {mainTab === 'gallery' && (<>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                {GALLERY_CATEGORIES.map(cat => (
                  <button key={cat.id} type="button" onClick={() => setGalleryCategory(cat.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 999, border: `1px solid ${galleryCategory === cat.id ? 'var(--accent)' : 'var(--border)'}`, background: galleryCategory === cat.id ? 'var(--accent-dim)' : 'var(--bg-1)', color: galleryCategory === cat.id ? 'var(--accent)' : 'var(--text-2)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    {cat.label}
                  </button>
                ))}
                <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center' }}>
                  {filteredGallery.length} template{filteredGallery.length !== 1 ? 's' : ''}
                </div>
              </div>
              {filteredGallery.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-2)' }}>
                  <Search size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
                  <div style={{ fontSize: 14, fontWeight: 600 }}>No templates match</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Try a different search or category</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                  {filteredGallery.map(template => {
                    const accent = galleryColorMap[template.category]
                    return (
                      <div key={template.id}
                        style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ height: 64, background: `linear-gradient(135deg, ${accent}22, ${accent}11)`, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ width: 36, height: 36, borderRadius: 10, background: accent, display: 'grid', placeItems: 'center', color: '#fff' }}>
                            {galleryIconMap[template.category]}
                          </span>
                        </div>
                        <div style={{ padding: '12px 14px', flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-0)', marginBottom: 3 }}>{template.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4, marginBottom: 8 }}>{template.description}</div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                            {template.tags.map(tag => (
                              <span key={tag} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: 'var(--bg-2)', color: 'var(--text-2)' }}>{tag}</span>
                            ))}
                          </div>
                        </div>
                        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
                          <button type="button"
                            onClick={() => {
                              const draft = { name: template.title, mode: (template.category === 'deck' ? 'deck' : template.category === 'motion' || template.category === 'video' ? 'motion' : 'web') as DesignMode, presetId, fidelity }
                              onCreate(draft)
                            }}
                            style={{ flex: 1, padding: '6px 10px', border: 'none', borderRadius: 7, background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                            Use Template
                          </button>
                          <button type="button"
                            title="Copy prompt"
                            onClick={() => navigator.clipboard.writeText(template.prompt)}
                            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg-2)', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Copy size={12} /> Copy
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>)}

            {/* â”€â”€ Design Systems Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {mainTab === 'systems' && (<>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 16 }}>
                {filteredSystems.length} design system{filteredSystems.length !== 1 ? 's' : ''} â€” click any to select it for new designs
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                {filteredSystems.map((preset) => {
                  const logo = preset.logoUrl || PRESET_LOGOS[preset.id]
                  const isUser = (preset as UserDesignPreset).isUserDefined
                  return (
                    <div key={preset.id} role="button" tabIndex={0}
                      onClick={() => setPreviewPreset(preset)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPreviewPreset(preset) } }}
                      title={`Preview ${preset.label}`}
                      style={{ textAlign: 'left', border: `1px solid ${presetId === preset.id ? 'var(--accent)' : 'var(--border)'}`, background: presetId === preset.id ? 'var(--accent-dim)' : 'var(--bg-1)', borderRadius: 8, padding: 12, color: 'var(--text-1)', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                        {logo ? (
                          <img src={logo} alt={preset.label} width={36} height={36}
                            style={{ borderRadius: 7, border: '1px solid var(--border)', flexShrink: 0, objectFit: 'cover', background: 'var(--bg-2)' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                        ) : (
                          <span style={{ width: 36, height: 36, display: 'grid', gridTemplateColumns: '1fr 1fr', borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                            {preset.colors.slice(0, 4).map((color, index) => <span key={`${color}-${index}`} style={{ background: color }} />)}
                          </span>
                        )}
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-0)' }}>{preset.label}</span>
                          <span style={{ display: 'inline-block', fontSize: 10, color: 'var(--text-2)', padding: '2px 6px', borderRadius: 999, background: 'var(--bg-2)', marginTop: 2 }}>{preset.category}</span>
                        </span>
                        {isUser && (
                          <button type="button" onClick={e => { e.stopPropagation(); removeUserSystem(preset.id); if (presetId === preset.id) setPresetId(DEFAULT_DESIGN_SYSTEM.presetId) }}
                            title="Delete" style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 2, flexShrink: 0, display: 'flex' }}>
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.45 }}>{preset.summary}</div>
                    </div>
                  )
                })}
              </div>
            </>)}

          </div>
        </main>
      </div>

      {/* Design System Preview Modal */}
      {previewPreset && (
        <DesignSystemPreviewModal
          preset={previewPreset}
          onClose={() => setPreviewPreset(null)}
          onSelect={() => {
            setPresetId(previewPreset.id)
            setPreviewPreset(null)
          }}
        />
      )}
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
  const [, setPlanItems] = useState<{ id: string; text: string; done: boolean }[]>([])
  const [expandedArtifacts, setExpandedArtifacts] = useState<Record<string, boolean>>({})
  const [isEditingCode, setIsEditingCode] = useState(false)
  const [designSystem, setDesignSystem] = useState<DesignSystemConfig>(DEFAULT_DESIGN_SYSTEM)
  const [designSystemDoc, setDesignSystemDoc] = useState<string>('')
  const [showDesignSystem, setShowDesignSystem] = useState(false)
  const { systems: designPanelUserSystems } = useUserDesignSystems()
  const designPanelPresets = useMemo(() => allDesignSystemPresets(designPanelUserSystems), [designPanelUserSystems])
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const filesRef = useRef(files)
  filesRef.current = files

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // â”€â”€ Project callbacks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    // Do NOT auto-open last project â€” show project picker instead
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

  // Fetch design system MD doc when preset changes
  useEffect(() => {
    const id = designSystem.presetId
    if (!id) { setDesignSystemDoc(''); return }
    let cancelled = false
    fetch(`/api/design/system-doc/${encodeURIComponent(id)}`, { headers: buildApiHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then((d: { content?: string } | null) => { if (!cancelled && d?.content) setDesignSystemDoc(d.content) })
      .catch(() => { /* no doc available */ })
    return () => { cancelled = true }
  }, [designSystem.presetId])

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
    const DESIGN_OUTPUT_RULES = `OUTPUT CONTRACT — MANDATORY FOR EVERY RESPONSE:
- NEVER call tools. NEVER generate <invoke>, <tool_call>, <minimax:tool_call>, or ANY XML/JSON tool-call markup.
- NEVER write files to disk. NEVER use artifact fences.
- Output HTML in \`\`\`html index.html fenced code blocks with ALL CSS in <style> tags and ALL JS in <script> tags.
- You may also output separate \`\`\`css styles.css and \`\`\`js script.js fenced blocks.
- A response with no fenced code block is INVALID. Output the code directly — no preamble, no explanation after the code.
- Designs must be visually distinctive, pixel-perfect, accessible, and fully responsive with real copy (no lorem ipsum).`

    const prefix = isFirst
      ? `You are Kodo Design Studio, an expert product designer, UX strategist, motion designer, and front-end craftsperson. Your goal is to produce original, production-quality visual work that does not look AI-generated.

RESPONSE FORMAT — follow this exactly:

## Plan

**Goal:** [One sentence: what will be built]

### Steps
- [ ] **[Component/Section]** — [Specific description of what you will build]
- [ ] **[Next component]** — [Specific description]
(4-10 steps, each concrete and descriptive — e.g. “- [ ] **Hero section** — Full-bleed dark canvas with 80px headline, sub-headline, and two pill CTAs”)

Then output ALL code files immediately after the plan. Stopping after the plan is INVALID.

${DESIGN_OUTPUT_RULES}
- After the plan, output ONLY code blocks — no prose, no explanations, no commentary between blocks.

`
      : `REMINDER — ${DESIGN_OUTPUT_RULES}

`

    const contextSections: string[] = [buildKodoDesignModePrompt(designMode)]
    if (projectContext.trim()) {
      contextSections.push(`Project context:\n${truncateText(projectContext.trim(), 1200)}`)
    }
    const dsPrompt = buildDesignSystemPrompt(designSystem)
    if (dsPrompt) contextSections.push(dsPrompt)

    if (designSystemDoc.trim()) {
              contextSections.push(`Design system reference documentation:\n${truncateText(designSystemDoc.trim(), 12000)}`)
    }

    const textAssets = assets
      .filter((asset) => Boolean(asset.textContent && asset.textContent.trim()))
      .slice(0, 4)
    if (textAssets.length > 0) {
      const assetSummary = textAssets
        .map((asset) => `--- ${asset.name} ---\n${truncateText(String(asset.textContent || ''), MAX_CHAT_ASSET_CHARS)}`)
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

    const fullMsg = buildChatMessagePayload(contextSections, prefix, trimmed)

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
        body: JSON.stringify({
          session_id: sid,
          message: fullMsg,
          project_dir: null,
          mode: 'execute',
          artifact_mode: false,
          disable_tools: true,
          max_tokens: DESIGN_GENERATION_MAX_TOKENS,
        }),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        let detail = `${res.status} ${res.statusText}`
        try { const d = await res.json(); detail = formatApiErrorDetail(d.detail, detail) } catch { /* */ }
        throw new Error(detail)
      }
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = '', acc = ''
      // Track code block openings to progressively tick plan checkboxes
      let openCodeBlocks = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          let ev: Record<string, unknown>
          try {
            ev = JSON.parse(raw) as Record<string, unknown>
          } catch {
            continue
          }

          if (ev.type === 'error') {
            throw new Error(streamErrorMessage(ev))
          }

          if (ev.type === 'todo_plan' || ev.type === 'todo_update') {
            const nextPlanItems = planItemsFromTodos(ev.todos)
            if (nextPlanItems.length > 0) setPlanItems(nextPlanItems)
          }

          if (applyToolStartEventToDesignFiles(ev, toolDerivedFiles)) {
            sawToolFileMutation = true
          }
          const textDelta = textFromStreamEvent(ev)
          if (textDelta) {
            acc += textDelta
            // Count new code fence openings (``` + word) in this delta — each = one plan step starting
            openCodeBlocks += (textDelta.match(/^```[a-zA-Z]/gm) || []).length
            // Progressively tick plan checkboxes as code blocks appear
            const displayContent = openCodeBlocks > 0 ? tickCheckboxesInText(acc, openCodeBlocks) : acc
            setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: displayContent } : m))
          }
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
        // Tick all checkboxes in the final message content — all steps done
        const fullyTickedContent = tickCheckboxesInText(acc, Infinity)
        setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: fullyTickedContent, files: resolvedFiles } : m))
        setPlanItems(prev => prev.map(item => ({ ...item, done: true })))
      } else if (acc.trim()) {
        // No code blocks found â€” show raw response as a fallback text file so
        // the user can see what the model actually returned
        const fallback: DesignFile = { id: genId(), name: 'response.txt', language: 'text', content: acc }
        setFiles([fallback])
        setSelectedFileId(fallback.id)
        setViewMode('code')
        setError('The model returned text but no website/app code files. Try again; Kodo now enforces direct fenced-code output more strongly.')
      } else {
        throw new Error('No model response was returned. Check the active model/provider settings and try again.')
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: `Error: ${msg}`, isStreaming: false } : m))
    } finally {
      setMessages(prev => prev.map(m => m.id === aid ? { ...m, isStreaming: false } : m))
      setIsLoading(false)
    }
  }, [assets, designMode, designSystem, designSystemDoc, inlineComments, isLoading, projectContext, sessionId, shareAccess])

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
    () => designPanelPresets.find((preset) => preset.id === designSystem.presetId) || DESIGN_SYSTEM_PRESETS[0],
    [designPanelPresets, designSystem.presetId],
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
      // Text before this code block — rendered with full markdown
      const before = content.slice(last, match.index).trim()
      if (before) {
        parts.push(
          <div key={`text-${match.index}`} style={{ marginBottom: 6 }} className="ds-md">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p style={{ margin: '0 0 6px', lineHeight: 1.6 }}>{children}</p>,
                h1: ({ children }) => <h1 style={{ fontSize: 14, fontWeight: 700, margin: '8px 0 4px', color: 'var(--text-0)' }}>{children}</h1>,
                h2: ({ children }) => <h2 style={{ fontSize: 13, fontWeight: 700, margin: '8px 0 4px', color: 'var(--text-0)' }}>{children}</h2>,
                h3: ({ children }) => <h3 style={{ fontSize: 12, fontWeight: 600, margin: '6px 0 3px', color: 'var(--text-0)' }}>{children}</h3>,
                strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'var(--text-0)' }}>{children}</strong>,
                em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
                code: ({ children }) => <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px' }}>{children}</code>,
                ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ul>,
                ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ol>,
                li: ({ children }) => <li style={{ margin: '2px 0', lineHeight: 1.55 }}>{children}</li>,
                input: ({ checked }) => <input type="checkbox" checked={checked} readOnly style={{ marginRight: 5, accentColor: 'var(--accent)' }} />,
                blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--border)', margin: '4px 0', paddingLeft: 10, color: 'var(--text-2)', fontStyle: 'italic' }}>{children}</blockquote>,
                hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />,
              }}
            >
              {before}
            </ReactMarkdown>
          </div>
        )
      }

      const info = match[1].trim()
      const code = match[2]
      const lineCount = code.split('\n').length
      // Infer filename from fence info
      const infoTokens = info.split(/\s+/)
      const lang = infoTokens[0] || (looksLikeHtmlDocument(code) ? 'html' : 'text')
      const possibleName = infoTokens[1] || ''
      const fileName = possibleName && /\.\w+$/.test(possibleName)
        ? possibleName
        : (lang === 'html' ? 'index.html' : `${lang || 'code'}.${LANG_EXT[lang] || lang || 'txt'}`)
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
      const partialLang = (partialTokens[0] || '').toLowerCase()
      const partialName = partialTokens[1] && /\.\w+$/.test(partialTokens[1])
        ? partialTokens[1]
        : (partialLang === 'html' ? 'index.html' : (partialLang ? `${partialLang}.${LANG_EXT[partialLang] || partialLang}` : 'code'))
      parts.push(
        <div key="streaming-artifact" style={{
          background: 'var(--bg-3)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 10px', marginBottom: 6,
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)',
        }}>
          <Loader size={11} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
          Building {partialName}â€¦
        </div>
      )
    } else if (tail) {
      parts.push(
        <div key="tail" style={{ marginTop: 4 }} className="ds-md">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p style={{ margin: '0 0 6px', lineHeight: 1.6 }}>{children}</p>,
              h1: ({ children }) => <h1 style={{ fontSize: 14, fontWeight: 700, margin: '8px 0 4px' }}>{children}</h1>,
              h2: ({ children }) => <h2 style={{ fontSize: 13, fontWeight: 700, margin: '8px 0 4px' }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ fontSize: 12, fontWeight: 600, margin: '6px 0 3px' }}>{children}</h3>,
              strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'var(--text-0)' }}>{children}</strong>,
              em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
              code: ({ children }) => <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px' }}>{children}</code>,
              ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ul>,
              ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ol>,
              li: ({ children }) => <li style={{ margin: '2px 0', lineHeight: 1.55 }}>{children}</li>,
              input: ({ checked }) => <input type="checkbox" checked={checked} readOnly style={{ marginRight: 5, accentColor: 'var(--accent)' }} />,
            }}
          >
            {tail}
          </ReactMarkdown>
        </div>
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

  // â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const btn = (active: boolean, accent = false) => ({
    display: 'flex', alignItems: 'center' as const, gap: 4,
    padding: '3px 8px', borderRadius: 5,
    border: active ? '1px solid var(--border-bright)' : '1px solid transparent',
    background: active ? (accent ? 'var(--accent)' : 'var(--bg-3)') : 'transparent',
    color: active ? (accent ? '#fff' : 'var(--text-0)') : 'var(--text-2)',
    fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)',
    whiteSpace: 'nowrap' as const, flexShrink: 0 as const,
  })

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

      {/* â•â• TOP BAR â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
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

      {/* â•â• BODY â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

        {/* â”€â”€ FILE TREE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                  {designPanelUserSystems.length > 0 && (
                    <optgroup label="My Design Systems">
                      {designPanelUserSystems.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </optgroup>
                  )}
                  {DESIGN_SYSTEM_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.category} / {preset.label}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
                  {activePreset.colors.map((color, index) => (
                    <span key={`${color}-${index}`} title={color} style={{ width: 18, height: 14, borderRadius: 3, background: color, border: '1px solid var(--border)', display: 'inline-block' }} />
                  ))}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-2)', lineHeight: 1.45, marginTop: 5 }}>
                  {activePreset.summary}
                </div>
                <div style={{ display: 'grid', gap: 5, marginTop: 8, maxHeight: 210, overflowY: 'auto', paddingRight: 2 }}>
                  {designPanelPresets.map((preset) => {
                    const active = designSystem.presetId === preset.id
                    const logo = preset.logoUrl || PRESET_LOGOS[preset.id]
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
                        {logo ? (
                          <img src={logo} alt={preset.label} width={26} height={26}
                            style={{ borderRadius: 5, border: '1px solid var(--border)', flexShrink: 0, objectFit: 'cover', background: 'var(--bg-2)' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                        ) : (
                          <span style={{ width: 26, height: 26, display: 'grid', gridTemplateColumns: '1fr 1fr', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                            {preset.colors.slice(0, 4).map((color, index) => <span key={`${color}-${index}`} style={{ background: color }} />)}
                          </span>
                        )}
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
                  {DESIGN_DIRECTIONS[designSystem.direction].colors.map((color, index) => (
                    <span key={`${color}-${index}`} title={color} style={{ width: 18, height: 14, borderRadius: 3, background: color, border: '1px solid var(--border)', display: 'inline-block' }} />
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
                          {row.colors.map((color, index) => <span key={`${color}-${index}`} style={{ flex: 1, height: 12, borderRadius: 3, background: color, border: '1px solid var(--border)' }} />)}
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
                      <span style={{ fontSize: 13 }}>{a.type.startsWith('image/') ? 'ðŸ–¼' : 'ðŸ“Ž'}</span>
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
                      {h.label || `v${history.length - i}`} â€” {new Date(h.timestamp).toLocaleTimeString()}
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

        {/* â”€â”€ CENTER: PREVIEW / CODE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                  Â· {selectedFile.content.split('\n').length} lines
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
              <div style={{ fontSize: 11, opacity: 0.35 }}>Describe your design in the chat {'→'}</div>
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

        {/* â”€â”€ RIGHT: CHAT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

            {/* Plan checkboxes render inline in the assistant message via ReactMarkdown */}

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
                âš  {error}
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
              placeholder="Describe your design or request changes â€” paste screenshots directly"
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
