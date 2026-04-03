import os
from contextlib import contextmanager
from contextvars import ContextVar
from functools import lru_cache


_ACTIVE_PROJECT_DIR: ContextVar[str | None] = ContextVar("active_project_dir", default=None)


def _normalize(path: str) -> str:
    """Normalize paths for stable, case-insensitive boundary checks."""
    return os.path.normcase(os.path.realpath(os.path.abspath(path)))


@contextmanager
def project_dir_context(project_dir: str | None):
    """Set a task-local project directory used for relative path resolution."""
    normalized = _normalize(project_dir) if project_dir else None
    token = _ACTIVE_PROJECT_DIR.set(normalized)
    try:
        yield
    finally:
        _ACTIVE_PROJECT_DIR.reset(token)


def get_active_project_dir() -> str | None:
    return _ACTIVE_PROJECT_DIR.get()


def _resolve_input_path(path: str) -> str:
    expanded = os.path.expandvars(os.path.expanduser(path))
    if not os.path.isabs(expanded):
        base = get_active_project_dir() or os.getcwd()
        expanded = os.path.join(base, expanded)
    return expanded


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _iter_env_paths(raw: str) -> list[str]:
    items: list[str] = []
    for part in raw.split(","):
        entry = part.strip()
        if not entry:
            continue
        expanded = os.path.expandvars(os.path.expanduser(entry))
        items.append(expanded)
    return items


@lru_cache(maxsize=1)
def _strict_allowlist_enabled() -> bool:
    # Default behavior is user-driven directory choice with safety blocks.
    # Set STRICT_PATH_ALLOWLIST=1 to enforce ALLOWED_DIRS boundaries.
    return _env_bool("STRICT_PATH_ALLOWLIST", False)


@lru_cache(maxsize=1)
def get_allowed_roots() -> tuple[str, ...]:
    """Resolve allowlist roots (enforced only when STRICT_PATH_ALLOWLIST=1)."""
    if not _strict_allowlist_enabled():
        return tuple()

    raw = os.getenv("ALLOWED_DIRS", "")
    roots: list[str] = []

    for item in _iter_env_paths(raw):
        roots.append(_normalize(item))

    # Always allow the current backend cwd and its parent project directory.
    cwd = _normalize(os.getcwd())
    roots.append(cwd)
    roots.append(_normalize(os.path.join(cwd, os.pardir)))

    deduped: list[str] = []
    seen: set[str] = set()
    for root in roots:
        if root in seen:
            continue
        seen.add(root)
        deduped.append(root)

    return tuple(deduped)


@lru_cache(maxsize=1)
def get_blocked_roots() -> tuple[str, ...]:
    """Resolve harmful/system roots that are always blocked by default."""
    roots: list[str] = []

    if not _env_bool("ALLOW_SYSTEM_DIRS", False):
        if os.name == "nt":
            for key in ("SystemRoot", "ProgramFiles", "ProgramFiles(x86)", "ProgramData"):
                value = os.getenv(key, "").strip()
                if value:
                    roots.append(_normalize(value))

            system_drive = os.getenv("SystemDrive", "C:").strip() or "C:"
            roots.append(_normalize(os.path.join(system_drive + os.sep, "$Recycle.Bin")))
            roots.append(_normalize(os.path.join(system_drive + os.sep, "System Volume Information")))
        else:
            for item in (
                "/bin",
                "/boot",
                "/dev",
                "/etc",
                "/lib",
                "/lib64",
                "/proc",
                "/root",
                "/run",
                "/sbin",
                "/sys",
                "/usr",
                "/var",
            ):
                roots.append(_normalize(item))

    for item in _iter_env_paths(os.getenv("BLOCKED_DIRS", "")):
        roots.append(_normalize(item))

    deduped: list[str] = []
    seen: set[str] = set()
    for root in roots:
        if root in seen:
            continue
        seen.add(root)
        deduped.append(root)

    return tuple(deduped)


def _is_within(path: str, root: str) -> bool:
    return path == root or path.startswith(root + os.sep)


def is_path_harmful(path: str) -> bool:
    normalized = _normalize(path)
    for root in get_blocked_roots():
        if _is_within(normalized, root):
            return True
    return False


def is_path_allowed(path: str) -> bool:
    normalized = _normalize(path)
    if is_path_harmful(normalized):
        return False

    roots = get_allowed_roots()
    if not roots:
        return True

    for root in roots:
        if _is_within(normalized, root):
            return True
    return False


def enforce_allowed_path(path: str) -> str:
    normalized = _normalize(_resolve_input_path(path))
    if is_path_harmful(normalized):
        raise ValueError(f"Path is blocked for safety: {normalized}")

    roots = get_allowed_roots()
    if roots and not is_path_allowed(normalized):
        raise ValueError(
            "Path is outside allowed directories: "
            f"{normalized}. "
            "Set ALLOWED_DIRS to include it or disable STRICT_PATH_ALLOWLIST."
        )
    return normalized


def clear_allowed_roots_cache() -> None:
    _strict_allowlist_enabled.cache_clear()
    get_allowed_roots.cache_clear()
    get_blocked_roots.cache_clear()
