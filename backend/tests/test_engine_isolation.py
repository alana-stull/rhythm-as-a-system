"""F1 guardrail: the engine is pure, and nothing in the running app uses it yet."""
import ast
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ENGINE = BACKEND / "engine"
ALLOWED_STDLIB = {"__future__", "dataclasses", "datetime", "enum", "math", "typing"}


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text())
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


def test_engine_imports_only_stdlib_and_itself():
    for path in ENGINE.glob("*.py"):
        for name in _imports(path):
            assert name.startswith("backend.engine") or name.split(".")[0] in ALLOWED_STDLIB, f"{path.name} imports {name}"


def test_engine_never_reads_the_clock():
    for path in ENGINE.glob("*.py"):
        src = path.read_text()
        for call in (".now(", ".today(", "time.time(", "utcnow("):
            assert call not in src, f"{path.name} calls {call}"


def test_no_existing_app_module_imports_the_engine():
    app_files = [*BACKEND.glob("*.py"), *(BACKEND / "routers").glob("*.py"), *(BACKEND / "services").glob("*.py")]
    assert app_files
    for path in app_files:
        assert not any(n.startswith("backend.engine") for n in _imports(path)), path.name
