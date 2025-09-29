# Enhanced Video Processing - app/utils/video_utils.py
"""
Video processing utilities with ffmpeg integration
"""
import os
import asyncio
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Union
import logging
import json

logger = logging.getLogger(__name__)

async def combine_video_chunks(chunk_dir: str, output_path: str, total_chunks: int) -> bool:
    """
    Combine video chunks into single file using ffmpeg
    """
    try:
        chunk_path = Path(chunk_dir)
        output_file = Path(output_path)
        
        print(f"🔗 Combining chunks from {chunk_dir} into {output_path}")
        
        # Find all chunk files
        chunk_files = []
        for i in range(1, total_chunks + 1):
            # Try different naming patterns
            patterns = [
                f"chunk_{i:06d}.webm",
                f"chunk_{i:04d}.webm", 
                f"chunk_{i}.webm"
            ]
            
            for pattern in patterns:
                chunk_file = chunk_path / pattern
                if chunk_file.exists():
                    chunk_files.append(chunk_file)
                    break
        
        if not chunk_files:
            # Fallback: find all webm files and sort them
            chunk_files = sorted(chunk_path.glob("chunk_*.webm"))
        
        if not chunk_files:
            print(f"❌ No chunk files found in {chunk_dir}")
            return False
        
        print(f"📁 Found {len(chunk_files)} chunk files")
        
        # Ensure output directory exists
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Method 1: Try simple concatenation for webm files
        if await try_simple_concat(chunk_files, output_file):
            return True
        
        # Method 2: Try ffmpeg concat demuxer
        if await try_ffmpeg_concat(chunk_files, output_file):
            return True
        
        # Method 3: Try ffmpeg filter complex
        if await try_ffmpeg_filter(chunk_files, output_file):
            return True
        
        print(f"❌ All combination methods failed")
        return False
        
    except Exception as e:
        print(f"❌ Video combination error: {e}")
        return False

async def try_simple_concat(chunk_files: List[Path], output_file: Path) -> bool:
    """
    Try simple binary concatenation for webm files
    """
    try:
        print("🔄 Trying simple concatenation...")
        
        with open(output_file, 'wb') as outfile:
            for chunk_file in chunk_files:
                with open(chunk_file, 'rb') as infile:
                    outfile.write(infile.read())
        
        # Verify output file
        if output_file.exists() and output_file.stat().st_size > 0:
            print(f"✅ Simple concatenation successful: {output_file}")
            return True
        
        return False
        
    except Exception as e:
        print(f"⚠️ Simple concatenation failed: {e}")
        return False

async def try_ffmpeg_concat(chunk_files: List[Path], output_file: Path) -> bool:
    """
    Try ffmpeg concat demuxer method
    """
    try:
        print("🔄 Trying ffmpeg concat demuxer...")
        
        # Create file list for ffmpeg
        filelist_path = output_file.parent / "filelist.txt"
        
        with open(filelist_path, 'w') as f:
            for chunk_file in chunk_files:
                # Use absolute paths to avoid issues
                abs_path = chunk_file.resolve()
                f.write(f"file '{abs_path}'\n")
        
        # FFmpeg command
        cmd = [
            'ffmpeg',
            '-f', 'concat',
            '-safe', '0',
            '-i', str(filelist_path),
            '-c', 'copy',  # Copy streams without re-encoding
            '-avoid_negative_ts', 'make_zero',
            str(output_file),
            '-y'  # Overwrite output file
        ]
        
        # Run ffmpeg
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        # Cleanup filelist
        try:
            filelist_path.unlink()
        except Exception:
            pass
        
        if process.returncode == 0 and output_file.exists():
            print(f"✅ FFmpeg concat successful: {output_file}")
            return True
        else:
            print(f"⚠️ FFmpeg concat failed: {stderr.decode()}")
            return False
            
    except Exception as e:
        print(f"⚠️ FFmpeg concat error: {e}")
        return False

async def try_ffmpeg_filter(chunk_files: List[Path], output_file: Path) -> bool:
    """
    Try ffmpeg filter complex method
    """
    try:
        print("🔄 Trying ffmpeg filter complex...")
        
        # Limit number of inputs to avoid command line length issues
        if len(chunk_files) > 50:
            print(f"⚠️ Too many chunks ({len(chunk_files)}), using concat method")
            return False
        
        # Build ffmpeg command with filter
        cmd = ['ffmpeg']
        
        # Add input files
        for chunk_file in chunk_files:
            cmd.extend(['-i', str(chunk_file)])
        
        # Build filter complex
        filter_parts = []
        for i in range(len(chunk_files)):
            filter_parts.append(f"[{i}:v] [{i}:a]")
        
        filter_complex = f"{''.join(filter_parts)} concat=n={len(chunk_files)}:v=1:a=1 [v] [a]"
        
        cmd.extend([
            '-filter_complex', filter_complex,
            '-map', '[v]',
            '-map', '[a]',
            '-c:v', 'libvpx-vp9',
            '-c:a', 'libopus',
            str(output_file),
            '-y'
        ])
        
        # Run ffmpeg
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0 and output_file.exists():
            print(f"✅ FFmpeg filter successful: {output_file}")
            return True
        else:
            print(f"⚠️ FFmpeg filter failed: {stderr.decode()}")
            return False
            
    except Exception as e:
        print(f"⚠️ FFmpeg filter error: {e}")
        return False

async def get_video_info(video_path: str) -> Dict:
    """
    Get video information using ffprobe
    """
    try:
        cmd = [
            'ffprobe',
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            video_path
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            raise Exception(f"ffprobe failed: {stderr.decode()}")
        
        data = json.loads(stdout.decode())
        
        # Extract useful information
        format_info = data.get('format', {})
        streams = data.get('streams', [])
        
        video_stream = next((s for s in streams if s.get('codec_type') == 'video'), {})
        audio_stream = next((s for s in streams if s.get('codec_type') == 'audio'), {})
        
        return {
            'duration': float(format_info.get('duration', 0)),
            'size': int(format_info.get('size', 0)),
            'bitrate': int(format_info.get('bit_rate', 0)),
            'format_name': format_info.get('format_name', ''),
            'video': {
                'codec': video_stream.get('codec_name', ''),
                'width': int(video_stream.get('width', 0)),
                'height': int(video_stream.get('height', 0)),
                'fps': eval(video_stream.get('r_frame_rate', '0/1')) if video_stream.get('r_frame_rate') else 0,
                'bitrate': int(video_stream.get('bit_rate', 0))
            },
            'audio': {
                'codec': audio_stream.get('codec_name', ''),
                'sample_rate': int(audio_stream.get('sample_rate', 0)),
                'channels': int(audio_stream.get('channels', 0)),
                'bitrate': int(audio_stream.get('bit_rate', 0))
            }
        }
        
    except Exception as e:
        logger.error(f"❌ Failed to get video info for {video_path}: {e}")
        return {
            'duration': 0,
            'size': 0,
            'error': str(e)
        }

async def optimize_video(video_path: str, output_path: Optional[str] = None) -> bool:
    """
    Optimize video for web playback
    """
    try:
        input_path = Path(video_path)
        
        if output_path:
            output_file = Path(output_path)
        else:
            output_file = input_path.with_suffix('.optimized' + input_path.suffix)
        
        print(f"🎯 Optimizing video: {input_path} → {output_file}")
        
        cmd = [
            'ffmpeg',
            '-i', str(input_path),
            '-c:v', 'libvpx-vp9',  # VP9 codec for better compression
            '-crf', '30',  # Quality setting (lower = better quality)
            '-b:v', '2M',  # Target bitrate
            '-c:a', 'libopus',  # Opus audio codec
            '-b:a', '128k',  # Audio bitrate
            '-movflags', '+faststart',  # Enable fast start for web
            '-threads', '4',  # Use 4 threads
            str(output_file),
            '-y'
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0 and output_file.exists():
            # Replace original if optimization successful and smaller
            original_size = input_path.stat().st_size
            optimized_size = output_file.stat().st_size
            
            if optimized_size < original_size * 0.9:  # At least 10% reduction
                output_file.replace(input_path)
                print(f"✅ Video optimized: {original_size} → {optimized_size} bytes")
            else:
                output_file.unlink()  # Remove optimization if not beneficial
                print(f"ℹ️ Optimization not beneficial, keeping original")
            
            return True
        else:
            print(f"⚠️ Video optimization failed: {stderr.decode()}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Video optimization error: {e}")
        return False

async def create_video_thumbnail(video_path: str, output_path: str, time_offset: float = 10.0) -> bool:
    """
    Create thumbnail from video at specified time offset
    """
    try:
        input_path = Path(video_path)
        output_file = Path(output_path)
        
        # Ensure output directory exists
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        print(f"📸 Creating thumbnail: {input_path} → {output_file}")
        
        cmd = [
            'ffmpeg',
            '-i', str(input_path),
            '-ss', str(time_offset),  # Seek to time offset
            '-vframes', '1',  # Extract 1 frame
            '-vf', 'scale=320:240',  # Resize to thumbnail size
            '-q:v', '2',  # High quality
            str(output_file),
            '-y'
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0 and output_file.exists():
            print(f"✅ Thumbnail created: {output_file}")
            return True
        else:
            print(f"⚠️ Thumbnail creation failed: {stderr.decode()}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Thumbnail creation error: {e}")
        return False

async def extract_audio(video_path: str, output_path: str) -> bool:
    """
    Extract audio from video for transcription
    """
    try:
        input_path = Path(video_path)
        output_file = Path(output_path)
        
        # Ensure output directory exists
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        print(f"🎵 Extracting audio: {input_path} → {output_file}")
        
        cmd = [
            'ffmpeg',
            '-i', str(input_path),
            '-vn',  # No video
            '-acodec', 'pcm_s16le',  # PCM format for Whisper
            '-ar', '16000',  # 16kHz sample rate
            '-ac', '1',  # Mono
            str(output_file),
            '-y'
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0 and output_file.exists():
            print(f"✅ Audio extracted: {output_file}")
            return True
        else:
            print(f"⚠️ Audio extraction failed: {stderr.decode()}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Audio extraction error: {e}")
        return False

async def convert_video_format(input_path: str, output_path: str, target_format: str = "mp4") -> bool:
    """
    Convert video to different format
    """
    try:
        input_file = Path(input_path)
        output_file = Path(output_path)
        
        print(f"🔄 Converting video: {input_file} → {output_file} ({target_format})")
        
        # Choose codec based on target format
        if target_format.lower() == "mp4":
            video_codec = "libx264"
            audio_codec = "aac"
        elif target_format.lower() == "webm":
            video_codec = "libvpx-vp9"
            audio_codec = "libopus"
        else:
            video_codec = "copy"
            audio_codec = "copy"
        
        cmd = [
            'ffmpeg',
            '-i', str(input_file),
            '-c:v', video_codec,
            '-c:a', audio_codec,
            '-preset', 'fast',
            str(output_file),
            '-y'
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0 and output_file.exists():
            print(f"✅ Video converted: {output_file}")
            return True
        else:
            print(f"⚠️ Video conversion failed: {stderr.decode()}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Video conversion error: {e}")
        return False

async def validate_video_file(video_path: str) -> Dict:
    """
    Validate video file integrity
    """
    try:
        file_path = Path(video_path)
        
        if not file_path.exists():
            return {"valid": False, "error": "File does not exist"}
        
        if file_path.stat().st_size == 0:
            return {"valid": False, "error": "File is empty"}
        
        # Try to get video info to validate
        video_info = await get_video_info(video_path)
        
        if "error" in video_info:
            return {"valid": False, "error": video_info["error"]}
        
        # Check if video has reasonable duration
        if video_info.get("duration", 0) <= 0:
            return {"valid": False, "error": "Invalid duration"}
        
        # Check if video has video stream
        if video_info.get("video", {}).get("width", 0) <= 0:
            return {"valid": False, "error": "No valid video stream"}
        
        return {
            "valid": True,
            "duration": video_info["duration"],
            "size": video_info["size"],
            "resolution": f"{video_info['video']['width']}x{video_info['video']['height']}",
            "codec": video_info["video"]["codec"]
        }
        
    except Exception as e:
        return {"valid": False, "error": str(e)}

async def repair_video(input_path: str, output_path: str) -> bool:
    """
    Try to repair corrupted video file
    """
    try:
        input_file = Path(input_path)
        output_file = Path(output_path)
        
        print(f"🔧 Repairing video: {input_file} → {output_file}")
        
        cmd = [
            'ffmpeg',
            '-err_detect', 'ignore_err',
            '-i', str(input_file),
            '-c', 'copy',
            '-avoid_negative_ts', 'make_zero',
            str(output_file),
            '-y'
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0 and output_file.exists():
            # Validate repaired file
            validation = await validate_video_file(str(output_file))
            if validation["valid"]:
                print(f"✅ Video repaired: {output_file}")
                return True
            else:
                print(f"⚠️ Repair unsuccessful: {validation['error']}")
                return False
        else:
            print(f"⚠️ Video repair failed: {stderr.decode()}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Video repair error: {e}")
        return False

async def get_video_frames(video_path: str, output_dir: str, interval: float = 10.0) -> List[str]:
    """
    Extract frames from video at specified intervals
    """
    try:
        input_path = Path(video_path)
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        print(f"🎞️ Extracting frames from: {input_path}")
        
        cmd = [
            'ffmpeg',
            '-i', str(input_path),
            '-vf', f'fps=1/{interval}',  # Extract 1 frame every interval seconds
            '-q:v', '2',  # High quality
            str(output_path / 'frame_%04d.jpg'),
            '-y'
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0:
            # Get list of created frame files
            frame_files = sorted(output_path.glob('frame_*.jpg'))
            frame_paths = [str(f) for f in frame_files]
            
            print(f"✅ Extracted {len(frame_paths)} frames")
            return frame_paths
        else:
            print(f"⚠️ Frame extraction failed: {stderr.decode()}")
            return []
            
    except Exception as e:
        logger.error(f"❌ Frame extraction error: {e}")
        return []

class VideoProcessor:
    """
    Centralized video processing class
    """
    
    def __init__(self, work_dir: Union[str, Path]):
        self.work_dir = Path(work_dir)
        self.work_dir.mkdir(parents=True, exist_ok=True)
        self.temp_dir = self.work_dir / "temp"
        self.temp_dir.mkdir(exist_ok=True)
    
    async def process_recording(self, session_id: str, chunk_dir: str) -> Dict:
        """
        Complete processing of a recording session
        """
        try:
            print(f"🎬 Processing recording session: {session_id}")
            
            # Setup paths
            session_dir = self.work_dir / session_id
            session_dir.mkdir(exist_ok=True)
            
            final_video = session_dir / "recording.webm"
            audio_file = session_dir / "audio.wav"
            thumbnail = session_dir / "thumbnail.jpg"
            
            # Step 1: Combine chunks
            chunk_files = list(Path(chunk_dir).glob("chunk_*.webm"))
            total_chunks = len(chunk_files)
            
            if total_chunks == 0:
                raise Exception("No chunks found to process")
            
            success = await combine_video_chunks(chunk_dir, str(final_video), total_chunks)
            if not success:
                raise Exception("Failed to combine video chunks")
            
            # Step 2: Validate video
            validation = await validate_video_file(str(final_video))
            if not validation["valid"]:
                # Try to repair
                repaired_video = session_dir / "recording_repaired.webm"
                if await repair_video(str(final_video), str(repaired_video)):
                    final_video = repaired_video
                else:
                    raise Exception(f"Invalid video: {validation['error']}")
            
            # Step 3: Get video info
            video_info = await get_video_info(str(final_video))
            
            # Step 4: Create thumbnail
            await create_video_thumbnail(str(final_video), str(thumbnail))
            
            # Step 5: Extract audio for transcription
            await extract_audio(str(final_video), str(audio_file))
            
            # Step 6: Optimize video
            await optimize_video(str(final_video))
            
            # Cleanup temp files
            await self.cleanup_temp_files()
            
            return {
                "success": True,
                "video_path": str(final_video),
                "audio_path": str(audio_file) if audio_file.exists() else None,
                "thumbnail_path": str(thumbnail) if thumbnail.exists() else None,
                "video_info": video_info,
                "session_dir": str(session_dir)
            }
            
        except Exception as e:
            logger.error(f"❌ Recording processing failed for {session_id}: {e}")
            return {
                "success": False,
                "error": str(e),
                "session_id": session_id
            }
    
    async def cleanup_temp_files(self):
        """Clean up temporary files"""
        try:
            import shutil
            if self.temp_dir.exists():
                shutil.rmtree(self.temp_dir)
                self.temp_dir.mkdir()
            print("🧹 Temp files cleaned up")
        except Exception as e:
            logger.error(f"⚠️ Temp cleanup error: {e}")
    
    async def get_processing_status(self, session_id: str) -> Dict:
        """Get processing status for a session"""
        session_dir = self.work_dir / session_id
        
        if not session_dir.exists():
            return {"status": "not_found"}
        
        files_status = {
            "video": (session_dir / "recording.webm").exists(),
            "audio": (session_dir / "audio.wav").exists(),
            "thumbnail": (session_dir / "thumbnail.jpg").exists()
        }
        
        if all(files_status.values()):
            return {"status": "completed", "files": files_status}
        elif any(files_status.values()):
            return {"status": "processing", "files": files_status}
        else:
            return {"status": "pending", "files": files_status}

# Utility functions for checking ffmpeg availability

async def check_ffmpeg_available() -> bool:
    """Check if ffmpeg is available"""
    try:
        process = await asyncio.create_subprocess_exec(
            'ffmpeg', '-version',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await process.communicate()
        return process.returncode == 0
    except Exception:
        return False

async def check_ffprobe_available() -> bool:
    """Check if ffprobe is available"""
    try:
        process = await asyncio.create_subprocess_exec(
            'ffprobe', '-version',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await process.communicate()
        return process.returncode == 0
    except Exception:
        return False

async def get_ffmpeg_version() -> str:
    """Get ffmpeg version"""
    try:
        process = await asyncio.create_subprocess_exec(
            'ffmpeg', '-version',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await process.communicate()
        
        if process.returncode == 0:
            # Extract version from first line
            first_line = stdout.decode().split('\n')[0]
            return first_line.split(' ')[2] if len(first_line.split(' ')) > 2 else "unknown"
        
        return "not available"
    except Exception:
        return "error"

# Cleanup function for old chunk files
async def cleanup_old_chunks(chunk_dir: str, keep_latest: int = 5):
    """
    Cleanup old chunk files to save disk space
    """
    try:
        chunk_path = Path(chunk_dir)
        if not chunk_path.exists():
            return
        
        chunk_files = sorted(chunk_path.glob("chunk_*.webm"))
        
        if len(chunk_files) > keep_latest:
            files_to_delete = chunk_files[:-keep_latest]
            
            for file_path in files_to_delete:
                try:
                    file_path.unlink()
                    print(f"🗑️ Deleted old chunk: {file_path}")
                except Exception as e:
                    print(f"⚠️ Could not delete {file_path}: {e}")
            
            print(f"✅ Cleanup completed: {len(files_to_delete)} chunks removed")
    
    except Exception as e:
        logger.error(f"❌ Chunk cleanup error: {e}")

# Initialize video processor singleton
def get_video_processor(work_dir: str = "./video_processing") -> VideoProcessor:
    """Get video processor instance"""
    if not hasattr(get_video_processor, "_instance"):
        get_video_processor._instance = VideoProcessor(work_dir)
    return get_video_processor._instance