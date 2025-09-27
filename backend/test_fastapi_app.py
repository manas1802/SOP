#!/usr/bin/env python3
"""
Test script for FastAPI application
Run this to test all endpoints before connecting Chrome extension
"""

import requests
import json
import time
from io import BytesIO

# API base URL
BASE_URL = "http://localhost:8000"

def test_server_connection():
    """Test if server is running"""
    print("🔌 Testing server connection...")
    
    try:
        response = requests.get(f"{BASE_URL}/", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Server is running: {data['message']}")
            return True
        else:
            print(f"❌ Server returned status code: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to server. Is it running?")
        print("   Start server with: python -m app.main")
        return False
    except Exception as e:
        print(f"❌ Connection error: {e}")
        return False

def test_health_endpoints():
    """Test health check endpoints"""
    print("\n🏥 Testing health endpoints...")
    
    # Basic health check
    try:
        response = requests.get(f"{BASE_URL}/api/v1/health")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Basic health check: {data['status']}")
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check error: {e}")
        return False
    
    # Detailed health check
    try:
        response = requests.get(f"{BASE_URL}/api/v1/health/detailed")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Detailed health check: {data['status']}")
            print(f"   Database recordings: {data['database']['recordings_count']}")
            print(f"   Memory usage: {data['system']['memory_usage_percent']}%")
            print(f"   Upload directory: {'✅' if data['storage']['upload_dir_exists'] else '❌'}")
        else:
            print(f"❌ Detailed health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Detailed health check error: {e}")
        return False
    
    return True

def test_recordings_list():
    """Test recordings list endpoint"""
    print("\n📋 Testing recordings list...")
    
    try:
        response = requests.get(f"{BASE_URL}/api/v1/recordings")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Recordings list: {data['total']} recordings found")
            
            # Show first recording if exists
            if data['recordings']:
                first_recording = data['recordings'][0]
                print(f"   Latest: {first_recording['title']} (ID: {first_recording['id']})")
            
            return True
        else:
            print(f"❌ Recordings list failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Recordings list error: {e}")
        return False

def test_recording_upload():
    """Test recording upload endpoint (simulating Chrome extension)"""
    print("\n📤 Testing recording upload (simulating Chrome extension)...")
    
    # Sample data that your Chrome extension would send
    sample_metadata = {
        "title": "Test Upload from API Test",
        "description": "Testing the upload endpoint",
        "url": "https://example.com/test-page",
        "page_title": "Test Page",
        "browser_info": {
            "browser": "chrome",
            "version": "118.0",
            "extension_version": "1.0.0"
        }
    }
    
    sample_clicks = [
        {
            "timestamp": time.time() - 10,
            "relative_time": 1000,
            "url": "https://example.com/test-page",
            "page_title": "Test Page",
            "element_data": {
                "tagName": "button",
                "text": "Test Button",
                "selector": "#test-btn",
                "bounds": {"x": 100, "y": 200, "width": 80, "height": 30}
            },
            "click_x": 140,
            "click_y": 215
        },
        {
            "timestamp": time.time() - 5,
            "relative_time": 6000,
            "url": "https://example.com/test-page",
            "page_title": "Test Page",
            "element_data": {
                "tagName": "input",
                "text": "",
                "selector": "#email-input",
                "type": "email"
            },
            "click_x": 200,
            "click_y": 300
        }
    ]
    
    sample_screenshots = [
        {
            "description": "Initial page load",
            "timestamp": time.time() - 8,
            "relative_time": 2000,
            "capture_type": "page_load"
        },
        {
            "description": "After button click",
            "timestamp": time.time() - 3,
            "relative_time": 8000,
            "capture_type": "click"
        }
    ]
    
    # Create a small fake video file
    fake_video_content = b"FAKE_WEBM_CONTENT_FOR_TESTING"
    fake_video = BytesIO(fake_video_content)
    fake_video.name = "test_recording.webm"
    
    try:
        # Prepare form data (exactly like Chrome extension will send)
        files = {
            'video': (fake_video.name, fake_video, 'video/webm')
        }
        
        data = {
            'session_id': f'test_session_{int(time.time())}',
            'metadata': json.dumps(sample_metadata),
            'click_data': json.dumps(sample_clicks),
            'screenshot_data': json.dumps(sample_screenshots)
        }
        
        print(f"   Uploading session: {data['session_id']}")
        print(f"   Video size: {len(fake_video_content)} bytes")
        print(f"   Clicks: {len(sample_clicks)}")
        print(f"   Screenshots: {len(sample_screenshots)}")
        
        response = requests.post(f"{BASE_URL}/api/v1/recordings/upload", files=files, data=data)
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Upload successful!")
            print(f"   Recording ID: {result['recording_id']}")
            print(f"   Status: {result['status']}")
            print(f"   Message: {result['message']}")
            return result['recording_id']
        else:
            print(f"❌ Upload failed: {response.status_code}")
            try:
                error_data = response.json()
                print(f"   Error: {error_data}")
            except:
                print(f"   Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Upload error: {e}")
        return None

def test_recording_retrieval(recording_id):
    """Test retrieving a specific recording"""
    print(f"\n📖 Testing recording retrieval (ID: {recording_id})...")
    
    try:
        response = requests.get(f"{BASE_URL}/api/v1/recordings/{recording_id}")
        if response.status_code == 200:
            data = response.json()
            recording = data['recording']
            print(f"✅ Recording retrieved: {recording['title']}")
            print(f"   Session ID: {recording['session_id']}")
            print(f"   Status: {recording['status']}")
            print(f"   Clicks: {len(data['clicks'])}")
            print(f"   Screenshots: {len(data['screenshots'])}")
            print(f"   Has transcript: {'Yes' if data['transcript'] else 'No'}")
            print(f"   SOPs: {len(data['sops'])}")
            return True
        else:
            print(f"❌ Recording retrieval failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Recording retrieval error: {e}")
        return False

def test_debug_endpoint():
    """Test debug endpoint (if available)"""
    print("\n🐛 Testing debug endpoint...")
    
    try:
        response = requests.get(f"{BASE_URL}/debug/info")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Debug info retrieved")
            print(f"   Database URL: {data['database']['url']}")
            print(f"   Upload dir: {data['config']['upload_dir']}")
            print(f"   Max file size: {data['config']['max_file_size']}")
            print(f"   Debug mode: {data['config']['debug']}")
            return True
        elif response.status_code == 404:
            print("ℹ️  Debug endpoint not available (not in debug mode)")
            return True
        else:
            print(f"❌ Debug endpoint failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Debug endpoint error: {e}")
        return False

def main():
    """Run all API tests"""
    print("🧪 Testing FastAPI Application")
    print("=" * 50)
    
    tests = [
        ("Server Connection", test_server_connection),
        ("Health Endpoints", test_health_endpoints),
        ("Recordings List", test_recordings_list),
        ("Debug Endpoint", test_debug_endpoint)
    ]
    
    # Run basic tests first
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print()
        if test_func():
            passed += 1
        time.sleep(0.5)  # Small delay between tests
    
    # Test upload if basic tests pass
    if passed == total:
        print("\n" + "=" * 30)
        print("🚀 Running Upload Test (Chrome Extension Simulation)")
        print("=" * 30)
        
        recording_id = test_recording_upload()
        if recording_id:
            test_recording_retrieval(recording_id)
            passed += 2
            total += 2
    
    # Results
    print("\n" + "=" * 50)
    print(f"🏁 Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! Your FastAPI app is ready!")
        print("\n📡 Your Chrome extension can now connect to:")
        print(f"   Upload URL: {BASE_URL}/api/v1/recordings/upload")
        print(f"   API Docs: {BASE_URL}/docs")
        print("\n🚀 Ready for Task 4: File upload processing!")
    else:
        print("⚠️  Some tests failed. Check the errors above.")
        return False
    
    return True

if __name__ == "__main__":
    main()