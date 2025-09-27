# ===== app/api/v1/health.py =====
"""
Health check endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import time
import psutil
import os

from app.database import get_db
from app.models import Recording
from app.config import settings

router = APIRouter()

@router.get("/health")
async def health_check():
    """Basic health check"""
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "version": "1.0.0"
    }

@router.get("/health/detailed")
async def detailed_health_check(db: Session = Depends(get_db)):
    """Detailed health check with database and system info"""
    try:
        # Test database connection
        start_time = time.time()
        recording_count = db.query(Recording).count()
        db_response_time = time.time() - start_time
        
        # System info
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('.')
        
        # Check upload directory
        upload_dir_exists = os.path.exists(settings.upload_dir)
        upload_dir_writable = os.access(settings.upload_dir, os.W_OK) if upload_dir_exists else False
        
        return {
            "status": "healthy",
            "timestamp": time.time(),
            "database": {
                "connection": "OK",
                "response_time_ms": round(db_response_time * 1000, 2),
                "recordings_count": recording_count
            },
            "system": {
                "memory_usage_percent": memory.percent,
                "disk_usage_percent": disk.percent,
                "disk_free_gb": round(disk.free / (1024**3), 2)
            },
            "storage": {
                "upload_dir_exists": upload_dir_exists,
                "upload_dir_writable": upload_dir_writable,
                "upload_dir_path": settings.upload_dir
            },
            "config": {
                "debug": settings.debug,
                "max_file_size_mb": round(settings.max_file_size / (1024**2), 1),
                "allowed_origins": len(settings.allowed_origins_list)
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "error": str(e),
                "timestamp": time.time()
            }
        )
