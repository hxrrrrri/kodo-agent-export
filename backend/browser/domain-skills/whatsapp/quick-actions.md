# WhatsApp Web — quick actions

Use DOM selectors and browser_batch to avoid slow vision loops. This assumes the
browser profile is already paired (QR scanned).

## Stable selectors

- Chat list root: `[aria-label="Chat list"]`, `div[role="grid"][aria-label*="Chat"]`
- Search input: `div[title="Search input textbox"]`, `div[data-testid="chat-list-search"]`
- Chat result row: `[role="option"]`, `div[role="listitem"]`, `div[data-testid="cell-frame-container"]`
- Compose box: `div[title="Type a message"]`, `div[data-testid="conversation-compose-box-input"]`
- Chat title (header): `header span[dir="auto"]`
- Message meta: `[data-pre-plain-text]`
- Message text: `span.selectable-text span`

## Open chat + send message (browser_batch)

```python
steps = [
  {"action": "navigate", "url": "https://web.whatsapp.com"},
  {"action": "wait_selector", "selector": "[aria-label=\"Chat list\"]", "timeout": 30},
  {"action": "click", "selector": "div[title=\"Search input textbox\"]"},
  {"action": "type", "text": "Alice"},
  {"action": "press_key", "key": "Enter"},
  {"action": "wait_selector", "selector": "div[title=\"Type a message\"]", "timeout": 8},
  {"action": "type", "text": "Hi Alice, quick update..."},
  {"action": "press_key", "key": "Enter"}
]
```

## Extract last 50 messages (JS fast path)

```js
(() => {
  const nodes = Array.from(document.querySelectorAll('[data-pre-plain-text]'));
  const out = [];
  for (const node of nodes) {
    const meta = node.getAttribute('data-pre-plain-text') || '';
    let sender = 'Unknown';
    if (meta.includes(']')) {
      sender = meta.split(']').slice(1).join(']').trim();
      if (sender.endsWith(':')) sender = sender.slice(0, -1);
    }
    const textEl = node.querySelector('span.selectable-text span');
    const text = textEl ? textEl.innerText.trim() : '';
    if (text) out.push(sender + ': ' + text);
  }
  return out.slice(-50);
})()
```

## Waits and pitfalls

- `wait_for_load()` returns before chat list renders. Always wait for the chat list selector.
- Search results populate after a short debounce. Add a 300-600ms pause before hitting Enter.
- The compose box is the best signal that a chat is open.
- Avoid brittle class selectors; use aria labels and data-testid values.

## High-level action ideas

Use these as action names when building a browser_batch or custom browser_execute flow:

- `reply`: find a specific message and send a reply.
- `react`: react with an emoji.
- `send_media`: send files/photos when a file picker workflow is available.
- `pin_chat`, `unpin_chat`, `mute_chat`, `unmute_chat`, `archive_chat`, `unarchive_chat`: use visible menu actions only after confirming selectors.

Example:

```json
{
  "steps": [
    {"action": "open_chat", "chat_id": "Alice"},
    {"action": "reply", "message_text": "Can you send the file?", "reply_text": "Sent!"},
    {"action": "react", "message_text": "Thanks", "emoji": "👍"},
    {"action": "send_media", "paths": ["C:/Temp/report.pdf"], "caption": "Here it is"}
  ]
}
```
