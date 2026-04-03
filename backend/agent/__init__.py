from .permissions import PermissionChecker, PermissionMode, get_permission_checker

__all__ = [
	"AgentLoop",
	"AgentCoordinator",
	"agent_coordinator",
	"PermissionChecker",
	"PermissionMode",
	"get_permission_checker",
]


def __getattr__(name: str):
	if name == "AgentLoop":
		from .loop import AgentLoop

		return AgentLoop
	if name in {"AgentCoordinator", "agent_coordinator"}:
		from .coordinator import AgentCoordinator, agent_coordinator

		return AgentCoordinator if name == "AgentCoordinator" else agent_coordinator
	raise AttributeError(name)
