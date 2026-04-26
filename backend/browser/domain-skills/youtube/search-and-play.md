# YouTube — Search and Play a Video

## FASTEST: Direct search URL + click play (no search box interaction needed)

```python
import urllib.parse

async def youtube_search_and_play(query: str):
    # 1. Navigate directly to search results page (skip typing in search box)
    encoded = urllib.parse.quote(query)
    await goto_url(f"https://www.youtube.com/results?search_query={encoded}")

    # 2. Dismiss cookie consent if present (EU/UK users)
    await js("document.querySelector('button[aria-label*=\"Accept\"]')?.click()")
    await js("document.querySelector('.eom-buttons button:last-child')?.click()")
    await asyncio.sleep(0.5)

    # 3. Wait for video results, then click first one
    await wait_for_selector("ytd-video-renderer", timeout=10)
    await click_selector("ytd-video-renderer a#video-title")

    # 4. Wait for the video page to load
    await wait_for_selector("ytd-watch-flexy", timeout=12)
    await asyncio.sleep(1.5)   # give player time to initialise

    # 5. Dismiss sign-in/cookie prompts on watch page
    await js("document.querySelector('button[aria-label*=\"No thanks\"]')?.click()")
    await js("document.querySelector('#dismiss-button')?.click()")
    await js("document.querySelector('ytd-button-renderer#dismiss-button button')?.click()")

    # 6. Click the play button (avoids autoplay policy — needs a real click, not .play())
    play_clicked = await click_selector(".ytp-play-button")
    if not play_clicked:
        # Fallback: click the centre of the player
        await click_selector("#movie_player")

    # 7. Confirm playing
    return await page_info()

return await youtube_search_and_play("nenjin ezhuth x sita kalyanam")
```

## Why programmatic `video.play()` FAILS on YouTube

YouTube's player is inside a shadow DOM and wrapped in an iframe-like context.
`document.querySelector('video').play()` is rejected by the browser's autoplay policy
because it lacks a user gesture. You MUST simulate a real click on `.ytp-play-button`.

## Selectors cheatsheet (2024–2025 YouTube)

```python
# Search results
"ytd-video-renderer a#video-title"        # first result title link
"ytd-rich-item-renderer a#video-title"    # homepage grid

# Watch page
"#movie_player"                           # whole player area
".ytp-play-button"                        # play/pause button
".ytp-play-button[aria-label*='Play']"   # only when paused
"ytd-watch-flexy"                         # page loaded signal
"#above-the-fold #title h1"              # video title

# Dialogs to dismiss
"button[aria-label*='Accept']"            # cookie consent
"#dismiss-button button"                  # sign-in prompt
"tp-yt-paper-dialog button:last-child"   # generic dialog
```

## Using browser_batch (fast, single tool call)

```python
# Pass this as the steps array to browser_batch
steps = [
    {"action": "navigate", "url": "https://www.youtube.com/results?search_query=nenjin+ezhuth+x+sita+kalyanam"},
    {"action": "js", "expression": "document.querySelector('button[aria-label*=\"Accept\"]')?.click()"},
    {"action": "wait_selector", "selector": "ytd-video-renderer", "timeout": 10},
    {"action": "click", "selector": "ytd-video-renderer a#video-title"},
    {"action": "wait_selector", "selector": "ytd-watch-flexy", "timeout": 12},
    {"action": "js", "expression": "document.querySelector('#dismiss-button')?.click()"},
    {"action": "wait_selector", "selector": ".ytp-play-button", "timeout": 8},
    {"action": "click", "selector": ".ytp-play-button"},
]
```
