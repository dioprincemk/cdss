"""
utils/audit.py
---------------
Helper to write audit log entries. Called from routes and services.
Every clinically significant action must be logged.
"""
from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from database.models.models import AuditLog


async def log_action(
    db: AsyncSession,
    user_id: Optional[UUID],
    action: str,
    resource: Optional[str] = None,
    resource_id: Optional[UUID] = None,
    request: Optional[Request] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Persist an audit log entry. Never raises — failures are silently ignored
    to avoid disrupting clinical workflows.
    """
    try:
        ip = None
        ua = None
        if request:
            forwarded = request.headers.get("X-Forwarded-For")
            ip = forwarded.split(",")[0].strip() if forwarded else str(request.client.host)
            ua = request.headers.get("User-Agent")

        entry = AuditLog(
            user_id=user_id,
            action=action,
            resource=resource,
            resource_id=resource_id,
            ip_address=ip,
            user_agent=ua,
            details=details,
        )
        db.add(entry)
        await db.flush()
    except Exception:
        pass  # Audit failures must never interrupt clinical operations
