"""Tests for the connector facade framework."""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock
from agentfield import (
    Agent,
    ConnectorResult,
    ConnectorInfo,
    ConnectorDetail,
    OperationInfo,
)
from agentfield._connector_errors import (
    ConnectorNotFoundError,
    OperationNotFoundError,
    ConnectorAuthError,
    ConnectorValidationError,
    ConnectorUpstreamError,
    ConnectorTimeoutError,
)
from agentfield.connector import Connector
from agentfield.execution_context import ExecutionContext


@pytest.fixture
def agent():
    """Create a test agent."""
    return Agent(node_id="test-agent", agentfield_server="http://localhost:8080")


@pytest.fixture
def execution_context(agent):
    """Create a test execution context."""
    return ExecutionContext(
        run_id="run-123",
        execution_id="exec-456",
        agent_instance=agent,
        reasoner_name="test_reasoner",
    )


@pytest.fixture
def connector(agent, execution_context):
    """Create a connector facade with test setup."""
    conn = Connector(agent.client, execution_context)
    return conn


def make_response(status_code, json_data):
    """Helper to create a mock response with proper async json() method."""
    response = MagicMock()
    response.status_code = status_code
    response.text = json.dumps(json_data)
    response.json = AsyncMock(return_value=json_data)
    return response


class TestConnectorCall:
    """Tests for connector.call() method."""
    
    @pytest.mark.asyncio
    async def test_call_success(self, connector, agent):
        """Happy path: successful connector invocation returns ConnectorResult."""
        mock_response = make_response(200, {
            "result": {"ts": "1234567890", "ok": True},
            "invocation_id": "inv-123",
            "duration_ms": 100,
            "http_status": 200,
        })
        
        mock_http_client = AsyncMock()
        mock_http_client.post = AsyncMock(return_value=mock_response)
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        result = await connector.call(
            "slack",
            "chat_post_message",
            inputs={"channel": "C123", "text": "hello"},
        )
        
        assert isinstance(result, ConnectorResult)
        assert result.data == {"ts": "1234567890", "ok": True}
        assert result.invocation_id == "inv-123"
        assert result.duration_ms == 100
        assert result.http_status == 200
    
    @pytest.mark.asyncio
    async def test_call_auto_injects_run_id(self, connector, agent, execution_context):
        """run_id is auto-injected from execution context."""
        mock_response = make_response(200, {
            "result": {"ok": True},
            "invocation_id": "inv-123",
            "duration_ms": 50,
            "http_status": 200,
        })
        
        mock_http_client = AsyncMock()
        mock_http_client.post = AsyncMock(return_value=mock_response)
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        result = await connector.call(
            "slack",
            "chat_post_message",
            inputs={"channel": "C123", "text": "hello"},
        )
        
        # Verify that post was called with run_id in payload
        call_args = mock_http_client.post.call_args
        assert call_args is not None
        assert call_args[1]["json"]["run_id"] == "run-123"
        assert result.data["ok"] is True
    
    @pytest.mark.asyncio
    async def test_call_connector_not_found(self, connector, agent):
        """ConnectorNotFoundError on 404."""
        mock_response = make_response(404, {
            "error": "Connector 'nonexistent' not found",
        })
        
        mock_http_client = AsyncMock()
        mock_http_client.post = AsyncMock(return_value=mock_response)
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        with pytest.raises(ConnectorNotFoundError) as exc_info:
            await connector.call("nonexistent", "some_op", inputs={})
        
        assert exc_info.value.connector_name == "nonexistent"
    
    @pytest.mark.asyncio
    async def test_call_operation_not_found(self, connector, agent):
        """OperationNotFoundError on 404 with 'operation' in error message."""
        mock_response = make_response(404, {
            "error": "Operation 'chat_post_message' not found on connector 'slack'",
        })
        
        mock_http_client = AsyncMock()
        mock_http_client.post = AsyncMock(return_value=mock_response)
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        with pytest.raises(OperationNotFoundError) as exc_info:
            await connector.call("slack", "chat_post_message", inputs={})
        
        assert exc_info.value.connector_name == "slack"
        assert exc_info.value.operation_name == "chat_post_message"
    
    @pytest.mark.asyncio
    async def test_call_auth_error_401(self, connector, agent):
        """ConnectorAuthError on 401."""
        mock_response = make_response(401, {
            "error": "Authentication required",
        })
        
        mock_http_client = AsyncMock()
        mock_http_client.post = AsyncMock(return_value=mock_response)
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        with pytest.raises(ConnectorAuthError) as exc_info:
            await connector.call("slack", "chat_post_message", inputs={})
        
        assert exc_info.value.connector_name == "slack"
    
    @pytest.mark.asyncio
    async def test_call_auth_error_403(self, connector, agent):
        """ConnectorAuthError on 403."""
        mock_response = make_response(403, {
            "error": "Forbidden",
        })
        
        mock_http_client = AsyncMock()
        mock_http_client.post = AsyncMock(return_value=mock_response)
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        with pytest.raises(ConnectorAuthError) as exc_info:
            await connector.call("slack", "chat_post_message", inputs={})
        
        assert exc_info.value.connector_name == "slack"
    
    @pytest.mark.asyncio
    async def test_call_validation_error_400(self, connector, agent):
        """ConnectorValidationError on 400 with field errors."""
        mock_response = make_response(400, {
            "error": "Validation failed",
            "field_errors": {
                "channel": "required field",
                "text": "too long",
            },
        })
        
        mock_http_client = AsyncMock()
        mock_http_client.post = AsyncMock(return_value=mock_response)
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        with pytest.raises(ConnectorValidationError) as exc_info:
            await connector.call("slack", "chat_post_message", inputs={})
        
        assert exc_info.value.field_errors == {
            "channel": "required field",
            "text": "too long",
        }
    
    @pytest.mark.asyncio
    async def test_call_validation_error_422(self, connector, agent):
        """ConnectorValidationError on 422."""
        mock_response = make_response(422, {
            "error": "Unprocessable entity",
            "field_errors": {"id": "invalid format"},
        })
        
        mock_http_client = AsyncMock()
        mock_http_client.post = AsyncMock(return_value=mock_response)
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        with pytest.raises(ConnectorValidationError) as exc_info:
            await connector.call("stripe", "create_charge", inputs={})
        
        assert exc_info.value.field_errors == {"id": "invalid format"}
    
    @pytest.mark.asyncio
    async def test_call_upstream_error_500(self, connector, agent):
        """ConnectorUpstreamError on 5xx."""
        error_text = '{"error": "Internal server error"}'
        mock_response = make_response(500, {
            "error": "Internal server error",
        })
        mock_response.text = error_text
        
        mock_http_client = AsyncMock()
        mock_http_client.post = AsyncMock(return_value=mock_response)
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        with pytest.raises(ConnectorUpstreamError) as exc_info:
            await connector.call("slack", "chat_post_message", inputs={})
        
        assert exc_info.value.http_status == 500
        assert exc_info.value.connector_name == "slack"
        assert exc_info.value.body == error_text
    
    @pytest.mark.asyncio
    async def test_call_timeout(self, connector, agent):
        """ConnectorTimeoutError on timeout."""
        mock_http_client = AsyncMock()
        mock_http_client.post = AsyncMock(side_effect=TimeoutError("Connection timed out"))
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        with pytest.raises(ConnectorTimeoutError) as exc_info:
            await connector.call("slack", "chat_post_message", inputs={})
        
        assert exc_info.value.connector_name == "slack"
    
    @pytest.mark.asyncio
    async def test_call_explicit_run_id_override(self, connector, agent):
        """Explicit run_id parameter overrides auto-injection."""
        mock_response = make_response(200, {
            "result": {"ok": True},
            "invocation_id": "inv-123",
            "duration_ms": 50,
            "http_status": 200,
        })
        
        mock_http_client = AsyncMock()
        mock_http_client.post = AsyncMock(return_value=mock_response)
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        result = await connector.call(
            "slack",
            "chat_post_message",
            inputs={"channel": "C123"},
            run_id="custom-run-id",
        )
        
        # Verify explicit run_id was used
        call_args = mock_http_client.post.call_args
        assert call_args[1]["json"]["run_id"] == "custom-run-id"
        assert result.data["ok"] is True


class TestConnectorList:
    """Tests for connector.list() method."""
    
    @pytest.mark.asyncio
    async def test_list_success(self, connector, agent):
        """list() returns cached list of ConnectorInfo."""
        # Clear cache first
        Connector._catalog_cache = None
        
        mock_response = make_response(200, {
            "connectors": [
                {
                    "name": "slack",
                    "display": "Slack",
                    "category": "messaging",
                    "brand_color": "#36C5F0",
                    "icon_url": "https://example.com/slack.png",
                    "op_count": 10,
                    "has_inbound": True,
                },
                {
                    "name": "stripe",
                    "display": "Stripe",
                    "category": "payments",
                    "brand_color": "#0066FF",
                    "icon_url": "https://example.com/stripe.png",
                    "op_count": 15,
                    "has_inbound": False,
                },
            ]
        })
        
        mock_http_client = AsyncMock()
        mock_http_client.get = AsyncMock(return_value=mock_response)
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        result = await connector.list()
        
        assert len(result) == 2
        assert isinstance(result[0], ConnectorInfo)
        assert result[0].name == "slack"
        assert result[0].op_count == 10
        assert result[1].name == "stripe"
    
    @pytest.mark.asyncio
    async def test_list_caching(self, connector, agent):
        """list() caches results for 60 seconds."""
        # Clear cache first
        Connector._catalog_cache = None
        
        mock_response = make_response(200, {
            "connectors": [
                {
                    "name": "slack",
                    "display": "Slack",
                    "category": "messaging",
                    "brand_color": "#36C5F0",
                    "icon_url": "https://example.com/slack.png",
                    "op_count": 10,
                    "has_inbound": True,
                },
            ]
        })
        
        mock_http_client = AsyncMock()
        mock_http_client.get = AsyncMock(return_value=mock_response)
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        # First call
        result1 = await connector.list()
        assert len(result1) == 1
        
        # Second call should hit cache (no additional HTTP call)
        result2 = await connector.list()
        assert result1[0].name == result2[0].name
        assert mock_http_client.get.call_count == 1  # Only called once
    
    @pytest.mark.asyncio
    async def test_list_timeout(self, connector, agent):
        """list() raises ConnectorTimeoutError on timeout."""
        # Clear cache first
        Connector._catalog_cache = None
        
        mock_http_client = AsyncMock()
        mock_http_client.get = AsyncMock(side_effect=TimeoutError("Connection timed out"))
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        with pytest.raises(ConnectorTimeoutError):
            await connector.list()


class TestConnectorDescribe:
    """Tests for connector.describe() method."""
    
    @pytest.mark.asyncio
    async def test_describe_success(self, connector, agent):
        """describe() returns ConnectorDetail with operations."""
        mock_response = make_response(200, {
            "name": "slack",
            "display": "Slack",
            "auth": {
                "type": "oauth",
                "secret_env": "SLACK_BOT_TOKEN",
            },
            "operations": [
                {
                    "name": "chat_post_message",
                    "method": "POST",
                    "inputs": {
                        "channel": {"type": "string", "required": True},
                        "text": {"type": "string", "required": True},
                    },
                    "output": {
                        "ts": {"type": "string"},
                        "ok": {"type": "boolean"},
                    },
                    "tags": ["messaging"],
                },
                {
                    "name": "users_list",
                    "method": "GET",
                    "inputs": {},
                    "output": {
                        "members": {"type": "array"},
                    },
                    "tags": ["users"],
                },
            ],
        })
        
        mock_http_client = AsyncMock()
        mock_http_client.get = AsyncMock(return_value=mock_response)
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        result = await connector.describe("slack")
        
        assert isinstance(result, ConnectorDetail)
        assert result.name == "slack"
        assert result.display == "Slack"
        assert result.auth["type"] == "oauth"
        assert len(result.operations) == 2
        assert isinstance(result.operations[0], OperationInfo)
        assert result.operations[0].name == "chat_post_message"
        assert result.operations[0].method == "POST"
        assert result.operations[0].tags == ["messaging"]
    
    @pytest.mark.asyncio
    async def test_describe_connector_not_found(self, connector, agent):
        """describe() raises ConnectorNotFoundError on 404."""
        mock_response = make_response(404, {})
        
        mock_http_client = AsyncMock()
        mock_http_client.get = AsyncMock(return_value=mock_response)
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        with pytest.raises(ConnectorNotFoundError) as exc_info:
            await connector.describe("nonexistent")
        
        assert exc_info.value.connector_name == "nonexistent"
    
    @pytest.mark.asyncio
    async def test_describe_caching(self, connector, agent):
        """describe() caches results for 60 seconds."""
        # Clear cache first for this connector
        connector._detail_cache.clear()
        
        mock_response = make_response(200, {
            "name": "slack",
            "display": "Slack",
            "auth": {},
            "operations": [],
        })
        
        mock_http_client = AsyncMock()
        mock_http_client.get = AsyncMock(return_value=mock_response)
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        # First call
        result1 = await connector.describe("slack")
        
        # Second call should hit cache
        result2 = await connector.describe("slack")
        
        assert result1.name == result2.name
        assert mock_http_client.get.call_count == 1  # Only called once


class TestConnectorIntegration:
    """Integration tests with Agent."""
    
    def test_agent_has_connector_facade(self, agent):
        """Agent instance has .connector attribute."""
        assert hasattr(agent, "connector")
        assert isinstance(agent.connector, Connector)
    
    @pytest.mark.asyncio
    async def test_connector_uses_execution_context(self, agent):
        """Connector has access to execution context."""
        # Create a context and set it
        ctx = ExecutionContext(
            run_id="run-test",
            execution_id="exec-test",
            agent_instance=agent,
            reasoner_name="test",
        )
        
        # Create connector with context
        connector = Connector(agent.client, ctx)
        
        mock_response = make_response(200, {
            "result": {"ok": True},
            "invocation_id": "inv-123",
            "duration_ms": 50,
            "http_status": 200,
        })
        
        mock_http_client = AsyncMock()
        mock_http_client.post = AsyncMock(return_value=mock_response)
        agent.client.get_async_http_client = AsyncMock(return_value=mock_http_client)
        
        await connector.call("test", "op", inputs={})
        
        # Verify headers were set
        call_args = mock_http_client.post.call_args
        headers = call_args[1].get("headers", {})
        assert headers.get("X-Run-ID") == "run-test"
