"""
Tests to verify README.md accuracy.

Functional tests that read README.md and assert correct content:
- Python badge version is 3.8+ (not 3.9+)
- No fabricated AsyncConfig fields (webhook_url, timeout_hours)
- Required content present (from agentfield import Agent, NodeID, context.Context, /api/v1/execute/)
- File is well-formed
"""

import ast
from pathlib import Path

import pytest

# Resolve repo root relative to this test file:
# tests/docs/test_readme_accuracy.py → ../../ → repo root
_REPO_ROOT = Path(__file__).parent.parent.parent
README_PATH = _REPO_ROOT / "README.md"
ASYNC_CONFIG_PATH = (
    _REPO_ROOT / "sdk" / "python" / "agentfield" / "async_config.py"
)


@pytest.fixture(scope="module")
def readme_content():
    """Read README.md once for all tests."""
    return README_PATH.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def async_config_fields():
    """Parse async_config.py and return the set of real field names."""
    source = ASYNC_CONFIG_PATH.read_text(encoding="utf-8")
    tree = ast.parse(source)
    fields = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "AsyncConfig":
            for item in node.body:
                # Collect annotated assignments (dataclass fields)
                if isinstance(item, ast.AnnAssign) and isinstance(
                    item.target, ast.Name
                ):
                    fields.add(item.target.id)
    return fields


# --- AC-1: python-3.8+ present ---
def test_python_badge_version_is_3_8_plus(readme_content):
    """README must show python-3.8+ badge, not 3.9+."""
    assert "python-3.8+" in readme_content, (
        "Expected 'python-3.8+' in README.md badge"
    )


# --- AC-2: python-3.9+ absent ---
def test_python_badge_not_3_9_plus(readme_content):
    """README must not contain 'python-3.9+' badge."""
    count = readme_content.count("python-3.9+")
    assert count == 0, f"Found {count} occurrence(s) of 'python-3.9+' in README.md"


# --- AC-3: webhook_url not present ---
def test_no_fabricated_webhook_url(readme_content):
    """README must not contain fabricated field 'webhook_url'."""
    count = readme_content.count("webhook_url")
    assert count == 0, (
        f"Found {count} occurrence(s) of fabricated field 'webhook_url' in README.md"
    )


# --- AC-4: timeout_hours not present ---
def test_no_fabricated_timeout_hours(readme_content):
    """README must not contain fabricated field 'timeout_hours'."""
    count = readme_content.count("timeout_hours")
    assert count == 0, (
        f"Found {count} occurrence(s) of fabricated field 'timeout_hours' in README.md"
    )


# --- AC-5: 'from agentfield import Agent' present ---
def test_from_agentfield_import_agent_present(readme_content):
    """README must contain 'from agentfield import Agent'."""
    assert "from agentfield import Agent" in readme_content, (
        "Expected 'from agentfield import Agent' in README.md"
    )


# --- AC-6: 'NodeID' present ---
def test_node_id_present(readme_content):
    """README must contain 'NodeID' (Go SDK example)."""
    assert "NodeID" in readme_content, "Expected 'NodeID' in README.md"


# --- AC-7: 'context.Context' or 'ctx context' present ---
def test_context_present(readme_content):
    """README must contain Go context usage."""
    assert "context.Context" in readme_content or "ctx context" in readme_content, (
        "Expected 'context.Context' or 'ctx context' in README.md"
    )


# --- AC-8: '/api/v1/execute/' present ---
def test_api_execute_endpoint_present(readme_content):
    """README must contain '/api/v1/execute/' endpoint reference."""
    assert "/api/v1/execute/" in readme_content, (
        "Expected '/api/v1/execute/' in README.md"
    )


# --- AC-9 (edge case): file length > 100 and '#' in content ---
def test_readme_is_well_formed(readme_content):
    """README must be a non-trivial markdown file."""
    assert len(readme_content) > 100, "README.md is too short (< 100 chars)"
    assert "#" in readme_content, "README.md contains no markdown headings"


# --- AC-15: No fabricated field names from async_config.py appear wrongly ---
def test_async_config_fields_are_real(readme_content, async_config_fields):
    """
    Fields used in AsyncConfig examples in README must all be real fields
    defined in async_config.py (not fabricated ones).
    """
    # Known fabricated fields that must NOT appear
    fabricated_fields = {"webhook_url", "timeout_hours"}
    for field in fabricated_fields:
        assert field not in async_config_fields, (
            f"'{field}' should not be in AsyncConfig class (it's fabricated)"
        )
        assert field not in readme_content, (
            f"Fabricated field '{field}' found in README.md"
        )
