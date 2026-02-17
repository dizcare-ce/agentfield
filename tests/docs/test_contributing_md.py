"""Tests for docs/CONTRIBUTING.md correctness."""

import pathlib


CONTRIBUTING_MD = pathlib.Path(__file__).parents[2] / "docs" / "CONTRIBUTING.md"


def test_contributing_md_references():
    content = CONTRIBUTING_MD.read_text()

    assert "install-dev-deps.sh" in content, "Developer bootstrap script must be install-dev-deps.sh"
    assert "./scripts/install.sh" not in content, "End-user binary installer reference must be removed"
    assert len(content) > 100 and "#" in content, "File must be non-trivial markdown"

    # Preserved correct references
    assert "Fork the repository" in content
    assert "make fmt tidy" in content
    assert "test-all.sh" in content
