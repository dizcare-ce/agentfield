"""
Smoke-test verification: all 16 PRD acceptance criteria across all fixed docs.

Each test function maps to one PRD AC and is named accordingly.
Run with:  cd /workspaces/agentfield && python -m pytest tests/docs/test_all_ac.py -v
"""

import ast
import re
import subprocess
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_REPO_ROOT = Path(__file__).parents[2]
README = _REPO_ROOT / "README.md"
ARCHITECTURE_MD = _REPO_ROOT / "docs" / "ARCHITECTURE.md"
ENVIRONMENT_VARIABLES_MD = _REPO_ROOT / "docs" / "ENVIRONMENT_VARIABLES.md"
DEVELOPMENT_MD = _REPO_ROOT / "docs" / "DEVELOPMENT.md"
MAKEFILE = _REPO_ROOT / "Makefile"
ASYNC_CONFIG_PY = _REPO_ROOT / "sdk" / "python" / "agentfield" / "async_config.py"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def readme():
    return README.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def architecture():
    return ARCHITECTURE_MD.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def env_vars_doc():
    return ENVIRONMENT_VARIABLES_MD.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def development_md():
    return DEVELOPMENT_MD.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def makefile():
    return MAKEFILE.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def async_config_fields():
    """Parse async_config.py via AST and return the set of real field names."""
    source = ASYNC_CONFIG_PY.read_text(encoding="utf-8")
    tree = ast.parse(source)
    fields = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "AsyncConfig":
            for item in ast.walk(node):
                if isinstance(item, ast.AnnAssign) and isinstance(
                    item.target, ast.Name
                ):
                    fields.add(item.target.id)
    return fields


# ---------------------------------------------------------------------------
# AC-1: python-3.8+ badge present in README
# ---------------------------------------------------------------------------
def test_ac1_python_badge_corrected(readme):
    """README badge must show python-3.8+ (not 3.9+)."""
    assert "python-3.8+" in readme, (
        "Expected 'python-3.8+' badge in README.md but it was not found."
    )


# ---------------------------------------------------------------------------
# AC-2: webhook_url absent from README
# ---------------------------------------------------------------------------
def test_ac2_webhook_url_absent(readme):
    """README must not contain the fabricated field 'webhook_url'."""
    count = readme.count("webhook_url")
    assert count == 0, (
        f"Found {count} occurrence(s) of 'webhook_url' in README.md — "
        "this is a fabricated AsyncConfig field that should not appear."
    )


# ---------------------------------------------------------------------------
# AC-3: timeout_hours absent from README
# ---------------------------------------------------------------------------
def test_ac3_timeout_hours_absent(readme):
    """README must not contain the fabricated field 'timeout_hours'."""
    count = readme.count("timeout_hours")
    assert count == 0, (
        f"Found {count} occurrence(s) of 'timeout_hours' in README.md — "
        "this is a fabricated AsyncConfig field that should not appear."
    )


# ---------------------------------------------------------------------------
# AC-4: No phantom directories referenced in ARCHITECTURE.md
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "phantom",
    [
        "internal/repositories",
        "internal/workflows",
        "pkg/db",
        "proto/",
    ],
)
def test_ac4_no_phantom_dirs_in_architecture(architecture, phantom):
    """ARCHITECTURE.md must not reference phantom (non-existent) directories."""
    assert phantom not in architecture, (
        f"Phantom path '{phantom}' found in docs/ARCHITECTURE.md. "
        "This path does not exist in the actual repository."
    )


# ---------------------------------------------------------------------------
# AC-5: Real top-level directories present in ARCHITECTURE.md
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "real_dir",
    [
        "control-plane",
        "sdk",
        "examples",
        "docs",
        "deployments",
    ],
)
def test_ac5_real_dirs_in_architecture(architecture, real_dir):
    """ARCHITECTURE.md must document all real top-level directories."""
    assert real_dir in architecture, (
        f"Real directory '{real_dir}' not found in docs/ARCHITECTURE.md."
    )


# ---------------------------------------------------------------------------
# AC-6: AGENTFIELD_DATABASE_URL absent from ENVIRONMENT_VARIABLES.md
# ---------------------------------------------------------------------------
def test_ac6_no_phantom_env_var_in_envvars_doc(env_vars_doc):
    """ENVIRONMENT_VARIABLES.md must not reference the old/phantom AGENTFIELD_DATABASE_URL."""
    count = env_vars_doc.count("AGENTFIELD_DATABASE_URL")
    assert count == 0, (
        f"Found {count} occurrence(s) of 'AGENTFIELD_DATABASE_URL' in "
        "docs/ENVIRONMENT_VARIABLES.md — this variable does not exist; "
        "the correct name is AGENTFIELD_POSTGRES_URL."
    )


# ---------------------------------------------------------------------------
# AC-7: AGENTFIELD_POSTGRES_URL present in ENVIRONMENT_VARIABLES.md
# ---------------------------------------------------------------------------
def test_ac7_correct_env_var_in_envvars_doc(env_vars_doc):
    """ENVIRONMENT_VARIABLES.md must document AGENTFIELD_POSTGRES_URL."""
    count = env_vars_doc.count("AGENTFIELD_POSTGRES_URL")
    assert count >= 1, (
        f"Expected at least 1 occurrence of 'AGENTFIELD_POSTGRES_URL' in "
        "docs/ENVIRONMENT_VARIABLES.md but found 0."
    )


# ---------------------------------------------------------------------------
# AC-8: NodeID present in README (Go SDK example)
# ---------------------------------------------------------------------------
def test_ac8_nodejs_id_present(readme):
    """README must contain 'NodeID' as part of Go SDK examples."""
    assert "NodeID" in readme, (
        "Expected 'NodeID' in README.md (Go SDK example) but it was not found."
    )


# ---------------------------------------------------------------------------
# AC-9: Old python-3.9+ badge absent from README
# ---------------------------------------------------------------------------
def test_ac9_old_badge_absent(readme):
    """README must not contain the old/incorrect 'python-3.9+' badge."""
    count = readme.count("python-3.9+")
    assert count == 0, (
        f"Found {count} occurrence(s) of 'python-3.9+' in README.md. "
        "The correct badge should be 'python-3.8+'."
    )


# ---------------------------------------------------------------------------
# AC-10: No source file changes (git diff must be empty for .go/.py/.ts)
# ---------------------------------------------------------------------------
def test_ac10_no_source_file_changes():
    """
    No .go, .py, or .ts source files should have been modified.
    Only documentation files should have been changed.
    """
    result = subprocess.run(
        ["git", "diff", "--name-only", "HEAD", "--", "*.go", "*.py", "*.ts"],
        capture_output=True,
        text=True,
        cwd=str(_REPO_ROOT),
    )
    assert result.returncode == 0, (
        f"git diff command failed: {result.stderr}"
    )
    modified_files = result.stdout.strip()
    assert modified_files == "", (
        f"Source files were unexpectedly modified:\n{modified_files}\n"
        "Only documentation files should have been changed."
    )


# ---------------------------------------------------------------------------
# AC-11: REST endpoint /api/v1/execute/ present in README
# ---------------------------------------------------------------------------
def test_ac11_rest_endpoint_present(readme):
    """README must contain the '/api/v1/execute/' REST endpoint reference."""
    assert "/api/v1/execute/" in readme, (
        "Expected '/api/v1/execute/' in README.md but it was not found."
    )


# ---------------------------------------------------------------------------
# AC-12: AsyncConfig field names verified via AST; fabricated names absent from README
# ---------------------------------------------------------------------------
def test_ac12_asyncconfig_fields_verified_via_ast(async_config_fields, readme):
    """
    Parse AsyncConfig fields from async_config.py using AST.
    Fabricated field names ('webhook_url', 'timeout_hours') must:
    1. Not exist in the AsyncConfig class definition.
    2. Not appear in README.md.
    """
    fabricated = ["webhook_url", "timeout_hours"]

    # Verify the fabricated fields are not real AsyncConfig fields
    bad_in_class = [f for f in fabricated if f in async_config_fields]
    assert not bad_in_class, (
        f"Fabricated field(s) {bad_in_class} should not be in AsyncConfig class "
        f"(they were invented and don't exist in the actual implementation)."
    )

    # Verify fabricated fields don't appear in README
    bad_in_readme = [f for f in fabricated if f in readme]
    assert not bad_in_readme, (
        f"Fabricated field(s) {bad_in_readme} found in README.md. "
        "These AsyncConfig fields do not exist."
    )


# ---------------------------------------------------------------------------
# AC-13: Python import pattern present in README
# ---------------------------------------------------------------------------
def test_ac13_python_import_present(readme):
    """README must contain 'from agentfield import Agent'."""
    assert "from agentfield import Agent" in readme, (
        "Expected 'from agentfield import Agent' in README.md but it was not found."
    )


# ---------------------------------------------------------------------------
# AC-14: Go context.Context present in README
# ---------------------------------------------------------------------------
def test_ac14_go_context_present(readme):
    """README must contain Go context usage ('context.Context' or 'ctx context')."""
    assert "context.Context" in readme or "ctx context" in readme, (
        "Expected 'context.Context' or 'ctx context' in README.md (Go SDK example) "
        "but neither was found."
    )


# ---------------------------------------------------------------------------
# AC-15: All 'make <target>' references in DEVELOPMENT.md are valid Makefile targets
# ---------------------------------------------------------------------------
def test_ac15_development_md_make_targets_valid(development_md, makefile):
    """
    Every 'make <target>' reference in DEVELOPMENT.md must correspond to a
    real target defined in the Makefile.
    """
    # Extract valid Makefile targets
    makefile_targets = set(
        re.findall(r"^([a-zA-Z][a-zA-Z0-9_-]*):", makefile, re.MULTILINE)
    )

    # Extract make target references from DEVELOPMENT.md
    referenced_targets = re.findall(
        r"make ([a-zA-Z][a-zA-Z0-9_-]*)", development_md
    )

    missing = [t for t in referenced_targets if t not in makefile_targets]
    assert not missing, (
        f"DEVELOPMENT.md references 'make' target(s) that don't exist in Makefile: "
        f"{missing}. Valid targets are: {sorted(makefile_targets)}"
    )


# ---------------------------------------------------------------------------
# AC-16: All key docs are valid (non-trivial) markdown files
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "doc_path",
    [
        README,
        ARCHITECTURE_MD,
        ENVIRONMENT_VARIABLES_MD,
    ],
)
def test_ac16_all_docs_valid_markdown(doc_path):
    """
    Each key documentation file must:
    - Exist and be readable
    - Contain more than 100 characters
    - Contain at least one markdown heading (# character)
    """
    content = doc_path.read_text(encoding="utf-8")
    assert len(content) > 100, (
        f"{doc_path.name} is too short ({len(content)} chars). "
        "Expected a substantive markdown file with more than 100 characters."
    )
    assert "#" in content, (
        f"{doc_path.name} contains no markdown headings ('#'). "
        "Expected valid markdown with at least one heading."
    )
