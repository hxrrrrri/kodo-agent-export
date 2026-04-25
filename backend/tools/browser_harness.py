from typing import Any
from tools.base import BaseTool, ToolResult

class BrowserHarnessTool(BaseTool):
    name = "browser_execute"
    description = (
        "Execute python scripts natively against the live browser instance using the browser-harness helpers.\n"
        "The script runs in an async context, so use `await` for the helper functions.\n\n"
        "Available helpers:\n"
        "  - await goto_url(url: str) -> dict\n"
        "  - await page_info() -> dict\n"
        "  - await click_at_xy(x: int, y: int, button='left', clicks=1)\n"
        "  - await type_text(text: str)\n"
        "  - await press_key(key: str, modifiers=0)\n"
        "  - await scroll(x: int, y: int, dy=-300, dx=0)\n"
        "  - await capture_screenshot(path='/tmp/shot.png', full=False) -> str\n"
        "  - await list_tabs(include_chrome=True) -> list\n"
        "  - await current_tab() -> dict\n"
        "  - await switch_tab(target_id: str) -> str\n"
        "  - await new_tab(url='about:blank') -> str\n"
        "  - await js(expression: str, target_id=None) -> Any\n"
        "  - await wait_for_load(timeout=15.0) -> bool\n"
        "  - await dispatch_key(selector: str, key='Enter', event='keypress')\n"
        "  - await cdp(method: str, session_id=None, **params) -> dict\n\n"
        "You MUST return a result dictionary or string at the end using `return`.\n"
        "Example: `res = await page_info(); return res`."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "python_code": {
                "type": "string",
                "description": "The async python code to execute using the browser-harness helpers.",
            }
        },
        "required": ["python_code"],
    }

    async def execute(self, python_code: str, **kwargs) -> ToolResult:
        # Wrap the code inside an async function definition
        code_wrapper = f"""
async def __browser_tool_func():
    from browser.helpers import (
        goto_url, page_info, click_at_xy, type_text, press_key, scroll, capture_screenshot,
        list_tabs, current_tab, switch_tab, new_tab, js, wait_for_load, dispatch_key, cdp
    )
    import asyncio
    
{chr(10).join(['    ' + line for line in python_code.split(chr(10))])}
"""
        
        namespace: dict[str, Any] = {}
        try:
            from privacy import feature_enabled
            if not feature_enabled("BROWSER_HARNESS", default="0"):
                return ToolResult(
                    success=False, 
                    output="", 
                    error="Browser harness is not enabled. The user must enable 'Browser Harness (Beta)' in Settings."
                )

            from api.browser_admin import get_daemon
            daemon = await get_daemon()
            if not daemon.is_running:
                try:
                    await daemon.start()
                except Exception as e:
                    return ToolResult(success=False, output="", error=f"Failed to start Chrome automatically: {e}")

            exec(code_wrapper, namespace)
            func = namespace["__browser_tool_func"]
            result = await func()
            return ToolResult(success=True, output=str(result), metadata={"result": result})
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))

    def prompt(self) -> str:
        return (
            "You have access to a live browser via `browser_execute`. You can navigate, click, type, and extract DOM info. "
            "Write valid async python code using the provided helpers and ALWAYS wait for page loads before extracting info. "
            "Example: `await goto_url('https://example.com'); await wait_for_load(); return await js('document.title')`"
        )
