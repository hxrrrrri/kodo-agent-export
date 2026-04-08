"""
KODO <-> code-review-graph integration manager.

All CRG imports are lazy (inside function bodies) so KODO starts even when
code-review-graph is not installed. Each public function returns a plain dict
with at minimum {"status": "ok"|"error"|"unavailable"}.
"""

from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path
from typing import Any

logger = logging.getLogger("kodo.crg")


def crg_available() -> bool:
    disabled = os.environ.get("CRG_DISABLED", "").strip().lower()
    if disabled in {"1", "true", "yes", "on"}:
        return False
    try:
        import code_review_graph  # noqa: F401

        return True
    except ImportError:
        return False


def _unavailable() -> dict[str, Any]:
    return {
        "status": "unavailable",
        "error": "code-review-graph not installed. Run: pip install code-review-graph",
        "crg_available": False,
    }


def _error(op: str, e: Exception) -> dict[str, Any]:
    logger.exception("%s failed", op)
    return {"status": "error", "error": str(e), "crg_available": False}


def _validated_repo_root(repo_root: str | None = None) -> Path | None:
    root = get_crg_repo_root(repo_root)
    if root is None:
        return None
    if not root.is_absolute():
        raise ValueError(f"Repository root must be absolute: {root}")
    if not root.exists():
        raise ValueError(f"Repository root does not exist: {root}")
    return root


def get_crg_repo_root(hint: str | None = None) -> Path | None:
    if hint:
        p = Path(hint).expanduser()
        if p.exists():
            return p.resolve()
    env = os.environ.get("CRG_REPO_ROOT", "").strip()
    if env:
        p = Path(env).expanduser()
        if p.exists():
            return p.resolve()
    if crg_available():
        try:
            from code_review_graph.incremental import find_repo_root

            root = find_repo_root()
            return root.resolve() if root else None
        except Exception:
            pass
    return None


def build_graph(
    repo_root: str | None = None,
    full_rebuild: bool = False,
    postprocess: str = "full",
) -> dict[str, Any]:
    if not crg_available():
        return _unavailable()
    logger.debug(
        "build_graph(repo_root=%s, full_rebuild=%s, postprocess=%s)",
        repo_root,
        full_rebuild,
        postprocess,
    )
    try:
        from code_review_graph.tools.build import build_or_update_graph

        root = _validated_repo_root(repo_root)
        result = build_or_update_graph(
            full_rebuild=full_rebuild,
            repo_root=str(root) if root else None,
            postprocess=postprocess,
        )
        logger.debug("build_graph result: %s", result)
        return {"status": "ok", **result}
    except Exception as e:
        return _error("build_graph", e)


def get_impact_radius(
    changed_files: list[str] | None = None,
    repo_root: str | None = None,
    max_depth: int = 2,
    base: str = "HEAD~1",
) -> dict[str, Any]:
    if not crg_available():
        return _unavailable()
    logger.debug(
        "get_impact_radius(changed_files=%s, repo_root=%s, max_depth=%s, base=%s)",
        changed_files,
        repo_root,
        max_depth,
        base,
    )
    try:
        from code_review_graph.tools.query import get_impact_radius as _fn

        root = _validated_repo_root(repo_root)
        result = _fn(
            changed_files=changed_files,
            max_depth=max_depth,
            repo_root=str(root) if root else None,
            base=base,
        )
        logger.debug("get_impact_radius result: %s", result)
        return {"status": "ok", **result}
    except Exception as e:
        return _error("get_impact_radius", e)


def detect_changes(
    repo_root: str | None = None,
    base: str = "HEAD~1",
    changed_files: list[str] | None = None,
    include_source: bool = False,
    max_depth: int = 2,
    detail_level: str = "standard",
) -> dict[str, Any]:
    if not crg_available():
        return _unavailable()
    logger.debug(
        "detect_changes(repo_root=%s, base=%s, changed_files=%s, include_source=%s, max_depth=%s, detail_level=%s)",
        repo_root,
        base,
        changed_files,
        include_source,
        max_depth,
        detail_level,
    )
    try:
        from code_review_graph.tools.review import detect_changes_func

        root = _validated_repo_root(repo_root)
        result = detect_changes_func(
            base=base,
            changed_files=changed_files,
            include_source=include_source,
            max_depth=max_depth,
            repo_root=str(root) if root else None,
            detail_level=detail_level,
        )
        logger.debug("detect_changes result: %s", result)
        return {"status": "ok", **result}
    except Exception as e:
        return _error("detect_changes", e)


def query_graph(
    pattern: str,
    target: str,
    repo_root: str | None = None,
    detail_level: str = "standard",
) -> dict[str, Any]:
    if not crg_available():
        return _unavailable()
    logger.debug(
        "query_graph(pattern=%s, target=%s, repo_root=%s, detail_level=%s)",
        pattern,
        target,
        repo_root,
        detail_level,
    )
    try:
        from code_review_graph.tools.query import query_graph as _fn

        root = _validated_repo_root(repo_root)
        result = _fn(
            pattern=pattern,
            target=target,
            repo_root=str(root) if root else None,
            detail_level=detail_level,
        )
        logger.debug("query_graph result: %s", result)
        return {"status": "ok", **result}
    except Exception as e:
        return _error("query_graph", e)


def semantic_search(
    query: str,
    kind: str | None = None,
    limit: int = 20,
    repo_root: str | None = None,
) -> dict[str, Any]:
    if not crg_available():
        return _unavailable()
    logger.debug(
        "semantic_search(query=%s, kind=%s, limit=%s, repo_root=%s)",
        query,
        kind,
        limit,
        repo_root,
    )
    try:
        from code_review_graph.tools.query import semantic_search_nodes

        root = _validated_repo_root(repo_root)
        result = semantic_search_nodes(
            query=query,
            kind=kind,
            limit=limit,
            repo_root=str(root) if root else None,
        )
        logger.debug("semantic_search result: %s", result)
        return {"status": "ok", **result}
    except Exception as e:
        return _error("semantic_search", e)


def get_architecture_overview(repo_root: str | None = None) -> dict[str, Any]:
    if not crg_available():
        return _unavailable()
    logger.debug("get_architecture_overview(repo_root=%s)", repo_root)
    try:
        from code_review_graph.tools.community_tools import get_architecture_overview_func

        root = _validated_repo_root(repo_root)
        result = get_architecture_overview_func(
            repo_root=str(root) if root else None,
        )
        logger.debug("get_architecture_overview result: %s", result)
        return {"status": "ok", **result}
    except Exception as e:
        return _error("get_architecture_overview", e)


def list_flows(
    repo_root: str | None = None,
    sort_by: str = "criticality",
    limit: int = 50,
) -> dict[str, Any]:
    if not crg_available():
        return _unavailable()
    logger.debug("list_flows(repo_root=%s, sort_by=%s, limit=%s)", repo_root, sort_by, limit)
    try:
        from code_review_graph.tools.flows_tools import list_flows as _fn

        root = _validated_repo_root(repo_root)
        result = _fn(
            repo_root=str(root) if root else None,
            sort_by=sort_by,
            limit=limit,
        )
        logger.debug("list_flows result: %s", result)
        return {"status": "ok", **result}
    except Exception as e:
        return _error("list_flows", e)


def get_affected_flows(
    changed_files: list[str] | None = None,
    repo_root: str | None = None,
    base: str = "HEAD~1",
) -> dict[str, Any]:
    if not crg_available():
        return _unavailable()
    logger.debug(
        "get_affected_flows(changed_files=%s, repo_root=%s, base=%s)",
        changed_files,
        repo_root,
        base,
    )
    try:
        from code_review_graph.tools.review import get_affected_flows_func

        root = _validated_repo_root(repo_root)
        result = get_affected_flows_func(
            changed_files=changed_files,
            base=base,
            repo_root=str(root) if root else None,
        )
        logger.debug("get_affected_flows result: %s", result)
        return {"status": "ok", **result}
    except Exception as e:
        return _error("get_affected_flows", e)


def list_communities(repo_root: str | None = None) -> dict[str, Any]:
    if not crg_available():
        return _unavailable()
    logger.debug("list_communities(repo_root=%s)", repo_root)
    try:
        from code_review_graph.tools.community_tools import list_communities_func

        root = _validated_repo_root(repo_root)
        result = list_communities_func(
            repo_root=str(root) if root else None,
        )
        logger.debug("list_communities result: %s", result)
        return {"status": "ok", **result}
    except Exception as e:
        return _error("list_communities", e)


def find_large_functions(
    repo_root: str | None = None,
    min_lines: int = 50,
    limit: int = 50,
) -> dict[str, Any]:
    if not crg_available():
        return _unavailable()
    logger.debug(
        "find_large_functions(repo_root=%s, min_lines=%s, limit=%s)",
        repo_root,
        min_lines,
        limit,
    )
    try:
        from code_review_graph.tools.query import find_large_functions as _fn

        root = _validated_repo_root(repo_root)
        result = _fn(
            min_lines=min_lines,
            limit=limit,
            repo_root=str(root) if root else None,
        )
        logger.debug("find_large_functions result: %s", result)
        return {"status": "ok", **result}
    except Exception as e:
        return _error("find_large_functions", e)


def refactor_preview(
    mode: str = "rename",
    old_name: str | None = None,
    new_name: str | None = None,
    repo_root: str | None = None,
) -> dict[str, Any]:
    if not crg_available():
        return _unavailable()
    logger.debug(
        "refactor_preview(mode=%s, old_name=%s, new_name=%s, repo_root=%s)",
        mode,
        old_name,
        new_name,
        repo_root,
    )
    try:
        from code_review_graph.tools.refactor_tools import refactor_func

        root = _validated_repo_root(repo_root)
        result = refactor_func(
            mode=mode,
            old_name=old_name,
            new_name=new_name,
            repo_root=str(root) if root else None,
        )
        logger.debug("refactor_preview result: %s", result)
        return {"status": "ok", **result}
    except Exception as e:
        return _error("refactor_preview", e)


def apply_refactor(refactor_id: str, repo_root: str | None = None) -> dict[str, Any]:
    if not crg_available():
        return _unavailable()
    logger.debug("apply_refactor(refactor_id=%s, repo_root=%s)", refactor_id, repo_root)
    try:
        from code_review_graph.tools.refactor_tools import apply_refactor_func

        root = _validated_repo_root(repo_root)
        result = apply_refactor_func(
            refactor_id=refactor_id,
            repo_root=str(root) if root else None,
        )
        logger.debug("apply_refactor result: %s", result)
        return {"status": "ok", **result}
    except Exception as e:
        return _error("apply_refactor", e)


def generate_wiki(repo_root: str | None = None, force: bool = False) -> dict[str, Any]:
    if not crg_available():
        return _unavailable()
    logger.debug("generate_wiki(repo_root=%s, force=%s)", repo_root, force)
    try:
        from code_review_graph.tools.docs import generate_wiki_func

        root = _validated_repo_root(repo_root)
        result = generate_wiki_func(
            repo_root=str(root) if root else None,
            force=force,
        )
        logger.debug("generate_wiki result: %s", result)
        return {"status": "ok", **result}
    except Exception as e:
        return _error("generate_wiki", e)


def get_review_context(
    changed_files: list[str] | None = None,
    repo_root: str | None = None,
    base: str = "HEAD~1",
    max_depth: int = 2,
    include_source: bool = True,
    detail_level: str = "standard",
) -> dict[str, Any]:
    if not crg_available():
        return _unavailable()
    logger.debug(
        "get_review_context(changed_files=%s, repo_root=%s, base=%s, max_depth=%s, include_source=%s, detail_level=%s)",
        changed_files,
        repo_root,
        base,
        max_depth,
        include_source,
        detail_level,
    )
    try:
        from code_review_graph.tools.review import get_review_context as _fn

        root = _validated_repo_root(repo_root)
        result = _fn(
            changed_files=changed_files,
            max_depth=max_depth,
            include_source=include_source,
            repo_root=str(root) if root else None,
            base=base,
            detail_level=detail_level,
        )
        logger.debug("get_review_context result: %s", result)
        return {"status": "ok", **result}
    except Exception as e:
        return _error("get_review_context", e)


def cross_repo_search(
    query: str,
    kind: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    if not crg_available():
        return _unavailable()
    logger.debug("cross_repo_search(query=%s, kind=%s, limit=%s)", query, kind, limit)
    try:
        from code_review_graph.tools.registry_tools import cross_repo_search_func

        result = cross_repo_search_func(query=query, kind=kind, limit=limit)
        logger.debug("cross_repo_search result: %s", result)
        return {"status": "ok", **result}
    except Exception as e:
        return _error("cross_repo_search", e)


def list_graph_stats(repo_root: str | None = None) -> dict[str, Any]:
    if not crg_available():
        return _unavailable()
    logger.debug("list_graph_stats(repo_root=%s)", repo_root)
    try:
        root = _validated_repo_root(repo_root)
        try:
            from code_review_graph.tools.build import list_graph_stats as _fn

            result = _fn(
                repo_root=str(root) if root else None,
            )
        except ImportError:
            # Compatibility fallback for versions that do not expose list_graph_stats.
            from code_review_graph.tools.build import build_or_update_graph

            result = build_or_update_graph(
                full_rebuild=False,
                repo_root=str(root) if root else None,
                postprocess="none",
            )
            if isinstance(result, dict):
                result = {
                    **result,
                    "note": "Graph stats derived via incremental compatibility fallback.",
                }
        logger.debug("list_graph_stats result: %s", result)
        return {"status": "ok", **result}
    except Exception as e:
        return _error("list_graph_stats", e)


def start_mcp_server(repo_root: str | None = None) -> subprocess.Popen[Any] | dict[str, Any]:
    """Start code-review-graph as a detached stdio MCP child process.

    Returns the Popen handle. The caller is responsible for terminating it.
    This is for use when KODO wants to connect to CRG as an MCP server
    via its existing mcp/stdio_client.py infrastructure.
    """
    if not crg_available():
        return _unavailable()
    logger.debug("start_mcp_server(repo_root=%s)", repo_root)
    try:
        root = _validated_repo_root(repo_root)
        cmd = ["code-review-graph", "serve"]
        if root:
            cmd += ["--repo", str(root)]
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        logger.debug("start_mcp_server started pid=%s", proc.pid)
        return proc
    except Exception as e:
        return _error("start_mcp_server", e)
