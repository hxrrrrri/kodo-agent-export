import re
import httpx

from privacy import build_httpx_async_client
from .base import BaseTool, ToolResult


def strip_html(html: str) -> str:
    """Basic HTML stripping — removes tags, collapses whitespace."""
    text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


class WebFetchTool(BaseTool):
    name = "web_fetch"
    description = (
        "Fetch the content of a web page at a given URL. "
        "Returns the page text content (HTML stripped). "
        "Useful for reading documentation, APIs, or any online resource."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "The URL to fetch",
            },
            "max_chars": {
                "type": "integer",
                "description": "Max characters to return (default: 10000)",
                "default": 10000,
            },
        },
        "required": ["url"],
    }

    async def execute(self, url: str, max_chars: int = 10000, **kwargs) -> ToolResult:
        if not url.startswith(("http://", "https://")):
            url = "https://" + url

        try:
            async with build_httpx_async_client(
                follow_redirects=True,
                timeout=20,
                headers={"User-Agent": "KODO-Agent/1.0 (personal AI assistant)"},
            ) as client:
                resp = await client.get(url)
                resp.raise_for_status()

            content_type = resp.headers.get("content-type", "")
            text = resp.text

            if "html" in content_type:
                text = strip_html(text)

            if len(text) > max_chars:
                text = text[:max_chars] + f"\n... [truncated at {max_chars} chars]"

            return ToolResult(
                success=True,
                output=text,
                metadata={"url": url, "status_code": resp.status_code, "content_type": content_type},
            )
        except httpx.HTTPStatusError as e:
            return ToolResult(success=False, output="", error=f"HTTP {e.response.status_code}: {url}")
        except httpx.TimeoutException:
            return ToolResult(success=False, output="", error=f"Request timed out: {url}")
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))
