#!/usr/bin/env python3
"""
Test script to verify database setup
Run this with: python test_database.py
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import init_db, SessionLocal, engine
from app.models import Recording, ClickData, Screenshot, Transcript, SOP, SOPStep
import json
from sqlalchemy import text

def test_database_connection():
    """Test basic database connection"""
    print("🔌 Testing database connection...")
    
    try:
        # Test connection
        with engine.connect() as connection:
            result = connection.execute(text("SELECT 1"))
            print("✅ Database connection successful!")
        return True
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False

def test_table_creation():
    """Test table creation"""
    print("🏗️ Testing table creation...")
    
    try:
        init_db()
        return True
    except Exception as e:
        print(f"❌ Table creation failed: {e}")
        return False

def test_crud_operations():
    """Test Create, Read, Update, Delete operations"""
    print("📝 Testing CRUD operations...")
    
    db = SessionLocal()
    
    try:
        # CREATE - Sample recording
        print("  Creating sample recording...")
        sample_recording = Recording(
            session_id="test_session_123",
            title="Test Recording - Database Setup",
            description="A test recording to verify database setup works correctly",
            url="https://example.com/test-page",
            page_title="Test Page for SOP Recording",
            status="uploaded",
            video_filename="test_recording.webm",
            video_size=1024000,  # 1MB
            video_duration=30.5,  # 30.5 seconds
            browser_info={
                "browser": "chrome", 
                "version": "118.0",
                "extension_version": "1.0.0"
            },
            click_count=3,
            screenshot_count=2
        )
        
        db.add(sample_recording)
        db.commit()
        db.refresh(sample_recording)
        
        print(f"  ✅ Created recording with ID: {sample_recording.id}")
        
        # Add sample click data
        print("  Adding sample click data...")
        clicks = [
            {
                "timestamp": 1699123456.789,
                "relative_time": 1500,  # 1.5 seconds
                "url": "https://example.com/test-page",
                "page_title": "Test Page",
                "element_data": {
                    "tagName": "button",
                    "text": "Start Process",
                    "selector": "#start-btn",
                    "bounds": {"x": 100, "y": 200, "width": 120, "height": 40},
                    "id": "start-btn",
                    "className": "btn btn-primary"
                },
                "click_x": 160,
                "click_y": 220
            },
            {
                "timestamp": 1699123459.123,
                "relative_time": 4000,  # 4 seconds
                "url": "https://example.com/test-page",
                "page_title": "Test Page",
                "element_data": {
                    "tagName": "input",
                    "text": "",
                    "selector": "#email-input",
                    "bounds": {"x": 50, "y": 300, "width": 200, "height": 30},
                    "type": "email",
                    "name": "email"
                },
                "click_x": 150,
                "click_y": 315
            },
            {
                "timestamp": 1699123465.456,
                "relative_time": 10000,  # 10 seconds
                "url": "https://example.com/test-page",
                "page_title": "Test Page",
                "element_data": {
                    "tagName": "button",
                    "text": "Submit",
                    "selector": "#submit-btn",
                    "bounds": {"x": 200, "y": 400, "width": 80, "height": 35}
                },
                "click_x": 240,
                "click_y": 417
            }
        ]
        
        for i, click_data in enumerate(clicks):
            sample_click = ClickData(
                recording_id=sample_recording.id,
                timestamp=click_data["timestamp"],
                relative_time=click_data["relative_time"],
                url=click_data["url"],
                page_title=click_data["page_title"],
                element_data=click_data["element_data"],
                click_x=click_data["click_x"],
                click_y=click_data["click_y"],
                viewport_data={"width": 1920, "height": 1080}
            )
            db.add(sample_click)
        
        db.commit()
        print(f"  ✅ Created {len(clicks)} click records")
        
        # Add sample screenshots
        print("  Adding sample screenshots...")
        screenshots = [
            {
                "description": "Initial page load",
                "timestamp": 1699123456.000,
                "relative_time": 1000,
                "capture_type": "page_load",
                "width": 1920,
                "height": 1080
            },
            {
                "description": "After clicking start button",
                "timestamp": 1699123457.500,
                "relative_time": 2500,
                "capture_type": "click",
                "width": 1920,
                "height": 1080
            }
        ]
        
        for screenshot_data in screenshots:
            sample_screenshot = Screenshot(
                recording_id=sample_recording.id,
                description=screenshot_data["description"],
                timestamp=screenshot_data["timestamp"],
                relative_time=screenshot_data["relative_time"],
                capture_type=screenshot_data["capture_type"],
                page_url="https://example.com/test-page",
                width=screenshot_data["width"],
                height=screenshot_data["height"],
                image_format="png"
            )
            db.add(sample_screenshot)
        
        db.commit()
        print(f"  ✅ Created {len(screenshots)} screenshot records")
        
        # Add sample transcript
        print("  Adding sample transcript...")
        sample_transcript = Transcript(
            recording_id=sample_recording.id,
            full_text="Hello, I'm going to show you how to fill out this form. First, I'll click the start button. Now I'll enter my email address. Finally, I'll submit the form.",
            language="en",
            confidence_score=0.95,
            whisper_model_used="base",
            processing_time=5.2,
            segments=[
                {"start": 0.0, "end": 3.5, "text": "Hello, I'm going to show you how to fill out this form."},
                {"start": 4.0, "end": 6.5, "text": "First, I'll click the start button."},
                {"start": 7.0, "end": 9.5, "text": "Now I'll enter my email address."},
                {"start": 10.0, "end": 12.0, "text": "Finally, I'll submit the form."}
            ]
        )
        
        db.add(sample_transcript)
        db.commit()
        print("  ✅ Created transcript record")
        
        # Add sample SOP
        print("  Adding sample SOP...")
        sample_sop = SOP(
            recording_id=sample_recording.id,
            title="How to Fill Out Contact Form",
            description="Step-by-step guide for completing the contact form on the website",
            category="Web Form Tutorial",
            overview="This SOP demonstrates the process of filling out a contact form, from initial page load to successful submission.",
            prerequisites="Access to the website and a valid email address",
            estimated_duration=2,  # 2 minutes
            difficulty_level="beginner",
            tags=["web", "form", "tutorial", "beginner"],
            generated_by="ai",
            ai_model_used="gpt-4",
            generation_time=3.7
        )
        
        db.add(sample_sop)
        db.commit()
        db.refresh(sample_sop)
        print(f"  ✅ Created SOP with ID: {sample_sop.id}")
        
        # Add SOP steps
        print("  Adding SOP steps...")
        steps = [
            {
                "step_number": 1,
                "title": "Navigate to the Form",
                "description": "Open the website and locate the contact form on the main page.",
                "action_type": "navigate",
                "timestamp": 0.0,
                "duration": 1.0,
                "expected_result": "The contact form should be visible on the page"
            },
            {
                "step_number": 2,
                "title": "Click Start Button",
                "description": "Click the 'Start Process' button to activate the form fields.",
                "action_type": "click",
                "element_selector": "#start-btn",
                "timestamp": 1.5,
                "duration": 0.5,
                "expected_result": "Form fields become enabled and ready for input"
            },
            {
                "step_number": 3,
                "title": "Enter Email Address",
                "description": "Click on the email input field and type your email address.",
                "action_type": "type",
                "element_selector": "#email-input",
                "input_value": "user@example.com",
                "timestamp": 4.0,
                "duration": 3.0,
                "notes": "Make sure to use a valid email format",
                "expected_result": "Email address appears in the input field"
            },
            {
                "step_number": 4,
                "title": "Submit the Form",
                "description": "Click the 'Submit' button to complete the process.",
                "action_type": "click",
                "element_selector": "#submit-btn",
                "timestamp": 10.0,
                "duration": 1.0,
                "is_critical": True,
                "expected_result": "Success message appears confirming form submission"
            }
        ]
        
        for step_data in steps:
            sop_step = SOPStep(
                sop_id=sample_sop.id,
                **step_data
            )
            db.add(sop_step)
        
        db.commit()
        print(f"  ✅ Created {len(steps)} SOP steps")
        
        # READ - Query back the data
        print("  Testing data retrieval...")
        
        # Get recording with relationships
        recording = db.query(Recording).filter(Recording.session_id == "test_session_123").first()
        
        if recording:
            print(f"  📊 Recording: {recording.title}")
            print(f"      Session ID: {recording.session_id}")
            print(f"      Status: {recording.status}")
            print(f"      Clicks: {len(recording.clicks)}")
            print(f"      Screenshots: {len(recording.screenshots)}")
            print(f"      Has Transcript: {recording.transcript is not None}")
            print(f"      SOPs: {len(recording.sops)}")
            
            if recording.sops:
                sop = recording.sops[0]
                print(f"      SOP Title: {sop.title}")
                print(f"      SOP Steps: {len(sop.steps)}")
                
                for step in sop.steps[:2]:  # Show first 2 steps
                    print(f"        {step.step_number}. {step.title}")
        
        # UPDATE - Test updating a record
        print("  Testing record update...")
        recording.status = "processing"
        recording.click_count = len(recording.clicks)  # Update count
        db.commit()
        print(f"  ✅ Updated recording status to: {recording.status}")
        
        print("✅ CRUD operations test completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ CRUD operations test failed: {e}")
        db.rollback()
        return False
    finally:
        db.close()

def test_query_performance():
    """Test query performance and relationships"""
    print("⚡ Testing query performance...")
    
    db = SessionLocal()
    
    try:
        # Test complex query with joins
        from sqlalchemy.orm import joinedload
        
        recordings = (db.query(Recording)
                     .options(
                         joinedload(Recording.clicks),
                         joinedload(Recording.screenshots),
                         joinedload(Recording.transcript),
                         joinedload(Recording.sops).joinedload(SOP.steps)
                     )
                     .all())
        
        print(f"  ✅ Retrieved {len(recordings)} recordings with all relationships")
        
        for recording in recordings:
            total_elements = (len(recording.clicks) + 
                            len(recording.screenshots) + 
                            (1 if recording.transcript else 0) +
                            sum(len(sop.steps) for sop in recording.sops))
            print(f"    - {recording.title}: {total_elements} total elements")
        
        return True
        
    except Exception as e:
        print(f"❌ Query performance test failed: {e}")
        return False
    finally:
        db.close()

def main():
    """Run all database tests"""
    print("🧪 Starting Database Tests...")
    print("=" * 50)
    
    tests = [
        ("Database Connection", test_database_connection),
        ("Table Creation", test_table_creation),
        ("CRUD Operations", test_crud_operations),
        ("Query Performance", test_query_performance)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n🧪 Running: {test_name}")
        print("-" * 30)
        
        if test_func():
            passed += 1
            print(f"✅ {test_name} PASSED")
        else:
            print(f"❌ {test_name} FAILED")
    
    print("\n" + "=" * 50)
    print(f"🏁 Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All database tests passed! Your database setup is working correctly.")
        print("\n📁 Database file created at: sop_creator.db")
        print("📁 Upload directories created at: ./uploads/")
        print("\n🚀 Ready for Task 3: Basic FastAPI app!")
    else:
        print("⚠️  Some tests failed. Please check the error messages above.")
        return False
    
    return True

if __name__ == "__main__":
    main()