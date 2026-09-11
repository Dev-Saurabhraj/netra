from typing import Any, Optional
from fastapi import HTTPException, status


class NetraException(Exception):
    """Base exception class for NETRA platform."""
    def __init__(self, code: str, message: str, details: Optional[Any] = None):
        self.code = code
        self.message = message
        self.details = details
        super().__init__(message)


class EntityNotFoundException(NetraException):
    def __init__(self, entity_name: str, identifier: Any):
        super().__init__(
            code=f"{entity_name.upper()}_NOT_FOUND",
            message=f"{entity_name} with identifier '{identifier}' was not found."
        )


class AuthenticationException(NetraException):
    def __init__(self, message: str = "Invalid authentication credentials"):
        super().__init__(
            code="AUTHENTICATION_FAILED",
            message=message
        )


class AuthorizationException(NetraException):
    def __init__(self, message: str = "Not enough permissions to perform this operation"):
        super().__init__(
            code="PERMISSION_DENIED",
            message=message
        )


class DuplicateEntityException(NetraException):
    def __init__(self, entity_name: str, field: str, value: Any):
        super().__init__(
            code=f"DUPLICATE_{entity_name.upper()}",
            message=f"{entity_name} with {field} '{value}' already exists."
        )


class ProtocolCollectionException(NetraException):
    def __init__(self, collector: str, target: str, error_type: str, message: str):
        super().__init__(
            code=f"COLLECTION_{error_type.upper()}",
            message=f"[{collector}] Failed collecting from {target}: {message}",
            details={"collector": collector, "target": target, "error_type": error_type}
        )

