"""Tests for the native HITL form builder (agentfield.hitl) and pause() integration."""

from __future__ import annotations

import json
import uuid as _uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from agentfield.hitl import (
    ButtonGroup,
    Checkbox,
    Date,
    Divider,
    Form,
    Heading,
    HiddenWhen,
    Markdown,
    MultiSelect,
    Number,
    Option,
    Radio,
    Select,
    Switch,
    Text,
    Textarea,
)

pytest.importorskip("pytest_httpx", reason="pytest-httpx requires Python >=3.10")

from agentfield.client import AgentFieldClient


# ---------------------------------------------------------------------------
# Option tests
# ---------------------------------------------------------------------------


class TestOption:
    def test_basic(self) -> None:
        o = Option("approve", "Approve")
        assert o.to_dict() == {"value": "approve", "label": "Approve"}

    def test_with_variant(self) -> None:
        o = Option("reject", "Reject", variant="destructive")
        d = o.to_dict()
        assert d == {"value": "reject", "label": "Reject", "variant": "destructive"}

    def test_no_variant_key_when_none(self) -> None:
        o = Option("x", "X")
        assert "variant" not in o.to_dict()


# ---------------------------------------------------------------------------
# HiddenWhen tests
# ---------------------------------------------------------------------------


class TestHiddenWhen:
    def test_equals(self) -> None:
        hw = HiddenWhen(field="decision", equals="approve")
        assert hw.to_dict() == {"field": "decision", "equals": "approve"}

    def test_not_equals(self) -> None:
        hw = HiddenWhen(field="decision", not_equals="approve")
        assert hw.to_dict() == {"field": "decision", "notEquals": "approve"}

    def test_in_serialises_as_in_key(self) -> None:
        hw = HiddenWhen(field="status", in_=["a", "b", "c"])
        d = hw.to_dict()
        assert "in" in d
        assert d["in"] == ["a", "b", "c"]
        assert "in_" not in d

    def test_not_in(self) -> None:
        hw = HiddenWhen(field="status", not_in=["x", "y"])
        d = hw.to_dict()
        assert d == {"field": "status", "notIn": ["x", "y"]}

    def test_empty_conditions_omitted(self) -> None:
        hw = HiddenWhen(field="f", equals="v")
        d = hw.to_dict()
        assert "in" not in d
        assert "notIn" not in d
        assert "notEquals" not in d


# ---------------------------------------------------------------------------
# Individual field type tests
# ---------------------------------------------------------------------------


class TestMarkdown:
    def test_to_dict(self) -> None:
        f = Markdown("### Hello\n```go\nfoo\n```")
        d = f.to_dict()
        assert d["type"] == "markdown"
        assert d["content"] == "### Hello\n```go\nfoo\n```"
        assert "name" not in d


class TestText:
    def test_minimal(self) -> None:
        f = Text("username")
        d = f.to_dict()
        assert d == {"type": "text", "name": "username"}

    def test_all_fields(self) -> None:
        f = Text(
            "username",
            label="Username",
            help="Your login name",
            required=True,
            default="alice",
            disabled=True,
            placeholder="Enter name...",
            max_length=64,
            pattern=r"^[a-z]+$",
            hidden_when=HiddenWhen(field="mode", equals="auto"),
        )
        d = f.to_dict()
        assert d["type"] == "text"
        assert d["name"] == "username"
        assert d["label"] == "Username"
        assert d["help"] == "Your login name"
        assert d["required"] is True
        assert d["default"] == "alice"
        assert d["disabled"] is True
        assert d["placeholder"] == "Enter name..."
        assert d["max_length"] == 64
        assert d["pattern"] == r"^[a-z]+$"
        assert d["hidden_when"] == {"field": "mode", "equals": "auto"}

    def test_false_fields_omitted(self) -> None:
        d = Text("x").to_dict()
        assert "required" not in d
        assert "disabled" not in d


class TestTextarea:
    def test_minimal(self) -> None:
        d = Textarea("notes").to_dict()
        assert d == {"type": "textarea", "name": "notes"}

    def test_with_rows_and_max_length(self) -> None:
        d = Textarea("notes", rows=6, max_length=500).to_dict()
        assert d["rows"] == 6
        assert d["max_length"] == 500

    def test_hidden_when_with_in(self) -> None:
        hw = HiddenWhen(field="decision", in_=["approve"])
        d = Textarea("comments", hidden_when=hw).to_dict()
        assert d["hidden_when"] == {"field": "decision", "in": ["approve"]}


class TestNumber:
    def test_minimal(self) -> None:
        d = Number("count").to_dict()
        assert d == {"type": "number", "name": "count"}

    def test_with_bounds(self) -> None:
        d = Number("score", min=0.0, max=100.0, step=0.5).to_dict()
        assert d["min"] == 0.0
        assert d["max"] == 100.0
        assert d["step"] == 0.5


class TestSelect:
    def test_to_dict(self) -> None:
        opts = [Option("a", "Alpha"), Option("b", "Beta")]
        d = Select("choice", opts, label="Pick one", required=True).to_dict()
        assert d["type"] == "select"
        assert d["name"] == "choice"
        assert d["label"] == "Pick one"
        assert d["required"] is True
        assert len(d["options"]) == 2
        assert d["options"][0] == {"value": "a", "label": "Alpha"}


class TestMultiSelect:
    def test_to_dict(self) -> None:
        opts = [Option("x", "X"), Option("y", "Y")]
        d = MultiSelect("tags", opts, min_items=1, max_items=3).to_dict()
        assert d["type"] == "multiselect"
        assert d["min_items"] == 1
        assert d["max_items"] == 3


class TestRadio:
    def test_to_dict(self) -> None:
        opts = [Option("yes", "Yes"), Option("no", "No")]
        d = Radio("confirm", opts, required=True).to_dict()
        assert d["type"] == "radio"
        assert d["required"] is True
        assert d["options"][0]["value"] == "yes"


class TestCheckbox:
    def test_default_false_omitted(self) -> None:
        d = Checkbox("agree").to_dict()
        assert d == {"type": "checkbox", "name": "agree"}

    def test_default_true_included(self) -> None:
        d = Checkbox("agree", default=True).to_dict()
        assert d["default"] is True


class TestSwitch:
    def test_minimal(self) -> None:
        d = Switch("enabled").to_dict()
        assert d == {"type": "switch", "name": "enabled"}


class TestDate:
    def test_minimal(self) -> None:
        d = Date("due_date").to_dict()
        assert d == {"type": "date", "name": "due_date"}

    def test_with_bounds(self) -> None:
        d = Date("due_date", min_date="2026-01-01", max_date="2026-12-31").to_dict()
        assert d["min_date"] == "2026-01-01"
        assert d["max_date"] == "2026-12-31"


class TestButtonGroup:
    def test_to_dict(self) -> None:
        opts = [
            Option("approve", "Approve", variant="default"),
            Option("reject", "Reject", variant="destructive"),
        ]
        d = ButtonGroup("decision", opts, label="Your call", required=True).to_dict()
        assert d["type"] == "button_group"
        assert d["name"] == "decision"
        assert d["label"] == "Your call"
        assert d["required"] is True
        assert d["options"][0]["variant"] == "default"
        assert d["options"][1]["variant"] == "destructive"


class TestDivider:
    def test_to_dict(self) -> None:
        d = Divider().to_dict()
        assert d == {"type": "divider"}


class TestHeading:
    def test_to_dict(self) -> None:
        d = Heading("Section A").to_dict()
        assert d == {"type": "heading", "text": "Section A"}


# ---------------------------------------------------------------------------
# Form tests
# ---------------------------------------------------------------------------


class TestForm:
    def test_minimal(self) -> None:
        f = Form(title="Simple form", fields=[Text("name")])
        d = f.to_dict()
        assert d["title"] == "Simple form"
        assert len(d["fields"]) == 1
        assert "description" not in d
        assert "tags" not in d
        assert "priority" not in d

    def test_full_schema(self) -> None:
        """Mixed field set matching the design doc example."""
        form = Form(
            title="Review PR #1138",
            description="## Summary\n\nPlease review.",
            tags=["pr-review", "team:platform"],
            priority="normal",
            fields=[
                Markdown("### Diff\n```go\n- old\n+ new\n```"),
                ButtonGroup(
                    "decision",
                    options=[
                        Option("approve", "Approve", variant="default"),
                        Option("request_changes", "Request changes", variant="secondary"),
                        Option("reject", "Reject", variant="destructive"),
                    ],
                    label="Your call",
                    required=True,
                ),
                Textarea(
                    "comments",
                    label="Comments",
                    placeholder="Optional context...",
                    rows=4,
                    hidden_when=HiddenWhen(field="decision", equals="approve"),
                ),
                Checkbox("block_merge", label="Block merge until resolved"),
            ],
            submit_label="Submit review",
        )
        d = form.to_dict()

        assert d["title"] == "Review PR #1138"
        assert d["description"].startswith("## Summary")
        assert d["tags"] == ["pr-review", "team:platform"]
        assert d["priority"] == "normal"
        assert d["submit_label"] == "Submit review"
        assert len(d["fields"]) == 4

        # Check markdown field
        assert d["fields"][0]["type"] == "markdown"

        # Check button_group field
        bg = d["fields"][1]
        assert bg["type"] == "button_group"
        assert bg["required"] is True
        assert bg["options"][2]["variant"] == "destructive"

        # Check textarea with hidden_when
        ta = d["fields"][2]
        assert ta["type"] == "textarea"
        assert ta["hidden_when"] == {"field": "decision", "equals": "approve"}

        # Check checkbox
        cb = d["fields"][3]
        assert cb["type"] == "checkbox"

    def test_cancel_label(self) -> None:
        f = Form(title="T", fields=[], cancel_label="Cancel").to_dict()
        assert f["cancel_label"] == "Cancel"

    def test_empty_tags_omitted(self) -> None:
        f = Form(title="T", fields=[], tags=[]).to_dict()
        assert "tags" not in f

    def test_json_serialisable(self) -> None:
        form = Form(
            title="T",
            fields=[Text("name"), Divider(), Heading("Section")],
        )
        # Must not raise
        json.dumps(form.to_dict())

    def test_hidden_when_in_key_in_json(self) -> None:
        """HiddenWhen.in_ must serialise as 'in' in the JSON dict."""
        hw = HiddenWhen(field="status", in_=["draft", "review"])
        form = Form(title="T", fields=[Textarea("notes", hidden_when=hw)])
        d = form.to_dict()
        hw_dict = d["fields"][0]["hidden_when"]
        assert "in" in hw_dict
        assert hw_dict["in"] == ["draft", "review"]
        assert "in_" not in hw_dict


# ---------------------------------------------------------------------------
# Module import test
# ---------------------------------------------------------------------------


class TestModuleImport:
    def test_from_agentfield_import_hitl(self) -> None:
        import agentfield  # noqa: PLC0415

        assert hasattr(agentfield, "hitl")

    def test_hitl_form_accessible(self) -> None:
        from agentfield.hitl import Form

        assert Form is not None


# ---------------------------------------------------------------------------
# pause() integration tests (mock HTTP client)
# ---------------------------------------------------------------------------

BASE_URL = "http://localhost:8080"
API_BASE = f"{BASE_URL}/api/v1"
NODE_ID = "test-node"
EXECUTION_ID = "exec-123"


@pytest.fixture
def af_client():
    c = AgentFieldClient(base_url=BASE_URL, api_key="test-key")
    c.caller_agent_id = NODE_ID
    return c


class TestRequestApprovalWithSchema:
    async def test_form_schema_included_in_body(self, af_client, httpx_mock) -> None:
        """form_schema, tags, priority should appear in the POST body."""
        url = f"{API_BASE}/agents/{NODE_ID}/executions/{EXECUTION_ID}/request-approval"
        httpx_mock.add_response(
            method="POST",
            url=url,
            json={
                "approval_request_id": "req-abc",
                "approval_request_url": "http://localhost:8080/hitl/req-abc",
            },
        )

        schema = Form(title="T", fields=[Text("x")]).to_dict()
        await af_client.request_approval(
            execution_id=EXECUTION_ID,
            approval_request_id="req-abc",
            form_schema=schema,
            tags=["pr-review"],
            priority="high",
        )

        requests = httpx_mock.get_requests()
        assert len(requests) == 1
        body = json.loads(requests[0].content)
        assert body["form_schema"] == schema
        assert body["tags"] == ["pr-review"]
        assert body["priority"] == "high"

    async def test_none_fields_not_in_body(self, af_client, httpx_mock) -> None:
        """form_schema/tags/priority must be absent when not provided."""
        url = f"{API_BASE}/agents/{NODE_ID}/executions/{EXECUTION_ID}/request-approval"
        httpx_mock.add_response(
            method="POST",
            url=url,
            json={"approval_request_id": "req-x", "approval_request_url": ""},
        )

        await af_client.request_approval(
            execution_id=EXECUTION_ID,
            approval_request_id="req-x",
        )

        body = json.loads(httpx_mock.get_requests()[0].content)
        assert "form_schema" not in body
        assert "tags" not in body
        assert "priority" not in body


class TestPauseWithSchema:
    """Tests for Agent.pause() with the new form_schema kwargs."""

    def _make_agent_with_mocked_client(self):
        """Return an Agent-like object with a mocked client.request_approval."""
        from agentfield.client import AgentFieldClient

        mock_client = AsyncMock(spec=AgentFieldClient)
        from agentfield.client import ApprovalRequestResponse

        mock_client.request_approval.return_value = ApprovalRequestResponse(
            approval_request_id="auto-id",
            approval_request_url="",
        )
        return mock_client

    async def test_pause_without_id_and_without_schema_raises(self) -> None:
        """pause() with no approval_request_id and no form_schema must raise ValueError."""
        from agentfield import Agent

        app = Agent(node_id="test", agentfield_url="http://localhost:8080")
        with pytest.raises(ValueError, match="approval_request_id is required"):
            await app.pause()

    async def test_pause_with_form_schema_auto_generates_uuid(
        self, af_client, httpx_mock
    ) -> None:
        """pause(form_schema=...) without approval_request_id auto-generates a UUID."""
        from agentfield import Agent

        schema = Form(title="T", fields=[Text("x")]).to_dict()

        # Patch _pause_manager and client so we can inspect the generated ID
        app = Agent(node_id="my-node", agentfield_url=BASE_URL)
        app.base_url = BASE_URL

        mock_pause_manager = AsyncMock()
        mock_future: asyncio.Future = asyncio.get_event_loop().create_future()
        from agentfield.client import ApprovalResult

        mock_future.set_result(ApprovalResult(decision="approved", execution_id="exec-1"))
        mock_pause_manager.register.return_value = mock_future

        mock_client = AsyncMock()
        from agentfield.client import ApprovalRequestResponse

        mock_client.request_approval.return_value = ApprovalRequestResponse(
            approval_request_id="auto", approval_request_url=""
        )

        app._pause_manager = mock_pause_manager
        app.client = mock_client

        # Patch execution context
        mock_ctx = MagicMock()
        mock_ctx.execution_id = "exec-1"
        app._get_current_execution_context = MagicMock(return_value=mock_ctx)

        await app.pause(form_schema=schema)

        # Verify request_approval was called
        assert mock_client.request_approval.called
        call_kwargs = mock_client.request_approval.call_args.kwargs
        # The approval_request_id should be a valid UUID
        rid = call_kwargs["approval_request_id"]
        parsed = _uuid.UUID(rid)
        assert str(parsed) == rid

        # form_schema, tags, priority should be passed through
        assert call_kwargs["form_schema"] == schema

    async def test_pause_passes_tags_and_priority(self) -> None:
        """pause(form_schema=..., tags=..., priority=...) passes all three to client."""
        from agentfield import Agent

        schema = Form(title="T", fields=[]).to_dict()

        app = Agent(node_id="my-node", agentfield_url=BASE_URL)
        app.base_url = BASE_URL

        mock_pause_manager = AsyncMock()
        import asyncio

        mock_future: asyncio.Future = asyncio.get_event_loop().create_future()
        from agentfield.client import ApprovalResult

        mock_future.set_result(ApprovalResult(decision="approved", execution_id="e1"))
        mock_pause_manager.register.return_value = mock_future

        mock_client = AsyncMock()
        from agentfield.client import ApprovalRequestResponse

        mock_client.request_approval.return_value = ApprovalRequestResponse(
            approval_request_id="x", approval_request_url=""
        )

        app._pause_manager = mock_pause_manager
        app.client = mock_client

        mock_ctx = MagicMock()
        mock_ctx.execution_id = "e1"
        app._get_current_execution_context = MagicMock(return_value=mock_ctx)

        await app.pause(
            form_schema=schema,
            tags=["pr-review"],
            priority="urgent",
        )

        call_kwargs = mock_client.request_approval.call_args.kwargs
        assert call_kwargs["tags"] == ["pr-review"]
        assert call_kwargs["priority"] == "urgent"


# Import asyncio where needed in the test module
import asyncio  # noqa: E402
