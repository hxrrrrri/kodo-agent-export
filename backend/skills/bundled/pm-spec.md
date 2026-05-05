---
name: pm-spec
description: Product Manager specification document with executive summary, problem statement, user stories, acceptance criteria, technical requirements, metrics, and open questions. Design-grade Markdown artifact.
---

# Product Manager Spec (PRD)

Use this skill to produce Product Requirements Documents, feature specifications, and technical briefs. Output is a structured, professional HTML or Markdown artifact ready for engineering review.

## Document Structure

```
1. Executive Summary (TL;DR)
2. Problem Statement
3. Goals & Non-Goals
4. User Stories
5. Requirements
   5a. Functional Requirements
   5b. Non-Functional Requirements
6. User Experience
7. Technical Considerations
8. Metrics & Success Criteria
9. Milestones & Timeline
10. Open Questions
11. Appendix
```

## Executive Summary

3–5 bullets. Each bullet is a complete, self-contained statement. The reader must understand the entire spec from the summary.

Example:
- Users cannot export reports to PDF; this ships that capability behind a feature flag in v2.4
- Target users: Enterprise tier accounts (1,200 accounts as of Q3)
- Success: 40% of target users export at least one report within 30 days of launch
- Risk: PDF rendering at scale — load tested to 100 concurrent exports before GA

## Problem Statement

Answer these three questions explicitly:

1. **What is the current situation?** (observable fact, not opinion)
2. **Why is this a problem?** (impact: user pain, business cost, or opportunity size)
3. **How do we know this is real?** (data, user research, support tickets, revenue impact)

## User Stories

Use the standard format with explicit acceptance criteria:

```markdown
## Story: Export report as PDF

**As** an enterprise analyst  
**I want** to export my custom report as a PDF  
**So that** I can share it with stakeholders who don't have dashboard access

### Acceptance Criteria

- [ ] PDF export button visible in report toolbar for Enterprise tier only
- [ ] PDF matches the report layout at 1:1 fidelity (no cut-off content)
- [ ] Export completes in under 10 seconds for reports with up to 50 rows
- [ ] File is named "[Report Name] - [Date].pdf" automatically
- [ ] Success/failure notification shown to user
```

## Requirements Format

**Functional requirements** — MUST / SHOULD / COULD (MoSCoW):
- MUST: non-negotiable for launch
- SHOULD: high priority, ship if possible
- COULD: nice-to-have, cut if time-constrained

**Non-functional requirements** — with measurable thresholds:
- Performance: p95 latency < 2s, p99 < 5s
- Availability: 99.9% uptime
- Security: SOC2 compliance, no PII in logs
- Accessibility: WCAG 2.1 AA

## Metrics Section

For each success metric:

| Metric | Current | Target | Measurement Method |
|--------|---------|--------|--------------------|
| PDF export adoption | 0% | 40% within 30 days | Mixpanel event `export_pdf` |
| Export completion rate | — | ≥95% | Success event / attempt event |
| Export latency p95 | — | <10s | Datadog APM |

## Open Questions

Numbered list. Each question has:
- The question itself (specific, answerable)
- Who can answer it
- Due date for answer

Example:
1. Does the PDF include the report filters as a header? [@design-team, needs decision before engineering starts]
2. Should free tier see the export button disabled or hidden? [@product, by 2025-06-01]

## Writing Standards

- No vague language: "improve performance" → "reduce p95 latency from 800ms to 200ms"
- No passive voice: "the data will be shown" → "the dashboard shows the data"
- No scope creep markers: flag any "while we're at it" ideas as separate open questions
- Acceptance criteria must be testable — a QA engineer should be able to run them without guessing
