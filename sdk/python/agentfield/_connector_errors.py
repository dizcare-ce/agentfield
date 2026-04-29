"""Connector framework exception types."""

from typing import Any, Dict, Optional


class ConnectorError(Exception):
    """Base exception for connector-related errors."""
    pass


class ConnectorNotFoundError(ConnectorError):
    """Raised when a connector is not found in the registry."""
    
    def __init__(self, connector_name: str) -> None:
        self.connector_name = connector_name
        super().__init__(f"Connector '{connector_name}' not found in registry")


class OperationNotFoundError(ConnectorError):
    """Raised when an operation is not found on a connector."""
    
    def __init__(self, connector_name: str, operation_name: str) -> None:
        self.connector_name = connector_name
        self.operation_name = operation_name
        super().__init__(
            f"Operation '{operation_name}' not found on connector '{connector_name}'"
        )


class ConnectorAuthError(ConnectorError):
    """Raised when authentication fails (401/403 or missing secrets)."""
    
    def __init__(self, message: str, connector_name: Optional[str] = None) -> None:
        self.connector_name = connector_name
        super().__init__(message)


class ConnectorValidationError(ConnectorError):
    """Raised when input validation fails."""
    
    def __init__(self, message: str, field_errors: Optional[Dict[str, Any]] = None) -> None:
        self.field_errors = field_errors or {}
        super().__init__(message)


class ConnectorUpstreamError(ConnectorError):
    """Raised when upstream API returns an error (4xx/5xx)."""
    
    def __init__(
        self, 
        message: str, 
        http_status: int, 
        body: Optional[str] = None,
        connector_name: Optional[str] = None
    ) -> None:
        self.http_status = http_status
        self.body = body
        self.connector_name = connector_name
        super().__init__(message)


class ConnectorTimeoutError(ConnectorError):
    """Raised when a connector request times out."""
    
    def __init__(self, message: str, connector_name: Optional[str] = None) -> None:
        self.connector_name = connector_name
        super().__init__(message)
