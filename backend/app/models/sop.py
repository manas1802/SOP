# ===== app/models/sop.py =====
"""
SOP (Standard Operating Procedure) related models
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, JSON, ForeignKey, Float
from sqlalchemy.orm import relationship
from app.models.base import BaseModel

class SOP(BaseModel):
    __tablename__ = "sops"
    
    recording_id = Column(Integer, ForeignKey("recordings.id"), nullable=False)
    
    # Basic info
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)  # e.g., "Software Tutorial", "Process Documentation"
    
    # Content
    overview = Column(Text, nullable=True)  # High-level description
    prerequisites = Column(Text, nullable=True)  # What's needed before starting
    estimated_duration = Column(Integer, nullable=True)  # Minutes to complete
    
    # Metadata
    difficulty_level = Column(String(20), default="beginner")  # beginner, intermediate, advanced
    tags = Column(JSON, nullable=True)  # ["web", "tutorial", "form-filling"]
    
    # Generation info
    generated_by = Column(String(50), default="ai")  # ai, manual, hybrid
    ai_model_used = Column(String(50), nullable=True)  # gpt-4, gpt-3.5-turbo, etc.
    generation_time = Column(Float, nullable=True)  # Seconds taken to generate
    
    # Status
    is_published = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)
    
    # Export formats generated
    formats_available = Column(JSON, nullable=True)  # ["pdf", "docx", "html", "json"]
    
    # Relationships
    recording = relationship("Recording", back_populates="sops")
    steps = relationship("SOPStep", back_populates="sop", cascade="all, delete-orphan", order_by="SOPStep.step_number")

class SOPStep(BaseModel):
    __tablename__ = "sop_steps"
    
    sop_id = Column(Integer, ForeignKey("sops.id"), nullable=False)
    
    # Step info
    step_number = Column(Integer, nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    
    # Action details
    action_type = Column(String(50), nullable=True)  # click, type, navigate, wait, etc.
    element_selector = Column(String(500), nullable=True)  # CSS selector or XPath
    input_value = Column(String(1000), nullable=True)  # For typing actions
    
    # Timing
    timestamp = Column(Float, nullable=True)  # When this step occurs in recording
    duration = Column(Float, nullable=True)  # How long this step takes
    
    # Media
    screenshot_id = Column(Integer, ForeignKey("screenshots.id"), nullable=True)
    additional_screenshots = Column(JSON, nullable=True)  # Array of screenshot IDs
    
    # Instructions
    notes = Column(Text, nullable=True)  # Additional notes or warnings
    tips = Column(Text, nullable=True)  # Pro tips or alternative approaches
    expected_result = Column(Text, nullable=True)  # What should happen after this step
    
    # Validation
    is_critical = Column(Boolean, default=False)  # Is this step essential?
    is_optional = Column(Boolean, default=False)  # Can this step be skipped?
    
    # Relationships
    sop = relationship("SOP", back_populates="steps")
    screenshot = relationship("Screenshot", foreign_keys=[screenshot_id])