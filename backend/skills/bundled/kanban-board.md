---
name: kanban-board
description: Interactive Kanban board with drag-and-drop cards, swim lanes, card detail modals, WIP limits, and sprint/project context. Built for team workflow visualization.
---

# Kanban Board

Use this skill to produce interactive Kanban workflow boards as HTML artifacts. Output is a drag-and-drop board with multiple columns, card management, and team context.

## Board Architecture

Standard columns (customize to the project's workflow):

```
Backlog → To Do → In Progress → In Review → Done
```

Or for engineering teams:
```
Ideas → Planned → In Dev → PR Open → Deployed
```

Or for content:
```
Ideas → Writing → Editing → Scheduled → Published
```

## Card Structure

Each card contains:
- **Card title**: 1 line, descriptive
- **Card ID**: `#123` or `PROJ-42` format
- **Priority badge**: Critical / High / Medium / Low (colored)
- **Assignee avatar**: 24px circle with initials
- **Label tags**: 1–3 small colored pills
- **Due date**: relative ("in 2 days", "overdue")
- **Comment/subtask count**: icon + number

```html
<div class="card" draggable="true" data-id="123">
  <div class="card-header">
    <span class="priority high">High</span>
    <span class="card-id">#123</span>
  </div>
  <div class="card-title">Implement OAuth2 login flow</div>
  <div class="card-meta">
    <div class="labels">
      <span class="label auth">Auth</span>
      <span class="label backend">Backend</span>
    </div>
    <div class="card-footer">
      <span class="avatar">JS</span>
      <span class="due overdue">Jan 15</span>
      <span class="stats">💬 3 · ☑ 2/5</span>
    </div>
  </div>
</div>
```

## Column Structure

Each column has:
- **Header**: Column name + card count badge
- **WIP limit indicator**: "3/5" — current cards / max (amber when near, red when exceeded)
- **Add card button**: at bottom of column
- **Card list**: scrollable, drag target

## Drag and Drop

Native HTML5 drag-and-drop:
```javascript
card.addEventListener('dragstart', (e) => {
  e.dataTransfer.setData('cardId', card.dataset.id);
  card.classList.add('dragging');
});

column.addEventListener('dragover', (e) => {
  e.preventDefault();
  // show drop indicator
});

column.addEventListener('drop', (e) => {
  const cardId = e.dataTransfer.getData('cardId');
  // move card to this column
});
```

## Card Detail Modal

Click a card to open a detail panel:
- Full title (editable)
- Description / acceptance criteria (textarea)
- Assignee picker
- Label editor
- Due date picker
- Comment thread
- Activity log

## Board Header

- Board name + project context
- Sprint name (if sprints enabled) + dates
- Team member avatars with filter capability
- Search/filter bar
- Zoom/density control

## Realistic Data

Populate the board with realistic-looking work items. Include:
- Mixed priorities (not all High)
- Some overdue cards (1–2 max)
- Cards in various stages
- Real-sounding task titles for the domain
- 2–4 assignees with different initials

## Quality Gates

1. Drag-and-drop moves cards between columns
2. WIP limit shows correctly per column
3. Card counts in column headers update on drop
4. Modal opens on card click
5. Board scrolls horizontally if columns exceed viewport
6. Mobile: columns stack or horizontal scroll works
