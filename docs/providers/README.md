# Provider Docs

Per-provider context files. **Read [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) first** — it's the master architecture document. Then read the file matching the provider you're running as.

```
docs/providers/
├── PROJECT_OVERVIEW.md          ← Master doc (read first)
├── README.md                    ← This file
├── cli/
│   ├── claude-cli.md            ← Anthropic Claude Code CLI
│   ├── codex-cli.md             ← OpenAI Codex CLI
│   ├── gemini-cli.md            ← Google Gemini CLI
│   └── copilot-cli.md           ← GitHub Copilot CLI
├── api/
│   ├── anthropic-api.md         ← Direct Anthropic API
│   ├── openai-api.md            ← Direct OpenAI / Codex API
│   └── gemini-api.md            ← Direct Google Gemini API
└── local/
    ├── ollama.md                ← Ollama local models
    └── gemma.md                 ← Gemma 2 / Gemma 4 specifics
```

## Why these docs exist

Without these, every provider has to read the whole project to understand it — wasting tokens and context. With these, a provider reads ~15 KB of focused docs and knows exactly:

- What this codebase is and how it's structured
- Which files implement which features
- How its own integration is wired
- What conventions to follow when making edits
- Where to make surgical changes for a given task type

## Workflow for any provider

1. Read `PROJECT_OVERVIEW.md` (architecture, file map, conventions, skills, tools)
2. Read your provider-specific doc (integration entry points, quirks, gotchas)
3. Use the file map to jump straight to the right module
4. Make surgical edits — minimal diff, match existing style, no speculative refactors
