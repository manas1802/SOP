# 1. BACKEND FIX - Enhanced app/main.py with detailed debugging
"""
Enhanced FastAPI app with comprehensive debugging and error handling
"""
from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import uvicorn
import logging
import time
import json
import os
from pathlib import Path
from typing import Optional

# Basic imports that should work
from app.config import settings
from app.database import init_db, get_db, SessionLocal
from app.models import Recording, ClickData, Screenshot

# Configure detailed logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="SOP Creator API - Debug Version",
    description="API with comprehensive debugging",
    version="1.0.0",
    docs_url="/docs"
)

# Enhanced CORS with debugging
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for debugging
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DETAILED DEBUG MIDDLEWARE
@app.middleware("http")
async def comprehensive_debug_middleware(request: Request, call_next):
    start_time = time.time()
    
    # Log ALL request details
    print(f"\n{'='*60}")
    print(f"🌐 REQUEST: {request.method} {request.url}")
    print(f"🔗 Origin: {request.headers.get('origin', 'none')}")
    print(f"🤖 User-Agent: {request.headers.get('user-agent', 'none')}")
    print(f"📝 Content-Type: {request.headers.get('content-type', 'none')}")
    
    # Log all headers for debugging
    print("📋 All Headers:")
    for name, value in request.headers.items():
        if name.lower() not in ['user-agent']:  # Skip long headers
            print(f"   {name}: {value}")
    
    # For POST requests, try to log form data
    if request.method == "POST":
        print("📦 POST Request Details:")
        
        # Clone the request to read body without consuming it
        body = b""
        try:
            async for chunk in request.stream():
                body += chunk
        except Exception as e:
            print(f"   Could not read body: {e}")
        
        # Rebuild request with body
        from starlette.requests import Request as StarletteRequest
        scope = request.scope.copy()
        receive = lambda: {"type": "http.request", "body": body}
        request = StarletteRequest(scope, receive)
    
    # Process request
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        
        print(f"✅ RESPONSE: {response.status_code} ({process_time:.3f}s)")
        print(f"{'='*60}\n")
        
        return response
        
    except Exception as e:
        process_time = time.time() - start_time
        print(f"💥 ERROR: {str(e)} ({process_time:.3f}s)")
        print(f"{'='*60}\n")
        raise

# Initialize on startup
@app.on_event("startup")
async def startup_event():
    logger.info("🚀 Starting SOP Creator Backend (Debug Mode)...")
    
    try:
        init_db()
        logger.info("✅ Database initialized")
    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")
    
    # Create upload directories
    try:
        upload_dirs = [
            settings.upload_dir,
            f"{settings.upload_dir}/videos",
            f"{settings.upload_dir}/screenshots"
        ]
        
        for dir_path in upload_dirs:
            os.makedirs(dir_path, exist_ok=True)
            logger.info(f"📁 Created directory: {dir_path}")
        
        logger.info(f"✅ Upload directories ready: {settings.upload_dir}")
    except Exception as e:
        logger.error(f"❌ Directory creation failed: {e}")
    
    logger.info("🎉 Backend startup completed!")

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "SOP Creator API - Debug Mode",
        "version": "1.0.0",
        "status": "running",
        "timestamp": time.time()
    }

# Health endpoints
@app.get("/api/v1/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "version": "1.0.0"
    }

@app.get("/api/v1/health/detailed")
async def detailed_health(db: Session = Depends(get_db)):
    try:
        recording_count = db.query(Recording).count()
        
        return {
            "status": "healthy",
            "timestamp": time.time(),
            "database": {
                "connection": "OK",
                "recordings_count": recording_count
            },
            "storage": {
                "upload_dir": settings.upload_dir,
                "upload_dir_exists": os.path.exists(settings.upload_dir)
            },
            "debug": True
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": time.time()
        }

# ENHANCED CHUNK UPLOAD with detailed debugging
@app.post("/api/v1/recordings/upload-chunk")
async def upload_chunk_debug(
    request: Request,
    chunk: UploadFile = File(...),
    chunk_index: int = Form(...),
    session_id: str = Form(...),
    timestamp: float = Form(...),
    relative_time: float = Form(...),
    is_final: str = Form("false"),
    db: Session = Depends(get_db)
):
    try:
        print(f"\n📦 CHUNK UPLOAD DEBUG:")
        print(f"   Session ID: {session_id}")
        print(f"   Chunk Index: {chunk_index}")
        print(f"   Timestamp: {timestamp}")
        print(f"   Relative Time: {relative_time}")
        print(f"   Is Final: {is_final}")
        print(f"   Chunk Filename: {chunk.filename}")
        print(f"   Chunk Size: {chunk.size}")
        print(f"   Content Type: {chunk.content_type}")
        
        # Validate chunk
        if not chunk.filename:
            print("❌ No filename provided")
            raise HTTPException(status_code=400, detail="No filename provided")
        
        if chunk.size == 0:
            print("❌ Empty chunk")
            raise HTTPException(status_code=400, detail="Empty chunk")
        
        if chunk.size > 50 * 1024 * 1024:  # 50MB limit
            print(f"❌ Chunk too large: {chunk.size} bytes")
            raise HTTPException(status_code=413, detail="Chunk too large")
        
        # Get or create recording
        recording = db.query(Recording).filter(Recording.session_id == session_id).first()
        
        if not recording:
            print(f"🆕 Creating new recording for session: {session_id}")
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
            print(f"✅ Created recording with ID: {recording.id}")
        else:
            print(f"📝 Using existing recording ID: {recording.id}")
        
        # Setup storage
        chunk_dir = Path(settings.upload_dir) / "videos" / session_id
        chunk_dir.mkdir(parents=True, exist_ok=True)
        print(f"📁 Chunk directory: {chunk_dir}")
        
        chunk_filename = f"chunk_{chunk_index:06d}.webm"
        chunk_path = chunk_dir / chunk_filename
        print(f"💾 Saving to: {chunk_path}")
        
        # Save chunk
        content = await chunk.read()
        with open(chunk_path, "wb") as f:
            f.write(content)
        
        chunk_size = len(content)
        print(f"✅ Chunk saved: {chunk_size} bytes")
        
        # Update recording
        recording.chunk_count = max(recording.chunk_count or 0, chunk_index)
        recording.video_size = (recording.video_size or 0) + chunk_size
        recording.video_path = str(chunk_dir)
        recording.status = "uploading"
        
        db.commit()
        
        print(f"📊 Recording updated: {recording.chunk_count} chunks, {recording.video_size} total bytes")
        
        response_data = {
            "success": True,
            "message": f"Chunk {chunk_index} uploaded successfully",
            "chunk_index": chunk_index,
            "session_id": session_id,
            "recording_id": recording.id,
            "chunk_size": chunk_size,
            "total_size": recording.video_size,
            "total_chunks": recording.chunk_count
        }
        
        print(f"✅ Returning success response: {response_data}")
        return response_data
        
    except HTTPException as he:
        print(f"❌ HTTP Exception: {he.status_code} - {he.detail}")
        raise he
    except Exception as e:
        print(f"💥 Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Chunk upload failed: {str(e)}")

# ENHANCED FINALIZE with detailed debugging and validation
@app.post("/api/v1/recordings/finalize")
async def finalize_recording(
    request: Request,
    db: Session = Depends(get_db)
):
    try:
        # Handle both JSON and FormData
        if request.headers.get("content-type", "").startswith("application/json"):
            data = await request.json()
        else:
            form = await request.form()
            data = dict(form)
        
        session_id = data.get("session_id")
        total_chunks = int(data.get("total_chunks", 0))
        duration = float(data.get("duration", 0))
        
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id required")
        
        # Rest of your finalize logic...
        recording = db.query(Recording).filter(Recording.session_id == session_id).first()
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        
        # Simple success response
        recording.status = "completed"
        db.commit()
        
        return {"success": True, "message": "Recording finalized"}
        
    except Exception as e:
        print(f"❌ Finalize error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
# List recordings with debug info
@app.get("/api/v1/recordings")
async def list_recordings_debug(
    skip: int = 0,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    try:
        print(f"\n📋 LISTING RECORDINGS: skip={skip}, limit={limit}")
        
        recordings = (
            db.query(Recording)
            .order_by(Recording.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
        
        total = db.query(Recording).count()
        
        print(f"📊 Found {total} total recordings, returning {len(recordings)}")
        
        # Add debug info to each recording
        for recording in recordings:
            print(f"   - ID: {recording.id}, Session: {recording.session_id}")
            print(f"     Status: {recording.status}, Size: {recording.video_size or 0}")
            print(f"     Path: {recording.video_path}")
            
            # Check if files exist
            if recording.video_path:
                if os.path.exists(recording.video_path):
                    if os.path.isfile(recording.video_path):
                        size = os.path.getsize(recording.video_path)
                        print(f"     File exists: {size} bytes")
                    elif os.path.isdir(recording.video_path):
                        files = os.listdir(recording.video_path)
                        print(f"     Directory exists: {len(files)} files")
                else:
                    print(f"     Path not found!")
        
        return {
            "recordings": recordings,
            "total": total,
            "skip": skip,
            "limit": limit,
            "debug": True
        }
        
    except Exception as e:
        print(f"❌ Error listing recordings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Get specific recording with debug
@app.get("/api/v1/recordings/{recording_id}")
async def get_recording_debug(recording_id: int, db: Session = Depends(get_db)):
    try:
        print(f"\n📖 GETTING RECORDING: ID={recording_id}")
        
        recording = db.query(Recording).filter(Recording.id == recording_id).first()
        
        if not recording:
            print(f"❌ Recording {recording_id} not found")
            raise HTTPException(status_code=404, detail="Recording not found")
        
        print(f"✅ Found recording: {recording.session_id}")
        print(f"   Status: {recording.status}")
        print(f"   Video path: {recording.video_path}")
        print(f"   Size: {recording.video_size}")
        print(f"   Clicks: {len(recording.clicks)}")
        print(f"   Screenshots: {len(recording.screenshots)}")
        
        return {
            "recording": recording,
            "clicks": recording.clicks,
            "screenshots": recording.screenshots,
            "transcript": recording.transcript,
            "sops": recording.sops,
            "debug": {
                "file_exists": os.path.exists(recording.video_path) if recording.video_path else False,
                "file_size": os.path.getsize(recording.video_path) if recording.video_path and os.path.exists(recording.video_path) else 0
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error getting recording: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"\n💥 GLOBAL EXCEPTION HANDLER:")
    print(f"   Request: {request.method} {request.url}")
    print(f"   Exception: {type(exc).__name__}: {str(exc)}")
    
    import traceback
    traceback.print_exc()
    
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc),
            "type": type(exc).__name__,
            "request_url": str(request.url),
            "debug": True
        }
    )

# Debug endpoint
@app.get("/debug/info")
async def debug_info(db: Session = Depends(get_db)):
    try:
        recording_count = db.query(Recording).count()
        
        # Check upload directories
        upload_info = {}
        upload_dirs = ["uploads", "uploads/videos", "uploads/screenshots"]
        
        for dir_path in upload_dirs:
            if os.path.exists(dir_path):
                files = []
                try:
                    for item in os.listdir(dir_path):
                        item_path = os.path.join(dir_path, item)
                        if os.path.isfile(item_path):
                            size = os.path.getsize(item_path)
                            files.append({"name": item, "size": size})
                        elif os.path.isdir(item_path):
                            subfiles = len(os.listdir(item_path))
                            files.append({"name": item, "type": "directory", "files": subfiles})
                except Exception as e:
                    files = [{"error": str(e)}]
                
                upload_info[dir_path] = {
                    "exists": True,
                    "files": files
                }
            else:
                upload_info[dir_path] = {"exists": False}
        
        return {
            "database": {
                "url": settings.database_url,
                "recordings_count": recording_count
            },
            "config": {
                "upload_dir": settings.upload_dir,
                "max_file_size_mb": settings.max_file_size / (1024 * 1024),
                "debug": settings.debug
            },
            "storage": upload_info,
            "timestamp": time.time()
        }
        
    except Exception as e:
        print(f"❌ Debug info error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Run the app
if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level="info"
    )