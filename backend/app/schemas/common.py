# ===== app/schemas/common.py =====
"""
Common schemas used across the API
"""
from pydantic import BaseModel
from typing import Optional

class StatusResponse(BaseModel):
    success: bool
    message: str
    data: Optional[dict] = None

class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
    timestamp: float