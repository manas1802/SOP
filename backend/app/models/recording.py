# ===== app/models/recording.py =====
"""
Recording related database models
"""
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import BaseModel

class Recording(BaseModel):
    __tablename__ = "recordings"
    
    # Basic recording info
    session_id = Column(String(100), unique=True, index=True, nullable=False)
    title = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    
    # File info
    video_path = Column(String(500), nullable=True)
    video_filename = Column(String(200), nullable=True)
    video_size = Column(Integer, nullable=True)  # Size in bytes
    video_duration = Column(Float, nullable=True)  # Duration in seconds
    video_format = Column(String(10), nullable=True)  # webm, mp4, etc.
    
    # Processing status
    status = Column(String(20), default="uploaded", nullable=False)
    # Status values: uploaded, processing, completed, failed, deleted
    
    # Metadata from extension
    url = Column(String(1000), nullable=True)  # Page URL where recorded
    page_title = Column(String(500), nullable=True)
    browser_info = Column(JSON, nullable=True)  # Browser version, etc.
    
    # Processing results counts
    click_count = Column(Integer, default=0)
    screenshot_count = Column(Integer, default=0)
    transcript_length = Column(Integer, nullable=True)  # Character count
    
    # Error handling
    error_message = Column(Text, nullable=True)
    processing_attempts = Column(Integer, default=0)
    
    # Relationships
    clicks = relationship("ClickData", back_populates="recording", cascade="all, delete-orphan")
    screenshots = relationship("Screenshot", back_populates="recording", cascade="all, delete-orphan")
    transcript = relationship("Transcript", back_populates="recording", uselist=False, cascade="all, delete-orphan")
    sops = relationship("SOP", back_populates="recording", cascade="all, delete-orphan")

class ClickData(BaseModel):
    __tablename__ = "click_data"
    
    recording_id = Column(Integer, ForeignKey("recordings.id"), nullable=False)
    
    # Timing
    timestamp = Column(Float, nullable=False)  # Unix timestamp
    relative_time = Column(Float, nullable=False)  # Relative to recording start (ms)
    
    # Page info
    url = Column(String(1000), nullable=False)
    page_title = Column(String(500), nullable=True)
    
    # Element info (JSON to store complex data from extension)
    element_data = Column(JSON, nullable=False)
    # Contains: tagName, text, selector, bounds, attributes, etc.
    
    # Click coordinates
    click_x = Column(Integer, nullable=True)
    click_y = Column(Integer, nullable=True)
    
    # Viewport info
    viewport_data = Column(JSON, nullable=True)
    
    # Relationship
    recording = relationship("Recording", back_populates="clicks")

class Screenshot(BaseModel):
    __tablename__ = "screenshots"
    
    recording_id = Column(Integer, ForeignKey("recordings.id"), nullable=False)
    
    # Basic info
    description = Column(String(500), nullable=True)
    timestamp = Column(Float, nullable=False)
    relative_time = Column(Float, nullable=False)  # Relative to recording start (ms)
    
    # File info
    image_path = Column(String(500), nullable=True)
    image_filename = Column(String(200), nullable=True)
    image_size = Column(Integer, nullable=True)  # Size in bytes
    image_format = Column(String(10), default="png")
    
    # Image metadata
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    
    # Context (what triggered this screenshot)
    capture_type = Column(String(50), nullable=True)  # click, scroll, navigation, etc.
    page_url = Column(String(1000), nullable=True)
    
    # AI analysis results (populated later)
    ai_description = Column(Text, nullable=True)
    detected_elements = Column(JSON, nullable=True)  # UI elements detected
    extracted_text = Column(Text, nullable=True)  # OCR text
    
    # Relationship
    recording = relationship("Recording", back_populates="screenshots")

class Transcript(BaseModel):
    __tablename__ = "transcripts"
    
    recording_id = Column(Integer, ForeignKey("recordings.id"), nullable=False)
    
    # Full transcript
    full_text = Column(Text, nullable=True)
    language = Column(String(10), default="en")
    confidence_score = Column(Float, nullable=True)
    
    # Whisper metadata
    whisper_model_used = Column(String(20), nullable=True)
    processing_time = Column(Float, nullable=True)  # Seconds taken to process
    
    # Segmented transcript (JSON array of segments with timestamps)
    segments = Column(JSON, nullable=True)
    # Format: [{"start": 0.0, "end": 5.2, "text": "Hello world", "words": [...]}]
    
    # Word-level data for precise timing
    words = Column(JSON, nullable=True)
    # Format: [{"word": "Hello", "start": 0.0, "end": 0.5, "confidence": 0.9}]
    
    # Relationship
    recording = relationship("Recording", back_populates="transcript")