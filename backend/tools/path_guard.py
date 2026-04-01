import os
from functools import lru_cache


def _normalize(path: str) -> str:
    """Normalize paths for stable, case-insensitive boundary checks."""
    return os.path.normcase(os.path.realpath(os.path.abspath(path)))


@lru_cache(maxsize=1)
def get_allowed_roots() -> tuple[str, ...]:
    """Resolve allowed roots from ALLOWED_DIRS plus current workspace paths."""
    raw = os.getenv("ALLOWED_DIRS", "")
    roots: list[str] = []

    for part in raw.split(","):
        item = part.strip()
        if not item:
            continue
        expanded = os.path.expandvars(os.path.expanduser(item))
        roots.append(_normalize(expanded))

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


def _is_within(path: str, root: str) -> bool:
    return path == root or path.startswith(root + os.sep)


def is_path_allowed(path: str) -> bool:
    normalized = _normalize(path)
    for root in get_allowed_roots():
        if _is_within(normalized, root):
            return True
    return False


def enforce_allowed_path(path: str) -> str:
    normalized = _normalize(os.path.expandvars(os.path.expanduser(path)))
    if not is_path_allowed(normalized):
        raise ValueError(f"Path is outside allowed directories: {normalized}")
    return normalized


def clear_allowed_roots_cache() -> None:
    get_allowed_roots.cache_clear()
