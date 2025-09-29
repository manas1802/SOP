# Fixed app/api/v1/recordings.py
"""
Recording endpoints with correct imports and simplified video processing
"""
import os
import json
import time
import shutil
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models import Recording, ClickData, Screenshot, Transcript
from app.schemas.recording import RecordingResponse, RecordingCreate
from app.config import settings

router = APIRouter()

@router.get("/recordings")
async def list_recordings(
    skip: int = 0,
    limit: int = 10,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List recordings with filtering and pagination"""
    try:
        query = db.query(Recording).order_by(desc(Recording.created_at))
        
        # Filter by status if provided
        if status:
            query = query.filter(Recording.status == status)
        
        total = query.count()
        recordings = query.offset(skip).limit(limit).all()
        
        return {
            "recordings": recordings,
            "total": total,
            "skip": skip,
            "limit": limit,
            "status_filter": status
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
        
        # Get video info if video exists
        video_info = None
        if recording.video_path and os.path.exists(recording.video_path):
            try:
                video_info = get_basic_video_info(recording.video_path)
            except Exception as e:
                print(f"⚠️ Could not get video info: {e}")
                video_info = {"error": str(e)}
        
        return {
            "recording": recording,
            "clicks": recording.clicks,
            "screenshots": recording.screenshots,
            "transcript": recording.transcript,
            "sops": recording.sops,
            "video_info": video_info
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recordings/upload-chunk")
async def upload_chunk(
    background_tasks: BackgroundTasks,
    chunk: UploadFile = File(...),
    chunk_index: int = Form(...),
    session_id: str = Form(...),
    timestamp: float = Form(...),
    relative_time: float = Form(...),
    is_final: str = Form("false"),
    db: Session = Depends(get_db)
):
    """
    Upload individual video chunk with optimized storage
    """
    try:
        print(f"📦 Receiving chunk {chunk_index} for session {session_id}")
        
        # Validate chunk
        if not chunk.filename or chunk.size == 0:
            raise HTTPException(status_code=400, detail="Invalid chunk data")
        
        if chunk.size > 50 * 1024 * 1024:  # 50MB per chunk limit
            raise HTTPException(status_code=413, detail="Chunk too large")
        
        # Get or create recording record
        recording = db.query(Recording).filter(Recording.session_id == session_id).first()
        
        if not recording:
            # Create new recording record
            recording = Recording(
                session_id=session_id,
                title=f"Recording {session_id}",
                status="uploading",
                url="chrome-extension://recording",
                page_title="Video Recording"
            )
            db.add(recording)
            db.commit()
            db.refresh(recording)
            print(f"✅ Created new recording record: {recording.id}")
        
        # Setup chunk storage directory
        chunk_dir = Path(settings.upload_dir) / "videos" / session_id
        chunk_dir.mkdir(parents=True, exist_ok=True)
        
        # Save chunk file
        chunk_filename = f"chunk_{chunk_index:06d}.webm"
        chunk_path = chunk_dir / chunk_filename
        
        # Save chunk with proper error handling
        try:
            await save_uploaded_file(chunk, chunk_path)
            chunk_size = chunk_path.stat().st_size
            
            print(f"💾 Chunk saved: {chunk_path} ({chunk_size} bytes)")
            
        except Exception as save_error:
            print(f"❌ Chunk save error: {save_error}")
            raise HTTPException(status_code=500, detail=f"Failed to save chunk: {save_error}")
        
        # Update recording metadata
        if not recording.chunk_count:
            recording.chunk_count = 0
        recording.chunk_count = max(recording.chunk_count or 0, chunk_index)
        
        if not recording.video_size:
            recording.video_size = 0
        recording.video_size = (recording.video_size or 0) + chunk_size
        
        recording.video_path = str(chunk_dir)
        recording.status = "uploading"
        
        db.commit()
        
        # Background cleanup for old chunks
        background_tasks.add_task(cleanup_old_chunk_files, str(chunk_dir), chunk_index)
        
        return {
            "success": True,
            "message": f"Chunk {chunk_index} uploaded successfully",
            "chunk_index": chunk_index,
            "session_id": session_id,
            "recording_id": recording.id,
            "chunk_path": str(chunk_path),
            "chunk_size": chunk_size,
            "total_size": recording.video_size,
            "total_chunks": recording.chunk_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Chunk upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Chunk upload failed: {str(e)}")

@router.post("/recordings/finalize")
async def finalize_recording(
    background_tasks: BackgroundTasks,
    session_id: str = Form(...),
    total_chunks: int = Form(...),
    duration: float = Form(...),
    db: Session = Depends(get_db)
):
    """
    Finalize recording by combining chunks and processing data
    """
    try:
        print(f"🏁 Finalizing recording {session_id} with {total_chunks} chunks")
        
        # Get recording record
        recording = db.query(Recording).filter(Recording.session_id == session_id).first()
        
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        # Setup paths
        chunk_dir = Path(recording.video_path)
        final_video_path = chunk_dir / "final_recording.webm"
        
        # Check if chunks exist
        chunk_files = list(chunk_dir.glob("chunk_*.webm"))
        actual_chunks = len(chunk_files)
        
        print(f"📁 Found {actual_chunks} chunk files in {chunk_dir}")
        
        if actual_chunks == 0:
            raise HTTPException(status_code=400, detail="No chunks found to combine")
        
        # Combine chunks into final video
        try:
            success = await combine_video_chunks_simple(
                chunk_dir=str(chunk_dir),
                output_path=str(final_video_path),
                total_chunks=actual_chunks
            )
            
            if not success:
                raise Exception("Video combination failed")
                
        except Exception as combine_error:
            print(f"❌ Video combination error: {combine_error}")
            recording.status = "failed"
            recording.error_message = f"Video combination failed: {str(combine_error)}"
            db.commit()
            raise HTTPException(status_code=500, detail="Failed to combine video chunks")
        
        # Verify final video exists and get info
        if not final_video_path.exists():
            raise HTTPException(status_code=500, detail="Final video file not created")
        
        try:
            video_info = get_basic_video_info(str(final_video_path))
        except Exception as info_error:
            print(f"⚠️ Could not get video info: {info_error}")
            video_info = {"duration": duration / 1000}  # Fallback
        
        # Update recording with final information
        recording.status = "completed"
        recording.video_path = str(final_video_path)
        recording.video_filename = "final_recording.webm"
        recording.video_size = final_video_path.stat().st_size
        recording.video_duration = video_info.get("duration", duration / 1000)
        recording.video_format = "webm"
        recording.error_message = None
        
        db.commit()
        
        print(f"✅ Recording finalized: {final_video_path} ({recording.video_size} bytes)")
        
        # Background tasks
        background_tasks.add_task(cleanup_chunk_files_after_combine, str(chunk_dir))
        
        return {
            "success": True,
            "message": "Recording finalized successfully",
            "recording_id": recording.id,
            "session_id": session_id,
            "final_path": str(final_video_path),
            "video_size": recording.video_size,
            "duration": recording.video_duration,
            "total_chunks": actual_chunks,
            "status": "completed",
            "video_info": video_info
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Finalize recording error: {e}")
        raise HTTPException(status_code=500, detail=f"Finalization failed: {str(e)}")

@router.post("/recordings/upload")
async def upload_complete_recording(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    session_id: str = Form(...),
    click_data: Optional[str] = Form(None),
    screenshot_data: Optional[str] = Form(None),
    metadata: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Upload complete recording (fallback for non-streaming uploads)
    """
    try:
        print(f"📨 Receiving complete recording for session: {session_id}")
        
        # Validate file
        if not video.filename or video.size == 0:
            raise HTTPException(status_code=400, detail="Invalid video file")
        
        if video.size > settings.max_file_size:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Max size: {settings.max_file_size / 1024 / 1024:.1f} MB"
            )
        
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
            status="processing"
        )
        
        # Setup video storage
        video_dir = Path(settings.upload_dir) / "videos" / session_id
        video_dir.mkdir(parents=True, exist_ok=True)
        video_path = video_dir / f"recording_{session_id}.webm"
        
        # Save video file
        try:
            await save_uploaded_file(video, video_path)
            
            # Get video info
            video_info = get_basic_video_info(str(video_path))
            
            # Update recording with video info
            recording.video_path = str(video_path)
            recording.video_filename = video_path.name
            recording.video_size = video_path.stat().st_size
            recording.video_duration = video_info.get("duration", 0)
            recording.video_format = "webm"
            
        except Exception as save_error:
            raise HTTPException(status_code=500, detail=f"Failed to save video: {save_error}")
        
        # Process click data
        if click_data:
            try:
                clicks = json.loads(click_data)
                recording.click_count = len(clicks) if isinstance(clicks, list) else 0
                print(f"🖱️ Click data: {recording.click_count} clicks")
                
                # Save click data to database
                background_tasks.add_task(save_click_data_to_db, recording.id, clicks, db)
                
            except json.JSONDecodeError:
                print("⚠️ Invalid click data JSON")
        
        # Process screenshot data
        if screenshot_data:
            try:
                screenshots = json.loads(screenshot_data)
                recording.screenshot_count = len(screenshots) if isinstance(screenshots, list) else 0
                print(f"📸 Screenshot data: {recording.screenshot_count} screenshots")
                
                # Save screenshot data to database
                background_tasks.add_task(save_screenshot_data_to_db, recording.id, screenshots, db)
                
            except json.JSONDecodeError:
                print("⚠️ Invalid screenshot data JSON")
        
        # Save to database
        recording.status = "completed"
        db.add(recording)
        db.commit()
        db.refresh(recording)
        
        print(f"✅ Recording saved with ID: {recording.id}")
        
        return {
            "success": True,
            "message": "Recording uploaded successfully",
            "recording_id": recording.id,
            "session_id": session_id,
            "status": "completed",
            "video_path": str(video_path),
            "video_size": recording.video_size,
            "duration": recording.video_duration
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/recordings/{recording_id}")
async def delete_recording(
    recording_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Delete recording and associated files"""
    try:
        recording = db.query(Recording).filter(Recording.id == recording_id).first()
        
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        # Schedule file cleanup
        if recording.video_path:
            background_tasks.add_task(cleanup_recording_files, recording.video_path)
        
        # Delete from database (CASCADE will handle related records)
        db.delete(recording)
        db.commit()
        
        return {
            "success": True,
            "message": f"Recording {recording_id} deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/recordings/{recording_id}/download")
async def download_recording(recording_id: int, db: Session = Depends(get_db)):
    """Download recording video file"""
    try:
        from fastapi.responses import FileResponse
        
        recording = db.query(Recording).filter(Recording.id == recording_id).first()
        
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        if not recording.video_path or not os.path.exists(recording.video_path):
            raise HTTPException(status_code=404, detail="Video file not found")
        
        filename = f"recording_{recording.session_id}.webm"
        
        return FileResponse(
            path=recording.video_path,
            filename=filename,
            media_type="video/webm"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Utility functions

async def save_uploaded_file(upload_file: UploadFile, destination: Path):
    """Save uploaded file to destination"""
    import aiofiles
    
    destination.parent.mkdir(parents=True, exist_ok=True)
    
    async with aiofiles.open(destination, 'wb') as f:
        content = await upload_file.read()
        await f.write(content)
    
    # Reset file pointer
    await upload_file.seek(0)

def get_basic_video_info(video_path: str) -> dict:
    """Get basic video information without external dependencies"""
    try:
        file_path = Path(video_path)
        if not file_path.exists():
            return {"error": "File not found"}
        
        file_size = file_path.stat().st_size
        
        # Basic info without ffprobe
        return {
            "size": file_size,
            "duration": 0,  # Will be filled by actual video processing later
            "format": file_path.suffix.lower(),
            "path": str(file_path)
        }
        
    except Exception as e:
        return {"error": str(e)}

async def combine_video_chunks_simple(chunk_dir: str, output_path: str, total_chunks: int) -> bool:
    """
    Simple chunk combination using binary concatenation
    """
    try:
        chunk_path = Path(chunk_dir)
        output_file = Path(output_path)
        
        print(f"🔗 Combining {total_chunks} chunks into {output_path}")
        
        # Find chunk files
        chunk_files = sorted(chunk_path.glob("chunk_*.webm"))
        
        if not chunk_files:
            print(f"❌ No chunk files found in {chunk_dir}")
            return False
        
        # Simple binary concatenation for WebM files
        with open(output_file, 'wb') as outfile:
            for chunk_file in chunk_files:
                with open(chunk_file, 'rb') as infile:
                    outfile.write(infile.read())
        
        # Verify output file
        if output_file.exists() and output_file.stat().st_size > 0:
            print(f"✅ Chunks combined successfully: {output_file}")
            return True
        
        return False
        
    except Exception as e:
        print(f"❌ Chunk combination error: {e}")
        return False

# Background task functions

async def cleanup_old_chunk_files(chunk_dir: str, current_chunk: int):
    """Cleanup old chunks to save space"""
    try:
        chunk_path = Path(chunk_dir)
        if not chunk_path.exists():
            return
        
        # Keep only last 5 chunks
        chunks_to_keep = 5
        if current_chunk > chunks_to_keep:
            old_chunk = current_chunk - chunks_to_keep
            old_chunk_file = chunk_path / f"chunk_{old_chunk:06d}.webm"
            
            if old_chunk_file.exists():
                old_chunk_file.unlink()
                print(f"🗑️ Cleaned up old chunk: {old_chunk_file}")
                
    except Exception as e:
        print(f"⚠️ Chunk cleanup error: {e}")

async def cleanup_chunk_files_after_combine(chunk_dir: str):
    """Cleanup individual chunk files after combining"""
    try:
        chunk_path = Path(chunk_dir)
        if not chunk_path.exists():
            return
        
        # Remove individual chunk files
        chunk_files = list(chunk_path.glob("chunk_*.webm"))
        for chunk_file in chunk_files:
            try:
                chunk_file.unlink()
                print(f"🗑️ Cleaned up chunk: {chunk_file}")
            except Exception as e:
                print(f"⚠️ Could not delete chunk {chunk_file}: {e}")
                
        print(f"✅ Chunk cleanup completed for {chunk_dir}")
        
    except Exception as e:
        print(f"❌ Chunk cleanup error: {e}")

async def cleanup_recording_files(video_path: str):
    """Cleanup all files associated with a recording"""
    try:
        path = Path(video_path)
        
        if path.is_file():
            # Single file
            path.unlink()
            print(f"🗑️ Deleted video file: {path}")
        elif path.is_dir():
            # Directory with chunks
            shutil.rmtree(path)
            print(f"🗑️ Deleted recording directory: {path}")
            
    except Exception as e:
        print(f"⚠️ File cleanup error: {e}")

async def save_click_data_to_db(recording_id: int, clicks: list, db: Session):
    """Save click data to database"""
    try:
        for click in clicks:
            click_record = ClickData(
                recording_id=recording_id,
                timestamp=click.get("timestamp", time.time()),
                relative_time=click.get("relative_time", 0),
                url=click.get("url", ""),
                page_title=click.get("page_title", ""),
                element_data=click.get("element", {}),
                click_x=click.get("click", {}).get("x"),
                click_y=click.get("click", {}).get("y"),
                viewport_data=click.get("viewport", {})
            )
            db.add(click_record)
        
        db.commit()
        print(f"✅ Saved {len(clicks)} click records")
        
    except Exception as e:
        print(f"❌ Error saving click data: {e}")
        db.rollback()

async def save_screenshot_data_to_db(recording_id: int, screenshots: list, db: Session):
    """Save screenshot data to database"""
    try:
        for screenshot in screenshots:
            screenshot_record = Screenshot(
                recording_id=recording_id,
                description=screenshot.get("description", ""),
                timestamp=screenshot.get("timestamp", time.time()),
                relative_time=screenshot.get("relative_time", 0),
                capture_type="automatic",
                page_url=screenshot.get("url", ""),
                width=screenshot.get("viewport", {}).get("width"),
                height=screenshot.get("viewport", {}).get("height")
            )
            db.add(screenshot_record)
        
        db.commit()
        print(f"✅ Saved {len(screenshots)} screenshot records")
        
    except Exception as e:
        print(f"❌ Error saving screenshot data: {e}")
        db.rollback()