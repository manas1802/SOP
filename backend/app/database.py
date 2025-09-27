# app/database.py
"""
Database connection and session management for SQLite
"""
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import os

from app.config import settings

# SQLite specific configuration
SQLALCHEMY_DATABASE_URL = settings.database_url

# Create engine with SQLite specific settings
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    # SQLite specific settings
    connect_args={
        "check_same_thread": False,  # Allow multiple threads
        "timeout": 20  # 20 second timeout
    },
    # Use StaticPool to maintain connection across requests
    poolclass=StaticPool,
    echo=settings.debug  # Log SQL queries in debug mode
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all models
Base = declarative_base()

def create_database():
    """Create all database tables"""
    print("🗄️ Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created successfully!")

def get_db():
    """
    Dependency to get database session
    Usage: db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initialize database with tables and sample data if needed"""
    create_database()
    
    # Create upload directories
    from app.config import create_upload_dirs
    create_upload_dirs()
    
    print("🚀 Database initialization completed!")
    