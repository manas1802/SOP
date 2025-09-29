# Enhanced Storage Utilities - app/utils/storage_utils.py
"""
Storage utilities for file handling and management
"""
import os
import shutil
import aiofiles
from pathlib import Path
from typing import Union, List
from fastapi import UploadFile
import logging
import asyncio
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

async def save_upload_file(upload_file: UploadFile, destination: Union[str, Path]) -> Path:
    """
    Save uploaded file to destination with proper error handling
    """
    destination = Path(destination)
    
    try:
        # Ensure destination directory exists
        destination.parent.mkdir(parents=True, exist_ok=True)
        
        # Save file asynchronously in chunks to handle large files
        async with aiofiles.open(destination, 'wb') as f:
            chunk_size = 8192  # 8KB chunks
            while True:
                chunk = await upload_file.read(chunk_size)
                if not chunk:
                    break
                await f.write(chunk)
        
        # Reset file pointer for potential reuse
        await upload_file.seek(0)
        
        # Verify file was saved correctly
        if not destination.exists():
            raise Exception("File was not saved correctly")
        
        file_size = destination.stat().st_size
        if file_size == 0:
            raise Exception("Saved file is empty")
        
        logger.info(f"✅ File saved: {destination} ({file_size} bytes)")
        return destination
        
    except Exception as e:
        # Cleanup partial file on error
        if destination.exists():
            try:
                destination.unlink()
            except Exception:
                pass
        
        logger.error(f"❌ Failed to save file {destination}: {e}")
        raise

async def save_binary_data(data: bytes, destination: Union[str, Path]) -> Path:
    """
    Save binary data to destination
    """
    destination = Path(destination)
    
    try:
        # Ensure destination directory exists
        destination.parent.mkdir(parents=True, exist_ok=True)
        
        # Save data asynchronously
        async with aiofiles.open(destination, 'wb') as f:
            await f.write(data)
        
        logger.info(f"✅ Binary data saved: {destination} ({len(data)} bytes)")
        return destination
        
    except Exception as e:
        logger.error(f"❌ Failed to save binary data to {destination}: {e}")
        raise

async def read_file_async(file_path: Union[str, Path]) -> bytes:
    """
    Read file asynchronously
    """
    file_path = Path(file_path)
    
    try:
        async with aiofiles.open(file_path, 'rb') as f:
            content = await f.read()
        
        logger.info(f"✅ File read: {file_path} ({len(content)} bytes)")
        return content
        
    except Exception as e:
        logger.error(f"❌ Failed to read file {file_path}: {e}")
        raise

async def copy_file_async(source: Union[str, Path], destination: Union[str, Path]) -> Path:
    """
    Copy file asynchronously
    """
    source = Path(source)
    destination = Path(destination)
    
    try:
        # Ensure destination directory exists
        destination.parent.mkdir(parents=True, exist_ok=True)
        
        # Copy file
        await asyncio.get_event_loop().run_in_executor(
            None, shutil.copy2, str(source), str(destination)
        )
        
        logger.info(f"✅ File copied: {source} → {destination}")
        return destination
        
    except Exception as e:
        logger.error(f"❌ Failed to copy file {source} → {destination}: {e}")
        raise

async def move_file_async(source: Union[str, Path], destination: Union[str, Path]) -> Path:
    """
    Move file asynchronously
    """
    source = Path(source)
    destination = Path(destination)
    
    try:
        # Ensure destination directory exists
        destination.parent.mkdir(parents=True, exist_ok=True)
        
        # Move file
        await asyncio.get_event_loop().run_in_executor(
            None, shutil.move, str(source), str(destination)
        )
        
        logger.info(f"✅ File moved: {source} → {destination}")
        return destination
        
    except Exception as e:
        logger.error(f"❌ Failed to move file {source} → {destination}: {e}")
        raise

async def delete_file_safe(file_path: Union[str, Path]) -> bool:
    """
    Safely delete file with error handling
    """
    file_path = Path(file_path)
    
    try:
        if file_path.exists():
            if file_path.is_file():
                file_path.unlink()
                logger.info(f"🗑️ File deleted: {file_path}")
            elif file_path.is_dir():
                shutil.rmtree(file_path)
                logger.info(f"🗑️ Directory deleted: {file_path}")
            return True
        else:
            logger.warning(f"⚠️ File not found for deletion: {file_path}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Failed to delete {file_path}: {e}")
        return False

async def cleanup_old_files(directory: Union[str, Path], max_age_days: int = 7) -> int:
    """
    Cleanup files older than specified days
    """
    directory = Path(directory)
    
    if not directory.exists():
        return 0
    
    try:
        cutoff_time = datetime.now() - timedelta(days=max_age_days)
        deleted_count = 0
        
        for file_path in directory.rglob("*"):
            if file_path.is_file():
                file_time = datetime.fromtimestamp(file_path.stat().st_mtime)
                
                if file_time < cutoff_time:
                    try:
                        file_path.unlink()
                        deleted_count += 1
                        logger.info(f"🗑️ Deleted old file: {file_path}")
                    except Exception as e:
                        logger.error(f"❌ Failed to delete old file {file_path}: {e}")
        
        logger.info(f"✅ Cleanup completed: {deleted_count} files deleted")
        return deleted_count
        
    except Exception as e:
        logger.error(f"❌ Cleanup failed for {directory}: {e}")
        return 0

async def get_directory_size(directory: Union[str, Path]) -> int:
    """
    Get total size of directory in bytes
    """
    directory = Path(directory)
    
    if not directory.exists():
        return 0
    
    try:
        total_size = 0
        for file_path in directory.rglob("*"):
            if file_path.is_file():
                total_size += file_path.stat().st_size
        
        return total_size
        
    except Exception as e:
        logger.error(f"❌ Failed to calculate directory size {directory}: {e}")
        return 0

async def ensure_storage_space(directory: Union[str, Path], required_bytes: int) -> bool:
    """
    Ensure there's enough space in directory for new files
    """
    directory = Path(directory)
    
    try:
        # Get available space
        stat = shutil.disk_usage(directory)
        available_bytes = stat.free
        
        if available_bytes < required_bytes:
            logger.warning(f"⚠️ Insufficient space: {available_bytes} < {required_bytes}")
            
            # Try cleanup first
            await cleanup_old_files(directory, max_age_days=1)
            
            # Check again
            stat = shutil.disk_usage(directory)
            available_bytes = stat.free
            
            if available_bytes < required_bytes:
                logger.error(f"❌ Still insufficient space after cleanup")
                return False
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to check storage space: {e}")
        return False

def get_file_info(file_path: Union[str, Path]) -> dict:
    """
    Get file information
    """
    file_path = Path(file_path)
    
    try:
        if not file_path.exists():
            return {"exists": False}
        
        stat = file_path.stat()
        
        return {
            "exists": True,
            "size": stat.st_size,
            "created": datetime.fromtimestamp(stat.st_ctime),
            "modified": datetime.fromtimestamp(stat.st_mtime),
            "is_file": file_path.is_file(),
            "is_directory": file_path.is_dir(),
            "name": file_path.name,
            "suffix": file_path.suffix,
            "parent": str(file_path.parent)
        }
        
    except Exception as e:
        logger.error(f"❌ Failed to get file info for {file_path}: {e}")
        return {"exists": False, "error": str(e)}

async def create_backup(source: Union[str, Path], backup_dir: Union[str, Path]) -> Path:
    """
    Create backup of file or directory
    """
    source = Path(source)
    backup_dir = Path(backup_dir)
    
    try:
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"{source.name}_backup_{timestamp}"
        backup_path = backup_dir / backup_name
        
        if source.is_file():
            await copy_file_async(source, backup_path)
        elif source.is_dir():
            await asyncio.get_event_loop().run_in_executor(
                None, shutil.copytree, str(source), str(backup_path)
            )
        
        logger.info(f"✅ Backup created: {source} → {backup_path}")
        return backup_path
        
    except Exception as e:
        logger.error(f"❌ Failed to create backup of {source}: {e}")
        raise

async def validate_file_type(file_path: Union[str, Path], allowed_types: List[str]) -> bool:
    """
    Validate file type based on extension
    """
    file_path = Path(file_path)
    
    try:
        file_extension = file_path.suffix.lower()
        
        if file_extension in allowed_types:
            return True
        
        logger.warning(f"⚠️ Invalid file type: {file_extension} not in {allowed_types}")
        return False
        
    except Exception as e:
        logger.error(f"❌ Failed to validate file type for {file_path}: {e}")
        return False

async def compress_file(source: Union[str, Path], destination: Union[str, Path] = None) -> Path:
    """
    Compress file using gzip
    """
    import gzip
    
    source = Path(source)
    
    if destination is None:
        destination = source.with_suffix(source.suffix + '.gz')
    else:
        destination = Path(destination)
    
    try:
        async with aiofiles.open(source, 'rb') as f_in:
            content = await f_in.read()
        
        async with aiofiles.open(destination, 'wb') as f_out:
            compressed = gzip.compress(content)
            await f_out.write(compressed)
        
        logger.info(f"✅ File compressed: {source} → {destination}")
        return destination
        
    except Exception as e:
        logger.error(f"❌ Failed to compress file {source}: {e}")
        raise

async def decompress_file(source: Union[str, Path], destination: Union[str, Path] = None) -> Path:
    """
    Decompress gzip file
    """
    import gzip
    
    source = Path(source)
    
    if destination is None:
        if source.suffix == '.gz':
            destination = source.with_suffix('')
        else:
            destination = source.with_suffix('.decompressed')
    else:
        destination = Path(destination)
    
    try:
        async with aiofiles.open(source, 'rb') as f_in:
            compressed = await f_in.read()
        
        decompressed = gzip.decompress(compressed)
        
        async with aiofiles.open(destination, 'wb') as f_out:
            await f_out.write(decompressed)
        
        logger.info(f"✅ File decompressed: {source} → {destination}")
        return destination
        
    except Exception as e:
        logger.error(f"❌ Failed to decompress file {source}: {e}")
        raise

class StorageManager:
    """
    Centralized storage management class
    """
    
    def __init__(self, base_dir: Union[str, Path]):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
    
    async def save_file(self, upload_file: UploadFile, relative_path: str) -> Path:
        """Save file to storage"""
        destination = self.base_dir / relative_path
        return await save_upload_file(upload_file, destination)
    
    async def get_file(self, relative_path: str) -> bytes:
        """Get file from storage"""
        file_path = self.base_dir / relative_path
        return await read_file_async(file_path)
    
    async def delete_file(self, relative_path: str) -> bool:
        """Delete file from storage"""
        file_path = self.base_dir / relative_path
        return await delete_file_safe(file_path)
    
    async def list_files(self, relative_dir: str = "") -> List[dict]:
        """List files in directory"""
        directory = self.base_dir / relative_dir
        
        if not directory.exists():
            return []
        
        files = []
        for file_path in directory.iterdir():
            if file_path.is_file():
                files.append(get_file_info(file_path))
        
        return files
    
    async def cleanup(self, max_age_days: int = 7) -> int:
        """Cleanup old files"""
        return await cleanup_old_files(self.base_dir, max_age_days)
    
    def get_storage_info(self) -> dict:
        """Get storage information"""
        try:
            total_size = asyncio.run(get_directory_size(self.base_dir))
            disk_usage = shutil.disk_usage(self.base_dir)
            
            return {
                "base_dir": str(self.base_dir),
                "total_size": total_size,
                "available_space": disk_usage.free,
                "total_space": disk_usage.total,
                "used_space": disk_usage.used
            }
        except Exception as e:
            logger.error(f"❌ Failed to get storage info: {e}")
            return {"error": str(e)}

# Utility functions for specific file types

async def save_video_chunk(chunk_data: bytes, session_id: str, chunk_index: int, base_dir: Path) -> Path:
    """Save video chunk with specific naming convention"""
    chunk_dir = base_dir / "videos" / session_id
    chunk_dir.mkdir(parents=True, exist_ok=True)
    
    chunk_filename = f"chunk_{chunk_index:06d}.webm"
    chunk_path = chunk_dir / chunk_filename
    
    return await save_binary_data(chunk_data, chunk_path)

async def save_screenshot(image_data: bytes, session_id: str, screenshot_id: str, base_dir: Path) -> Path:
    """Save screenshot with specific naming convention"""
    screenshot_dir = base_dir / "screenshots" / session_id
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    
    screenshot_filename = f"screenshot_{screenshot_id}.png"
    screenshot_path = screenshot_dir / screenshot_filename
    
    return await save_binary_data(image_data, screenshot_path)

async def save_json_data(data: dict, relative_path: str, base_dir: Path) -> Path:
    """Save JSON data to file"""
    import json
    
    file_path = base_dir / relative_path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        async with aiofiles.open(file_path, 'w') as f:
            await f.write(json.dumps(data, indent=2))
        
        logger.info(f"✅ JSON data saved: {file_path}")
        return file_path
        
    except Exception as e:
        logger.error(f"❌ Failed to save JSON data to {file_path}: {e}")
        raise

async def load_json_data(relative_path: str, base_dir: Path) -> dict:
    """Load JSON data from file"""
    import json
    
    file_path = base_dir / relative_path
    
    try:
        async with aiofiles.open(file_path, 'r') as f:
            content = await f.read()
        
        data = json.loads(content)
        logger.info(f"✅ JSON data loaded: {file_path}")
        return data
        
    except Exception as e:
        logger.error(f"❌ Failed to load JSON data from {file_path}: {e}")
        raise