# Changelog

All notable changes to KODO are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

## [Unreleased]
### Added
- Cron-scheduled agent runs (KODO_ENABLE_CRON=1)
- Settings API + UI (runtime feature flag toggles)
- Agent marketplace: export/import .kodopack files
- Per-session cost analytics in usage dashboard
- Real-time typing indicator with active tool name
- LLM-powered slash command + prompt library autocomplete
- OpenAPI documentation at /docs and /redoc

### Fixed
- Keyboard shortcuts Ctrl+L/S/T/N/B now wired
- message-enter animation added to MessageBubble
- aria-live and role=log on message list
- document.hidden completion chime
- Theme picker exposes all 10 themes
- Apple PWA meta tags added to index.html
- 5 missing backend test files added

## [0.6.0] - 2026-04-04
### Added
- 10-theme system (ocean, forest, midnight, rose, sunrise, nord, mono, glass)
- NotebookPanel with CodeMirror cells (Python + Node)
- EditorPanel with split-pane CodeMirror editor
- CodeReviewPanel with AI git diff analysis
- ReplayPanel - session time-travel debugging
- CollabBar - real-time session sharing via SSE
- Voice input (SpeechRecognition API)
- TTS output (OpenAI TTS API)
- PromptLibraryPanel with {{variable}} templates
- SkillBuilderPanel for custom skill creation
- NotificationCenter (toast + browser notifications)
- PWA service worker + manifest
- 7-view sidebar (sessions/providers/agents/usage/prompts/skills/review)

[... earlier versions ...]
