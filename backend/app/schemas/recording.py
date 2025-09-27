# ===== app/schemas/recording.py =====
"""
Pydantic schemas for recording endpoints
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class RecordingBase(BaseModel):
    session_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    page_title: Optional[str] = None

class RecordingCreate(RecordingBase):
    browser_info: Optional[Dict[str, Any]] = None

class RecordingResponse(RecordingBase):
    id: int
    status: str
    video_filename: Optional[str] = None
    video_size: Optional[int] = None
    video_duration: Optional[float] = None
    click_count: int = 0
    screenshot_count: int = 0
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
