# pyright: reportUnknownMemberType=false

from alfred_agent.graph import graph
from alfred_agent.memory import MemoryContext


def test_orchestrator_creates_expected_subagent_tasks() -> None:
    result = graph.invoke(
        {"objective": "Build an agent platform", "tasks": [], "summary": ""},
        context=MemoryContext(user_id="test-user", conversation_id="test-conversation"),
    )

    assert result["summary"] == "Subagent task plan is ready for execution."
    assert [task["role"] for task in result["tasks"]] == [
        "planner",
        "coder",
        "tester",
        "reviewer",
        "clean_code",
    ]
    assert all(task["status"] == "ready" for task in result["tasks"])
