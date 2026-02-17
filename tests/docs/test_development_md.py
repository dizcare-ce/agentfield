"""Tests for docs/DEVELOPMENT.md correctness."""
import re
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent
DEVELOPMENT_MD = REPO_ROOT / "docs" / "DEVELOPMENT.md"
MAKEFILE = REPO_ROOT / "Makefile"


def _read_development_md() -> str:
    return DEVELOPMENT_MD.read_text()


def _read_makefile() -> str:
    return MAKEFILE.read_text()


# ---------------------------------------------------------------------------
# Content assertions
# ---------------------------------------------------------------------------


def test_development_md_no_phantom_database_url():
    """AGENTFIELD_DATABASE_URL must not appear anywhere in DEVELOPMENT.md."""
    content = _read_development_md()
    assert "AGENTFIELD_DATABASE_URL" not in content, (
        "Found phantom env var 'AGENTFIELD_DATABASE_URL' in DEVELOPMENT.md"
    )


def test_development_md_has_postgres_url():
    """AGENTFIELD_POSTGRES_URL must be present in DEVELOPMENT.md."""
    content = _read_development_md()
    assert "AGENTFIELD_POSTGRES_URL" in content, (
        "Missing correct env var 'AGENTFIELD_POSTGRES_URL' in DEVELOPMENT.md"
    )


def test_development_md_has_install_dev_deps_script():
    """install-dev-deps.sh must be referenced in DEVELOPMENT.md."""
    content = _read_development_md()
    assert "install-dev-deps.sh" in content, (
        "Missing bootstrap script 'install-dev-deps.sh' in DEVELOPMENT.md"
    )


def test_development_md_no_wrong_install_script():
    """./scripts/install.sh (without 'dev-deps') must not appear in DEVELOPMENT.md."""
    content = _read_development_md()
    assert "./scripts/install.sh" not in content, (
        "Wrong bootstrap script './scripts/install.sh' found in DEVELOPMENT.md"
    )


def test_development_md_no_releasing_md():
    """RELEASING.md (broken link) must not appear in DEVELOPMENT.md."""
    content = _read_development_md()
    assert "RELEASING.md" not in content, (
        "Found broken link 'RELEASING.md' in DEVELOPMENT.md"
    )


def test_development_md_has_release_md():
    """RELEASE.md must be present in DEVELOPMENT.md."""
    content = _read_development_md()
    assert "RELEASE.md" in content, (
        "Missing correct link 'RELEASE.md' in DEVELOPMENT.md"
    )


# ---------------------------------------------------------------------------
# Makefile target validation
# ---------------------------------------------------------------------------


def test_development_md_make_targets_are_valid():
    """Every 'make <target>' reference in DEVELOPMENT.md must be a valid Makefile target."""
    makefile_content = _read_makefile()
    dev_md_content = _read_development_md()

    # Extract all targets defined in the Makefile (lines like "target:")
    valid_targets = set(
        re.findall(r"^([a-zA-Z][a-zA-Z0-9_-]*):", makefile_content, re.MULTILINE)
    )

    # Extract all 'make <target>' references in DEVELOPMENT.md
    referenced_targets = re.findall(r"make ([a-zA-Z][a-zA-Z0-9_-]*)", dev_md_content)

    missing = [t for t in referenced_targets if t not in valid_targets]
    assert not missing, (
        f"DEVELOPMENT.md references non-existent Makefile targets: {missing}"
    )


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_development_md_has_content():
    """DEVELOPMENT.md must be a non-trivial file with meaningful content."""
    content = _read_development_md()
    assert len(content) > 100, "DEVELOPMENT.md appears to be nearly empty"
    assert "#" in content, "DEVELOPMENT.md should contain Markdown headings"
