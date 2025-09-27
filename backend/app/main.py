# ===== app/main.py =====
"""
Main FastAPI application
This will receive data from your Chrome extension
"""
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import uvicorn
import logging
import time

# Import our modules
from app.config import settings, create_upload_dirs
from app.database import init_db, get_db, SessionLocal
from app.api.v1 import health, recordings
from sqlalchemy.orm import Session

# Configure logging
logging.basicConfig(
    level=logging.INFO if settings.debug else logging.WARNING,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Lifespan events (startup/shutdown)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 Starting SOP Creator Backend...")
    
    # Initialize database
    try:
        init_db()
        logger.info("✅ Database initialized successfully")
    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")
        raise
    
    # Create upload directories
    try:
        create_upload_dirs()
        logger.info("✅ Upload directories created")
    except Exception as e:
        logger.error(f"❌ Upload directories creation failed: {e}")
    
    # Test database connection
    try:
        db = SessionLocal()
        db.execute("SELECT 1")
        db.close()
        logger.info("✅ Database connection test passed")
    except Exception as e:
        logger.error(f"❌ Database connection test failed: {e}")
    
    logger.info("🎉 Backend startup completed successfully!")
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down SOP Creator Backend...")

# Create FastAPI app
app = FastAPI(
    title="SOP Creator API",
    description="API for creating Standard Operating Procedures from screen recordings",
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    lifespan=lifespan
)

# CORS middleware - Allow Chrome extension requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    
    # Log request
    logger.info(f"📨 {request.method} {request.url}")
    
    # Process request
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        
        # Log response
        logger.info(f"📤 {request.method} {request.url} - {response.status_code} ({process_time:.3f}s)")
        
        return response
    except Exception as e:
        process_time = time.time() - start_time
        logger.error(f"💥 {request.method} {request.url} - ERROR: {e} ({process_time:.3f}s)")
        raise

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"💥 Unhandled exception: {exc}", exc_info=True)
    
    if settings.debug:
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "detail": str(exc),
                "type": type(exc).__name__
            }
        )
    else:
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error"}
        )

# Include API routes
app.include_router(health.router, prefix="/api/v1", tags=["Health"])
app.include_router(recordings.router, prefix="/api/v1", tags=["Recordings"])

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "SOP Creator API",
        "version": "1.0.0",
        "docs": "/docs" if settings.debug else None,
        "status": "running"
    }

# Debug endpoint (only in debug mode)
if settings.debug:
    @app.get("/debug/info")
    async def debug_info(db: Session = Depends(get_db)):
        """Debug endpoint to check system status"""
        try:
            # Test database query
            from app.models import Recording
            recording_count = db.query(Recording).count()
            
            return {
                "database": {
                    "url": settings.database_url,
                    "connection": "OK",
                    "recordings_count": recording_count
                },
                "config": {
                    "upload_dir": settings.upload_dir,
                    "max_file_size": f"{settings.max_file_size / 1024 / 1024:.1f} MB",
                    "debug": settings.debug,
                    "allowed_origins": settings.allowed_origins_list
                },
                "directories": {
                    "upload_dir_exists": __import__('os').path.exists(settings.upload_dir),
                    "videos_dir_exists": __import__('os').path.exists(f"{settings.upload_dir}/videos"),
                    "screenshots_dir_exists": __import__('os').path.exists(f"{settings.upload_dir}/screenshots")
                }
            }
        except Exception as e:
            logger.error(f"Debug info error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

# Development server runner
if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level="info" if settings.debug else "warning"
    )