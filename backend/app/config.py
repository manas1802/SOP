from pydantic_settings import BaseSettings
from typing import List, Optional
import os

class Settings(BaseSettings):
    # Database - SQLite (single file, no external service)
    database_url: str = "sqlite:///./sop_creator.db"
    
    # File Storage  
    upload_dir: str = "./uploads"
    max_file_size: int = 500_000_000  # 500MB
    
    # AI Services
    openai_api_key: Optional[str] = None
    whisper_model: str = "base"
    
    # CORS - Parse comma-separated string into list
    allowed_origins: str = "http://localhost:3000,chrome-extension://*"
    
    # Application
    debug: bool = True
    log_level: str = "INFO"
    
    # Processing (direct, no background tasks)
    process_immediately: bool = True
    
    class Config:
        env_file = ".env"
    
    @property
    def allowed_origins_list(self) -> List[str]:
        """Convert comma-separated origins to list"""
        return [origin.strip() for origin in self.allowed_origins.split(",")]
    
    @property
    def allowed_extensions(self) -> List[str]:
        """Hardcoded allowed extensions for now"""
        return [".webm", ".mp4", ".avi", ".mov"]

# Create upload directories
def create_upload_dirs():
    """Create necessary upload directories"""
    import os
    
    dirs = [
        settings.upload_dir,
        f"{settings.upload_dir}/videos",
        f"{settings.upload_dir}/audio", 
        f"{settings.upload_dir}/screenshots",
        f"{settings.upload_dir}/exports"
    ]
    
    for dir_path in dirs:
        os.makedirs(dir_path, exist_ok=True)
        
    print(f"✅ Upload directories created at: {settings.upload_dir}")

settings = Settings()

# Validate settings on import
print(f"🔧 Configuration loaded:")
print(f"   Database: {settings.database_url}")
print(f"   Upload dir: {settings.upload_dir}")
print(f"   Debug mode: {settings.debug}")
print(f"   Allowed origins: {settings.allowed_origins_list}")
print(f"   Allowed extensions: {settings.allowed_extensions}")

# ===== Alternative: Even Simpler .env (if still having issues) =====
"""
# If you're still getting errors, replace your .env with this minimal version:

DATABASE_URL=sqlite:///./sop_creator.db
UPLOAD_DIR=uploads
DEBUG=true
OPENAI_API_KEY=your_openai_api_key_here
"""