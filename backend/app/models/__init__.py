# ===== app/models/__init__.py =====
"""
Import all models so they're registered with SQLAlchemy
"""
from app.models.base import BaseModel
from app.models.recording import Recording, ClickData, Screenshot, Transcript
from app.models.sop import SOP, SOPStep

# Export all models
__all__ = [
    "BaseModel",
    "Recording", 
    "ClickData", 
    "Screenshot", 
    "Transcript",
    "SOP", 
    "SOPStep"
]

# ===== Test the database connection (test_db.py) =====
"""
Test script to verify database setup
Run this with: python test_db.py
"""
if __name__ == "__main__":
    from app.database import init_db, SessionLocal
    from app.models import Recording, ClickData, Screenshot, Transcript, SOP, SOPStep
    import json
    
    # Initialize database
    init_db()
    
    # Test creating a sample record
    db = SessionLocal()
    
    try:
        # Create a sample recording
        sample_recording = Recording(
            session_id="test_session_123",
            title="Test Recording",
            description="A test recording to verify database setup",
            url="https://example.com",
            page_title="Example Page",
            status="uploaded",
            browser_info={"browser": "chrome", "version": "118.0"}
        )
        
        db.add(sample_recording)
        db.commit()
        db.refresh(sample_recording)
        
        print(f"✅ Created sample recording with ID: {sample_recording.id}")
        
        # Add sample click data
        sample_click = ClickData(
            recording_id=sample_recording.id,
            timestamp=1699123456.789,
            relative_time=1500,  # 1.5 seconds into recording
            url="https://example.com",
            page_title="Example Page",
            element_data={
                "tagName": "button",
                "text": "Submit",
                "selector": "#submit-btn",
                "bounds": {"x": 100, "y": 200, "width": 80, "height": 30}
            },
            click_x=140,
            click_y=215
        )
        
        db.add(sample_click)
        db.commit()
        
        print(f"✅ Created sample click data")
        
        # Query back the data
        recordings = db.query(Recording).all()
        print(f"✅ Found {len(recordings)} recordings in database")
        
        for recording in recordings:
            print(f"  - {recording.title} (Session: {recording.session_id})")
            print(f"    Clicks: {len(recording.clicks)}")
            print(f"    Status: {recording.status}")
        
        print("🎉 Database test completed successfully!")
        
    except Exception as e:
        print(f"❌ Database test failed: {e}")
        db.rollback()
    finally:
        db.close()