# Instagram Web — quick actions

Use DOM selectors and browser_batch to avoid slow vision loops. This assumes the
browser profile is already logged in.

## Stable selectors (best-effort)

- Inbox root: `main[role="main"]`, `div[role="main"]`
- New message button: `button[aria-label="New message"]`
- Search input: `input[placeholder*="Search"]`, `input[aria-label*="Search"]`
- Composer: `[contenteditable="true"][role="textbox"]`, `textarea`
- Chat title: `header h1`, `header h2`, `header a[role="link"] span`
- Message rows: `div[role="row"]`, `div[dir="auto"]`

## Open chat + send message (browser_batch)

```python
steps = [
  {"action": "navigate", "url": "https://www.instagram.com/direct/inbox/"},
  {"action": "wait_selector", "selector": "main[role=\"main\"]", "timeout": 30},
  {"action": "click", "text": "New message"},
  {"action": "type", "text": "alice"},
  {"action": "press_key", "key": "Enter"},
  {"action": "click", "text": "Next"},
  {"action": "wait_selector", "selector": "[contenteditable=\"true\"]", "timeout": 8},
  {"action": "type", "text": "Hey! Quick update..."},
  {"action": "press_key", "key": "Enter"}
]
```

## Extract last 50 messages (JS fast path)

```js
(() => {
  const nodes = Array.from(document.querySelectorAll('div[role="row"], div[dir="auto"]'));
  const out = [];
  const seen = new Set();
  for (const node of nodes) {
    const text = (node.innerText || node.textContent || '').trim();
    if (!text || text.length > 1000) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out.slice(-50);
})()
```

## Waits and pitfalls

- Inbox load is SPA-based; always wait for `main[role="main"]`.
- Some locales show "Next" instead of "Chat" when starting a new DM.
- Avoid brittle class selectors; prefer aria labels and generic roles.

## High-level action ideas

Use these as action names when building a browser_batch or custom browser_execute flow:

- `reply`: find a specific message and send a reply.
- `react`: react with an emoji or like.
- `send_media`: send files/photos when a file picker workflow is available.
- `mute_thread`, `unmute_thread`, `pin_thread`, `unpin_thread`: use visible menu actions only after confirming selectors.

Example:

```json
{
  "steps": [
    {"action": "open_chat", "chat_id": "alice"},
    {"action": "reply", "message_text": "Can you send that?", "reply_text": "Sure"},
    {"action": "react", "message_text": "Thanks", "emoji": "❤️"},
    {"action": "send_media", "paths": ["C:/Temp/photo.jpg"]}
  ]
}
```
