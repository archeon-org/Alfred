import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_langgraph_loads_only_the_agent_environment_contract() -> None:
    config = json.loads((ROOT / "apps" / "agent" / "langgraph.json").read_text())

    assert config["env"] == ".env"
