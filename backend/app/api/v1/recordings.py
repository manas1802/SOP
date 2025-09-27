# ===== app/api/v1/recordings.py =====
"""
Recording endpoints - This will receive data from your Chrome extension
"""
import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import time

from app.database import get_db
from app.models import Recording
from app.schemas.recording import RecordingResponse, RecordingCreate
from app.config import settings
from app.utils.video_utils import cleanup_chunks, combine_chunks

router = APIRouter()

@router.get("/recordings")
async def list_recordings(
    skip: int = 0,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """List all recordings"""
    try:
        recordings = (
            db.query(Recording)
            .order_by(Recording.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
        
        total = db.query(Recording).count()
        
        return {
            "recordings": recordings,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/recordings/{recording_id}")
async def get_recording(recording_id: int, db: Session = Depends(get_db)):
    """Get specific recording with all related data"""
    try:
        recording = db.query(Recording).filter(Recording.id == recording_id).first()
        
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        return {
            "recording": recording,
            "clicks": recording.clicks,
            "screenshots": recording.screenshots,
            "transcript": recording.transcript,
            "sops": recording.sops
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recordings/upload")
async def upload_recording(
    video: Optional[UploadFile] = File(None),
    session_id: str = Form(...),
    click_data: Optional[str] = Form(None),
    screenshot_data: Optional[str] = Form(None),
    metadata: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Upload recording from Chrome extension
    This is the main endpoint your extension will use!
    """
    try:
        print(f"📨 Received upload request for session: {session_id}")
        
        # Parse metadata
        metadata_dict = {}
        if metadata:
            try:
                metadata_dict = json.loads(metadata)
            except json.JSONDecodeError as e:
                print(f"⚠️ Invalid metadata JSON: {e}")
        
        # Create recording record
        recording = Recording(
            session_id=session_id,
            title=metadata_dict.get("title", f"Recording {session_id}"),
            description=metadata_dict.get("description", "Uploaded from Chrome extension"),
            url=metadata_dict.get("url"),
            page_title=metadata_dict.get("page_title"),
            browser_info=metadata_dict.get("browser_info"),
            status="uploaded"
        )
        
        # Handle video file
        if video:
            # Validate file
            if video.size > settings.max_file_size:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Max size: {settings.max_file_size / 1024 / 1024:.1f} MB"
                )
            
            # Save video info
            recording.video_filename = video.filename
            recording.video_size = video.size
            recording.video_format = video.filename.split('.')[-1] if video.filename else 'webm'
            
            # TODO: In next task, we'll actually save the video file
            print(f"📹 Video uploaded: {video.filename} ({video.size} bytes)")
        
        # Parse click data
        if click_data:
            try:
                clicks = json.loads(click_data)
                recording.click_count = len(clicks) if isinstance(clicks, list) else 0
                print(f"🖱️ Click data: {recording.click_count} clicks")
            except json.JSONDecodeError:
                print("⚠️ Invalid click data JSON")
        
        # Parse screenshot data
        if screenshot_data:
            try:
                screenshots = json.loads(screenshot_data)
                recording.screenshot_count = len(screenshots) if isinstance(screenshots, list) else 0
                print(f"📸 Screenshot data: {recording.screenshot_count} screenshots")
            except json.JSONDecodeError:
                print("⚠️ Invalid screenshot data JSON")
        
        # Save to database
        db.add(recording)
        db.commit()
        db.refresh(recording)
        
        print(f"✅ Recording saved with ID: {recording.id}")
        
        return {
            "success": True,
            "message": "Recording uploaded successfully",
            "recording_id": recording.id,
            "session_id": session_id,
            "status": "uploaded",
            "processing_will_start": "In next task, we'll add video processing!"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recordings/upload-chunk")
async def upload_chunk(
    chunk: UploadFile = File(...),
    chunk_index: int = Form(...),
    session_id: str = Form(...),
    timestamp: float = Form(...),
    relative_time: float = Form(...),
    is_final: str = Form("false"),
    db: Session = Depends(get_db)
):
    """
    Upload individual video chunk during streaming recording
    This prevents browser memory overflow
    """
    try:
        print(f"📦 Received chunk {chunk_index} for session {session_id}")
        
        # Get or create recording record
        recording = db.query(Recording).filter(Recording.session_id == session_id).first()
        
        if not recording:
            # Create new recording record
            recording = Recording(
                session_id=session_id,
                title=f"Streaming Recording {session_id}",
                status="streaming",
                url="streaming",
                page_title="Streaming Recording"
            )
            db.add(recording)
            db.commit()
            db.refresh(recording)
            print(f"✅ Created new recording record: {recording.id}")
        
        # Save chunk to disk
        chunk_filename = f"chunk_{session_id}_{chunk_index:04d}.webm"
        chunk_dir = f"{settings.upload_dir}/videos/{session_id}"
        os.makedirs(chunk_dir, exist_ok=True)
        chunk_path = f"{chunk_dir}/{chunk_filename}"
        
        # Write chunk to file
        with open(chunk_path, "wb") as f:
            content = await chunk.read()
            f.write(content)
        
        print(f"💾 Chunk saved: {chunk_path} ({len(content)} bytes)")
        
        # Update recording metadata
        recording.video_path = chunk_dir  # Directory containing chunks
        if hasattr(recording, 'chunk_count'):
            recording.chunk_count += 1
        else:
            recording.chunk_count = chunk_index
        
        # Update total size
        if hasattr(recording, 'video_size'):
            recording.video_size += len(content)
        else:
            recording.video_size = len(content)
        
        db.commit()
        
        return {
            "success": True,
            "message": f"Chunk {chunk_index} uploaded successfully",
            "chunk_index": chunk_index,
            "session_id": session_id,
            "recording_id": recording.id,
            "chunk_path": chunk_path,
            "chunk_size": len(content),
            "total_size": recording.video_size
        }
        
    except Exception as e:
        print(f"❌ Chunk upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recordings/finalize")
async def finalize_recording(
    request_data: dict,
    db: Session = Depends(get_db)
):
    """
    Finalize streaming recording - combine chunks into single video
    """
    try:
        session_id = request_data.get("session_id")
        total_chunks = request_data.get("total_chunks", 0)
        duration = request_data.get("duration", 0)
        
        print(f"🏁 Finalizing recording {session_id} with {total_chunks} chunks")
        
        # Get recording record
        recording = db.query(Recording).filter(Recording.session_id == session_id).first()
        
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        # Combine chunks into single video file
        chunk_dir = f"{settings.upload_dir}/videos/{session_id}"
        final_video_path = f"{chunk_dir}/final_recording.webm"
        
        success = await combine_chunks(chunk_dir, final_video_path, total_chunks)
        
        if success:
            # Update recording status
            recording.status = "completed"
            recording.video_path = final_video_path
            recording.video_filename = "final_recording.webm"
            recording.video_duration = duration / 1000  # Convert to seconds
            recording.chunk_count = total_chunks
            
            db.commit()
            
            print(f"✅ Recording finalized: {final_video_path}")
            
            # Clean up individual chunks (optional)
            cleanup_chunks(chunk_dir, total_chunks)
            
            return {
                "success": True,
                "message": "Recording finalized successfully",
                "recording_id": recording.id,
                "final_path": final_video_path,
                "duration": duration,
                "total_chunks": total_chunks,
                "status": "completed"
            }
        else:
            recording.status = "failed"
            recording.error_message = "Failed to combine chunks"
            db.commit()
            
            raise HTTPException(status_code=500, detail="Failed to combine chunks")
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Finalize recording error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/recordings/{recording_id}/chunks")
async def get_recording_chunks(
    recording_id: int,
    db: Session = Depends(get_db)
):
    """
    Get information about recording chunks
    """
    try:
        recording = db.query(Recording).filter(Recording.id == recording_id).first()
        
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        chunk_dir = f"{settings.upload_dir}/videos/{recording.session_id}"
        
        if not os.path.exists(chunk_dir):
            return {
                "recording_id": recording_id,
                "chunks": [],
                "total_chunks": 0,
                "total_size": 0
            }
        
        # List chunk files
        chunk_files = []
        total_size = 0
        
        for filename in sorted(os.listdir(chunk_dir)):
            if filename.startswith("chunk_") and filename.endswith(".webm"):
                file_path = os.path.join(chunk_dir, filename)
                file_size = os.path.getsize(file_path)
                
                chunk_files.append({
                    "filename": filename,
                    "size": file_size,
                    "path": file_path
                })
                total_size += file_size
        
        return {
            "recording_id": recording_id,
            "session_id": recording.session_id,
            "chunks": chunk_files,
            "total_chunks": len(chunk_files),
            "total_size": total_size,
            "status": recording.status
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Get chunks error: {e}")
        raise HTTPException(status_code=500, detail=str(e))