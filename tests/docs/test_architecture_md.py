"""Tests for docs/ARCHITECTURE.md correctness.

Validates that phantom directory references have been removed and that
the file accurately reflects the real project structure.
"""

import pathlib

import pytest

ARCH_MD = pathlib.Path(__file__).parents[2] / "docs" / "ARCHITECTURE.md"

PHANTOM_DIRS = [
    "internal/repositories",
    "internal/workflows",
    "pkg/db",
    "proto/",
]

REAL_TOP_LEVEL_DIRS = [
    "control-plane",
    "sdk",
    "examples",
    "docs",
    "deployments",
]


@pytest.fixture(scope="module")
def content() -> str:
    return ARCH_MD.read_text(encoding="utf-8")


def test_file_is_non_trivial(content: str) -> None:
    """File must be longer than 100 characters and contain at least one heading."""
    assert len(content) > 100, "ARCHITECTURE.md is unexpectedly short"
    assert "#" in content, "ARCHITECTURE.md contains no Markdown headings"


@pytest.mark.parametrize("phantom", PHANTOM_DIRS)
def test_phantom_directory_absent(content: str, phantom: str) -> None:
    """None of the phantom directory strings should appear in the file."""
    assert phantom not in content, (
        f"Phantom directory reference {phantom!r} found in ARCHITECTURE.md"
    )


@pytest.mark.parametrize("real_dir", REAL_TOP_LEVEL_DIRS)
def test_real_top_level_directory_present(content: str, real_dir: str) -> None:
    """All five real top-level directories must be mentioned."""
    assert real_dir in content, (
        f"Real top-level directory {real_dir!r} not found in ARCHITECTURE.md"
    )


def test_internal_storage_present(content: str) -> None:
    """internal/storage must be documented (replaces phantom pkg/db)."""
    assert "internal/storage" in content, (
        "'internal/storage' not found in ARCHITECTURE.md"
    )


def test_internal_handlers_present(content: str) -> None:
    """internal/handlers must be documented."""
    assert "internal/handlers" in content, (
        "'internal/handlers' not found in ARCHITECTURE.md"
    )


def test_pkg_db_absent(content: str) -> None:
    """pkg/db is a phantom directory and must not appear."""
    assert "pkg/db" not in content, "'pkg/db' phantom reference found in ARCHITECTURE.md"


def test_proto_trailing_slash_absent(content: str) -> None:
    """'proto/' (with trailing slash) must NOT appear anywhere.

    Per architecture §2.6.1, the proto directory lives under control-plane and
    must not be referenced as a standalone top-level 'proto/' entry.
    """
    assert "proto/" not in content, (
        "Bare 'proto/' (with trailing slash) found in ARCHITECTURE.md. "
        "Use 'control-plane/proto' (no trailing slash) if a reference is needed."
    )


def test_control_plane_proto_allowed(content: str) -> None:
    """Edge case: 'control-plane/proto' (no trailing slash) is acceptable.

    This test does not assert its presence, only that the substring distinction
    is meaningful — the absence of 'proto/' does not preclude 'control-plane/proto'.
    """
    # Confirm 'proto/' is absent (covered above) while 'control-plane/proto' could exist
    assert "proto/" not in content, (
        "'proto/' must not appear; use 'control-plane/proto' if a reference is needed"
    )


def test_python_sdk_not_described_as_thin_client(content: str) -> None:
    """The Python SDK must not be described as a 'thin client'."""
    assert "thin client" not in content, (
        "Python SDK description still says 'thin client'; "
        "it should describe a FastAPI-based agent framework"
    )


def test_python_sdk_described_as_agent_framework(content: str) -> None:
    """The Python SDK must be described as a FastAPI-based agent framework."""
    assert "FastAPI" in content or "agent framework" in content or "reasoner" in content.lower(), (
        "Python SDK not described as a FastAPI-based agent framework "
        "(expected 'FastAPI', 'agent framework', or 'reasoner')"
    )
