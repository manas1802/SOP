import os
import subprocess
import asyncio
from typing import List

async def combine_chunks(chunk_dir: str, output_path: str, total_chunks: int) -> bool:
    """
    Combine video chunks into single file using ffmpeg
    """
    try:
        print(f"🔗 Combining {total_chunks} chunks into {output_path}")
        
        # Create list of chunk files
        chunk_files = []
        for i in range(1, total_chunks + 1):
            chunk_file = f"{chunk_dir}/chunk_{i:04d}.webm"
            if os.path.exists(chunk_file):
                chunk_files.append(chunk_file)
            else:
                print(f"⚠️ Missing chunk file: {chunk_file}")
        
        if not chunk_files:
            print("❌ No chunk files found")
            return False
        
        # Create file list for ffmpeg
        filelist_path = f"{chunk_dir}/filelist.txt"
        with open(filelist_path, 'w') as f:
            for chunk_file in chunk_files:
                f.write(f"file '{os.path.abspath(chunk_file)}'\n")
        
        # Use ffmpeg to concatenate
        cmd = [
            'ffmpeg',
            '-f', 'concat',
            '-safe', '0',
            '-i', filelist_path,
            '-c', 'copy',  # Copy without re-encoding for speed
            output_path,
            '-y'  # Overwrite output file
        ]
        
        print(f"🎬 Running ffmpeg command: {' '.join(cmd)}")
        
        # Run ffmpeg
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0:
            print(f"✅ Chunks combined successfully: {output_path}")
            
            # Clean up file list
            os.remove(filelist_path)
            return True
        else:
            print(f"❌ ffmpeg error: {stderr.decode()}")
            return False
            
    except Exception as e:
        print(f"❌ Combine chunks error: {e}")
        return False

def cleanup_chunks(chunk_dir: str, total_chunks: int):
    """
    Clean up individual chunk files after combining
    """
    try:
        print(f"🧹 Cleaning up {total_chunks} chunk files...")
        
        cleaned = 0
        for i in range(1, total_chunks + 1):
            chunk_file = f"{chunk_dir}/chunk_{i:04d}.webm"
            if os.path.exists(chunk_file):
                os.remove(chunk_file)
                cleaned += 1
        
        print(f"✅ Cleaned up {cleaned} chunk files")
        
    except Exception as e:
        print(f"⚠️ Cleanup error: {e}")
