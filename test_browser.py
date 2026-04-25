import asyncio
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

# Mock feature flag
os.environ["KODO_ENABLE_BROWSER_HARNESS"] = "1"

from backend.tools.browser_harness import BrowserHarnessTool

async def test():
    tool = BrowserHarnessTool()
    res = await tool.execute("""
await goto_url('https://github.com/hxrrrrri')
await wait_for_load()
res = await js("Array.from(document.querySelectorAll('a[itemprop=\\"name codeRepository\\"]')).map(a => a.innerText)")
return res
""")
    print("Test result:", res)

if __name__ == "__main__":
    asyncio.run(test())
