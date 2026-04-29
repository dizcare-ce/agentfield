"""Connector framework for agents calling external APIs via the control plane."""

import asyncio
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from agentfield._connector_errors import (
    ConnectorAuthError,
    ConnectorNotFoundError,
    ConnectorTimeoutError,
    ConnectorUpstreamError,
    ConnectorValidationError,
    OperationNotFoundError,
)
from agentfield.client import AgentFieldClient
from agentfield.execution_context import ExecutionContext


@dataclass(frozen=True)
class ConnectorResult:
    """Result from a successful connector invocation.
    
    Attributes:
        data: The response payload from the upstream API.
        invocation_id: Unique identifier for this invocation (for audit trail).
        duration_ms: How long the invocation took (milliseconds).
        http_status: HTTP status code from the upstream API (e.g., 200).
    """
    data: Any
    invocation_id: str
    duration_ms: int
    http_status: int


@dataclass(frozen=True)
class OperationInfo:
    """Metadata for a single operation on a connector.
    
    Attributes:
        name: Operation name (e.g., "chat_post_message").
        method: HTTP method (GET, POST, PUT, DELETE, PATCH).
        inputs: JSON schema for required/optional inputs.
        output: JSON schema for output.
        tags: List of tags (e.g., ["messaging", "async"]).
    """
    name: str
    method: str
    inputs: Dict[str, Any]
    output: Dict[str, Any]
    tags: List[str]


@dataclass(frozen=True)
class ConnectorInfo:
    """Metadata for a connector in the registry.
    
    Attributes:
        name: Connector name (e.g., "slack").
        display: Human-readable display name.
        category: Category (e.g., "messaging").
        brand_color: Brand color (hex).
        icon_url: URL to brand icon.
        op_count: Number of operations.
        has_inbound: Whether connector supports inbound webhooks.
    """
    name: str
    display: str
    category: str
    brand_color: str
    icon_url: str
    op_count: int
    has_inbound: bool


@dataclass(frozen=True)
class ConnectorDetail:
    """Full details for a connector including all operations.
    
    Attributes:
        name: Connector name.
        display: Human-readable display name.
        auth: Auth configuration (structure depends on connector).
        operations: List of OperationInfo for each operation.
    """
    name: str
    display: str
    auth: Dict[str, Any]
    operations: List[OperationInfo]


class Connector:
    """Facade for calling connectors via the control plane.
    
    Usage:
        result = await app.connector.call(
            "slack",
            "chat_post_message",
            inputs={"channel": "C123", "text": "hi"},
        )
        print(result.data["ts"])  # Message timestamp
    
    The connector facade auto-injects run_id from ExecutionContext
    so the auditor can correlate invocations with the calling run.
    """
    
    # Cache for catalog and detail (60s TTL)
    _catalog_cache: Optional[List[ConnectorInfo]] = None
    _catalog_cache_time: float = 0.0
    _detail_cache: Dict[str, tuple[ConnectorDetail, float]] = {}
    _CACHE_TTL_SECONDS: int = 60
    
    def __init__(
        self,
        client: AgentFieldClient,
        execution_context: Optional[ExecutionContext] = None,
    ) -> None:
        """Initialize the Connector facade.
        
        Args:
            client: AgentFieldClient for making HTTP requests to the control plane.
            execution_context: ExecutionContext to extract run_id for audit correlation.
        """
        self._client = client
        self._execution_context = execution_context
    
    async def call(
        self,
        connector_name: str,
        operation_name: str,
        inputs: Optional[Dict[str, Any]] = None,
        run_id: Optional[str] = None,
    ) -> ConnectorResult:
        """Invoke a connector operation on the control plane.
        
        Args:
            connector_name: Name of the connector (e.g., "slack").
            operation_name: Name of the operation (e.g., "chat_post_message").
            inputs: Input parameters for the operation.
            run_id: Optional override for run_id (auto-injected from ExecutionContext if not provided).
        
        Returns:
            ConnectorResult with data, invocation_id, duration_ms, and http_status.
        
        Raises:
            ConnectorNotFoundError: Connector not found in registry.
            OperationNotFoundError: Operation not found on connector.
            ConnectorAuthError: Auth failed (401/403 or missing secrets).
            ConnectorValidationError: Input validation failed.
            ConnectorUpstreamError: Upstream API returned 4xx/5xx.
            ConnectorTimeoutError: Request timed out.
        """
        # Auto-inject run_id from ExecutionContext if not explicitly provided
        if run_id is None and self._execution_context:
            run_id = self._execution_context.run_id
        
        # Build request payload
        payload: Dict[str, Any] = {
            "inputs": inputs or {},
        }
        if run_id:
            payload["run_id"] = run_id
        
        # POST to /api/v1/connectors/:name/:op
        url = f"{self._client.api_base}/connectors/{connector_name}/{operation_name}"
        
        try:
            # Use the client's async HTTP client
            client_http = await self._client.get_async_http_client()
            resp = await client_http.post(
                url,
                json=payload,
                timeout=30.0,
                headers=self._get_request_headers(),
            )
        except (TimeoutError, asyncio.TimeoutError) as e:
            raise ConnectorTimeoutError(
                f"Request to connector '{connector_name}' timed out",
                connector_name=connector_name,
            ) from e
        
        # Parse response
        try:
            body = await resp.json()
        except Exception as e:
            raise ConnectorUpstreamError(
                f"Failed to parse response from connector '{connector_name}'",
                http_status=resp.status_code,
                body=resp.text if hasattr(resp, "text") else None,
                connector_name=connector_name,
            ) from e
        
        # Handle error responses
        if resp.status_code == 404:
            # Could be connector not found or operation not found
            # Check detail to distinguish (optimistically assume operation not found)
            error_msg = body.get("error", "Not found")
            if "operation" in error_msg.lower():
                raise OperationNotFoundError(connector_name, operation_name)
            raise ConnectorNotFoundError(connector_name)
        
        if resp.status_code in (401, 403):
            raise ConnectorAuthError(
                body.get("error", f"Auth failed ({resp.status_code})"),
                connector_name=connector_name,
            )
        
        if resp.status_code == 422 or resp.status_code == 400:
            # Validation error
            field_errors = body.get("field_errors", {})
            raise ConnectorValidationError(
                body.get("error", "Validation failed"),
                field_errors=field_errors,
            )
        
        if resp.status_code >= 400:
            raise ConnectorUpstreamError(
                body.get("error", f"Request failed ({resp.status_code})"),
                http_status=resp.status_code,
                body=resp.text if hasattr(resp, "text") else None,
                connector_name=connector_name,
            )
        
        # Parse success response
        result_data = body.get("result", {})
        invocation_id = body.get("invocation_id", "")
        duration_ms = body.get("duration_ms", 0)
        http_status = body.get("http_status", 200)
        
        return ConnectorResult(
            data=result_data,
            invocation_id=invocation_id,
            duration_ms=duration_ms,
            http_status=http_status,
        )
    
    async def list(self) -> List[ConnectorInfo]:
        """List all available connectors.
        
        Returns a cached list (60s TTL) to avoid redundant calls.
        
        Returns:
            List of ConnectorInfo with basic metadata.
        
        Raises:
            ConnectorTimeoutError: Request timed out.
        """
        now = time.time()
        if (
            self._catalog_cache is not None
            and (now - self._catalog_cache_time) < self._CACHE_TTL_SECONDS
        ):
            return self._catalog_cache
        
        url = f"{self._client.api_base}/connectors"
        
        try:
            client_http = await self._client.get_async_http_client()
            resp = await client_http.get(
                url,
                timeout=10.0,
                headers=self._get_request_headers(),
            )
        except (TimeoutError, asyncio.TimeoutError) as e:
            raise ConnectorTimeoutError("Request to list connectors timed out") from e
        
        try:
            body = await resp.json()
        except Exception as e:
            raise ConnectorTimeoutError(
                f"Failed to parse connector list response: {e}"
            ) from e
        
        # Parse connector list
        connectors = []
        for c in body.get("connectors", []):
            connectors.append(
                ConnectorInfo(
                    name=c["name"],
                    display=c.get("display", c["name"]),
                    category=c.get("category", ""),
                    brand_color=c.get("brand_color", ""),
                    icon_url=c.get("icon_url", ""),
                    op_count=c.get("op_count", 0),
                    has_inbound=c.get("has_inbound", False),
                )
            )
        
        # Cache result
        Connector._catalog_cache = connectors
        Connector._catalog_cache_time = now
        
        return connectors
    
    async def describe(self, connector_name: str) -> ConnectorDetail:
        """Get full details for a connector including all operations.
        
        Returns a cached entry (60s TTL) to avoid redundant calls.
        
        Args:
            connector_name: Name of the connector (e.g., "slack").
        
        Returns:
            ConnectorDetail with name, display, auth config, and operations.
        
        Raises:
            ConnectorNotFoundError: Connector not found.
            ConnectorTimeoutError: Request timed out.
        """
        now = time.time()
        if connector_name in self._detail_cache:
            cached_detail, cached_time = self._detail_cache[connector_name]
            if (now - cached_time) < self._CACHE_TTL_SECONDS:
                return cached_detail
        
        url = f"{self._client.api_base}/connectors/{connector_name}"
        
        try:
            client_http = await self._client.get_async_http_client()
            resp = await client_http.get(
                url,
                timeout=10.0,
                headers=self._get_request_headers(),
            )
        except (TimeoutError, asyncio.TimeoutError) as e:
            raise ConnectorTimeoutError(
                f"Request to describe connector '{connector_name}' timed out",
                connector_name=connector_name,
            ) from e
        
        if resp.status_code == 404:
            raise ConnectorNotFoundError(connector_name)
        
        try:
            body = await resp.json()
        except Exception as e:
            raise ConnectorTimeoutError(
                f"Failed to parse connector detail response: {e}"
            ) from e
        
        # Parse operations
        operations = []
        for op in body.get("operations", []):
            operations.append(
                OperationInfo(
                    name=op["name"],
                    method=op.get("method", "POST"),
                    inputs=op.get("inputs", {}),
                    output=op.get("output", {}),
                    tags=op.get("tags", []),
                )
            )
        
        detail = ConnectorDetail(
            name=body["name"],
            display=body.get("display", body["name"]),
            auth=body.get("auth", {}),
            operations=operations,
        )
        
        # Cache result
        self._detail_cache[connector_name] = (detail, now)
        
        return detail
    
    def _get_request_headers(self) -> Dict[str, str]:
        """Get headers to forward from execution context."""
        if not self._execution_context:
            return {}
        return self._execution_context.to_headers()
