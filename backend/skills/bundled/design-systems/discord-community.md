# Design System Inspired by Discord

## 1. Visual Theme & Atmosphere

Discord is dark blurple community infrastructure. The three-panel layout (server list, channel list, content) defines the interface architecture. Deep blurple (#313338) canvas, Discord Blurple (#5865f2) for interactive elements, and a design that serves millions of simultaneous conversations. GG Sans custom font. Gaming community energy: confident, dense, interactive.

**Key Characteristics:**
- Deep blurple (#313338) primary canvas
- Discord Blurple (#5865f2) for interactive elements and branding
- Three-panel layout: servers (72px) + channels (240px) + content
- GG Sans / Inter font - weight 400-700
- Role badge color system for community hierarchy
- Status indicators: Online (green) / Idle (yellow) / DND (red) / Offline (gray)

## 2. Color Palette & Roles

**Surface:** Background #313338 | Server List #1e1f22 | Channel List #2b2d31 | Chat #313338 | Elevated #404249
**Brand:** Blurple #5865f2 | Blurple Hover #4752c4 | Blurple Light rgba(88,101,242,0.15)
**Text:** Primary #f2f3f5 | Secondary #b5bac1 | Muted #80848e | Input Placeholder #6d6f78
**Border:** #2b2d31 (panel dividers) | #1e1f22 (dark borders)
**Status:** Online #23a55a | Idle #f0b232 | DND #f23f43 | Offline #80848e
**Semantic:** Positive #23a55a | Negative #f23f43 | Warning #f0b232 | Link #00b0f4

## 3. Typography

**All:** GG Sans (Discord custom) fallback: Inter, -apple-system, sans-serif

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Server Name | 16px | 700 | Channel list header |
| Channel Name | 16px | 400 | Channel items |
| Message Author | 16px | 500 | Chat author name |
| Message Body | 16px | 400 | Chat content, 1.375 line-height |
| Timestamp | 12px | 400 | Message time |
| Section Header | 12px | 700 | Channel category label |
| Button | 14px | 500 | Action CTAs |

## 4. Component Stylings

**Primary Button (Blurple):**
- #5865f2 bg, #ffffff text, 4px radius, 8px 16px, 14px/500
- Hover: #4752c4 | Focus: 3px rgba(88,101,242,0.4) ring

**Server Icon:**
- 48px circle | Custom guild icon or initials fallback
- Active: rounded-square corners (squircle transform) | Status ring around it
- Hover: scale 1.05

**Channel Item:**
- 36px height | # hash icon + channel name 16px/400 #b5bac1
- Hover: #404249 bg | Active: #404249 bg, #f2f3f5 text
- Unread: white text + pulse dot

**Message:**
- Author name: 16px/500 (role color) + timestamp 12px muted
- Message: 16px/400 #f2f3f5 | Hover: #2e3035 bg
- Reactions: emoji + count in rounded chip

**Role Badge:**
- Colored pill per role | Colored name in member list
- Color set by server admin for community hierarchy

**Navigation (Three-Panel):**
- Server list: #1e1f22, 72px wide, server icons centered
- Channel list: #2b2d31, 240px, server name + channels
- Content: #313338, remaining space, chat messages

## 5. Layout
Three-panel fixed layout | Server: 72px | Channels: 240px | Content: fluid
Message list: bottom-anchored, newer messages at bottom | Input: 44px at bottom

## 6. Key Rules
DO: Three-panel layout | Role color system | Status indicators | Dark blurple surfaces
DO NOT: Light backgrounds | Remove the three-panel structure | Single color for all text

## 7. Quick Reference
Background: #313338 | Server list: #1e1f22 | Channel list: #2b2d31 | Elevated: #404249
Blurple: #5865f2 | Primary: #f2f3f5 | Secondary: #b5bac1 | Muted: #80848e
Online: #23a55a | DND: #f23f43 | Idle: #f0b232
