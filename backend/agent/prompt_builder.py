from agent.modes import get_mode
from memory.manager import memory_manager

BASE_SYSTEM_PROMPT = """You are KODO, a powerful personal autonomous AI agent. You can:
- Execute bash commands to interact with the OS
- Read, write, and edit files
- Search codebases with grep and glob
- Fetch web pages for documentation and info
- Chain multiple tools together to complete complex tasks autonomously

You are direct, capable, and efficient. When given a task:
1. Think through the steps needed
2. Use tools proactively without asking unnecessary questions
3. Report what you're doing as you do it
4. If something fails, diagnose and try an alternative approach

Always show your work - briefly explain each tool call before making it."""


def build_tool_prompt_context() -> str:
    from tools import ALL_TOOLS

    lines: list[str] = []
    for tool in ALL_TOOLS:
        contribution = tool.prompt().strip()
        if contribution:
            lines.append(f"- {tool.name}: {contribution}")

    if not lines:
        return ""

    return "Tool-specific guidance:\n" + "\n".join(lines)


async def build_system_prompt(*, project_dir: str | None, mode: str | None) -> str:
    sections = [BASE_SYSTEM_PROMPT, get_mode(mode).prompt]

    tool_context = build_tool_prompt_context()
    if tool_context:
        sections.append(tool_context)

    memory_context = await memory_manager.load_memory(project_dir)
    if memory_context:
        sections.append(memory_context)

    return "\n\n".join([section for section in sections if section.strip()])
