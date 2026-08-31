import json
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BANK = ROOT / "docs" / "memory-bank"


def test_repository_memory_bank_is_complete_and_indexed() -> None:
    manifest = json.loads((BANK / "index.json").read_text(encoding="utf-8"))

    assert manifest["version"] == 1
    documents = {entry["role"]: entry["path"] for entry in manifest["documents"]}
    assert set(documents) == {
        "project",
        "architecture",
        "decisions",
        "active_context",
        "progress",
    }

    for relative_path in documents.values():
        document = BANK / relative_path
        assert document.is_file()
        assert document.read_text(encoding="utf-8").startswith("# ")


def test_agent_instructions_load_and_maintain_the_memory_bank() -> None:
    instructions = (ROOT / "AGENTS.md").read_text(encoding="utf-8").lower()

    assert "docs/memory-bank/index.json" in instructions
    assert "read the memory bank before" in instructions
    assert "active-context.md" in instructions
    assert "never store raw chain-of-thought" in instructions


def test_memory_keeper_role_and_skill_are_registered() -> None:
    config = tomllib.loads((ROOT / ".codex" / "config.toml").read_text(encoding="utf-8"))

    assert config["agents"]["memory_keeper"]["config"] == (".codex/agents/memory-keeper.toml")
    assert (ROOT / ".codex" / "agents" / "memory-keeper.toml").is_file()
    assert (ROOT / ".agents" / "skills" / "alfred-memory-bank" / "SKILL.md").is_file()


def test_langgraph_loads_the_root_environment_contract() -> None:
    config = json.loads((ROOT / "apps" / "agent" / "langgraph.json").read_text())

    assert config["env"] == "../../.env"
