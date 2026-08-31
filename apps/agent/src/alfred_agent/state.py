from typing import Literal, NotRequired, TypedDict

from alfred_agent.memory import MemoryRecord

AgentRole = Literal["planner", "coder", "tester", "reviewer", "clean_code"]


class AgentTask(TypedDict):
    id: str
    role: AgentRole
    objective: str
    status: Literal["pending", "ready"]


class OrchestratorState(TypedDict):
    objective: str
    tasks: list[AgentTask]
    summary: str
    memory_context: NotRequired[list[MemoryRecord]]
    memory_written: NotRequired[bool]


class OrchestratorOutput(TypedDict):
    objective: str
    tasks: list[AgentTask]
    summary: str
    memory_written: NotRequired[bool]
