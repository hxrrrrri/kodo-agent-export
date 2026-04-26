# YouTube — Search and Play a Video

Field-tested against youtube.com. Works without login for public videos.

## Step-by-step: Search and play

```python
# 1. Open YouTube and wait for search box
await goto_url("https://www.youtube.com")
await wait_for_selector("input#search", timeout=10)

# 2. Click search box, clear it, type query
await click_selector("input#search")
await type_text("nenjin ezhuth x sita kalyanam")
await press_key("Enter")

# 3. Wait for results page
await wait_for_selector("ytd-video-renderer", timeout=10)

# 4. Click the first video result
await click_selector("ytd-video-renderer a#video-title")

# 5. Wait for video player to load
await wait_for_selector("video", timeout=15)

# 6. Play the video (it may autoplay; if not, click the play button)
await js("document.querySelector('video').play()")

# 7. Confirm
info = await page_info()
return {"playing": True, "url": info.get("url"), "title": info.get("title")}
```

## Alternative selectors (if above fails)

```python
# Search box alternatives
await click_selector("ytd-searchbox input")        # new YouTube
await click_selector("[name='search_query']")      # fallback

# Video result alternatives  
await click_by_text(song_name, tag="a")            # click by visible text
await click_selector("#video-title")               # first title link
await click_selector("ytd-rich-item-renderer a#video-title")  # home page grid

# Player alternatives
await js("document.querySelector('.ytp-play-button').click()")  # play button
```

## Handling "Sign in" prompts

```python
# Dismiss sign-in overlay if present
await js("document.querySelector('#dismiss-button')?.click()")
await js("document.querySelector('[aria-label=\"No thanks\"]')?.click()")
```

## Direct URL (fastest — skip search entirely)

If you know the video ID or can construct a search URL:
```python
# Direct search URL — no need to interact with search box
query = "nenjin ezhuth x sita kalyanam"
import urllib.parse
search_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(query)}"
await goto_url(search_url)
await wait_for_selector("ytd-video-renderer a#video-title", timeout=10)
await click_selector("ytd-video-renderer a#video-title")
await wait_for_selector("video", timeout=15)
await js("document.querySelector('video').play()")
```
