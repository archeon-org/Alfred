# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false

from dataclasses import replace

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.runtime import Runtime
from langgraph.store.base import BaseStore

from alfred_agent.memory import (
    MemoryContext,
    build_memory_record,
    recall_memories,
    store_memory,
)
from alfred_agent.state import AgentRole, AgentTask, OrchestratorOutput, OrchestratorState


def authenticated_memory_context(
    runtime: Runtime[MemoryContext],
) -> MemoryContext | None:
    """Resolve memory ownership from trusted server metadata when deployed."""
    context = runtime.context
    if not context.memory_enabled:
        return None

    server_info = runtime.server_info
    if server_info is None:
        # Open-source/local execution has no server identity provider. Its caller is
        # trusted and supplies the scope directly (tests and loopback development).
        return context
    if server_info.user is None:
        return None

    execution_info = runtime.execution_info
    thread_id = execution_info.thread_id if execution_info is not None else None
    if thread_id is None:
        return None
    return replace(
        context,
        user_id=server_info.user.identity,
        conversation_id=thread_id,
    )


def recall_memory(state: OrchestratorState, runtime: Runtime[MemoryContext]) -> OrchestratorState:
    context = authenticated_memory_context(runtime)
    records = (
        recall_memories(runtime.store, context)
        if runtime.store is not None and context is not None
        else []
    )
    return {**state, "memory_context": records, "memory_written": False}


def plan_subagents(state: OrchestratorState) -> OrchestratorState:
    objective = state["objective"]
    roles: tuple[tuple[AgentRole, str], ...] = (
        ("planner", "Break the objective into safe implementation phases."),
        ("coder", "Implement the requested changes within the assigned scope."),
        ("tester", "Design and run focused verification for the change."),
        ("reviewer", "Review correctness, security, maintainability and regressions."),
        ("clean_code", "Check naming, boundaries, duplication and long-term readability."),
    )
    tasks: list[AgentTask] = [
        {
            "id": f"task-{index + 1}",
            "role": role,
            "objective": f"{description} Objective: {objective}",
            "status": "pending",
        }
        for index, (role, description) in enumerate(roles)
    ]

    return {
        **state,
        "tasks": tasks,
        "summary": f"Prepared {len(tasks)} subagent tasks for: {objective}",
    }


def mark_ready(state: OrchestratorState) -> OrchestratorState:
    return {
        **state,
        "tasks": [{**task, "status": "ready"} for task in state["tasks"]],
        "summary": "Subagent task plan is ready for execution.",
    }


def record_memory(state: OrchestratorState, runtime: Runtime[MemoryContext]) -> OrchestratorState:
    context = authenticated_memory_context(runtime)
    if runtime.store is None or context is None:
        return {**state, "memory_written": False}

    record = build_memory_record(
        context=context,
        objective=state["objective"],
        outcome=state["summary"],
        steps=[task["role"] for task in state["tasks"]],
    )
    store_memory(runtime.store, context, record)
    return {**state, "memory_written": True}


def build_graph(
    *, store: BaseStore | None = None
) -> CompiledStateGraph[OrchestratorState, MemoryContext, OrchestratorState, OrchestratorOutput]:
    builder = StateGraph(
        OrchestratorState,
        context_schema=MemoryContext,
        output_schema=OrchestratorOutput,
    )
    builder.add_node("recall_memory", recall_memory)
    builder.add_node("plan_subagents", plan_subagents)
    builder.add_node("mark_ready", mark_ready)
    builder.add_node("record_memory", record_memory)
    builder.add_edge(START, "recall_memory")
    builder.add_edge("recall_memory", "plan_subagents")
    builder.add_edge("plan_subagents", "mark_ready")
    builder.add_edge("mark_ready", "record_memory")
    builder.add_edge("record_memory", END)
    return builder.compile(store=store)


# Agent Server injects its durable Store into this compiled graph at runtime.
graph = build_graph()
