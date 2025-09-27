// src/shared/constants.js
/**
 * Application Constants and Configuration
 */

const CONSTANTS = {
    // API Configuration
    API: {
        BASE_URL: 'http://localhost:8000/api',
        TIMEOUT: 30000,
        RETRY_ATTEMPTS: 3,
        UPLOAD_TIMEOUT: 120000
    },

    // Recording Configuration
    RECORDING: {
        MAX_DURATION: 3600000, // 1 hour in milliseconds
        MIN_DURATION: 5000,    // 5 seconds
        SCREENSHOT_INTERVAL: 5000, // 5 seconds
        MAX_FILE_SIZE: 500 * 1024 * 1024, // 500MB
        SUPPORTED_FORMATS: ['webm', 'mp4'],
        DEFAULT_QUALITY: {
            video: {
                width: 1920,
                height: 1080,
                frameRate: 30,
                bitrate: 5000000 // 5 Mbps
            },
            audio: {
                sampleRate: 44100,
                bitrate: 128000 // 128 kbps
            }
        }
    },

    // Storage Configuration
    STORAGE: {
        MAX_SIZE: 100 * 1024 * 1024, // 100MB
        COMPRESSION_THRESHOLD: 1024 * 1024, // 1MB
        CLEANUP_DAYS: 7,
        MAX_SESSIONS: 50
    },

    // UI Configuration
    UI: {
        ANIMATION_DURATION: 300,
        DEBOUNCE_DELAY: 500,
        TOAST_DURATION: 5000,
        PROGRESS_UPDATE_INTERVAL: 100
    },

    // Tracking Configuration
    TRACKING: {
        CLICK_DEBOUNCE: 100,
        SCREENSHOT_COOLDOWN: 2000,
        MAX_CLICKS_PER_SESSION: 1000,
        SENSITIVE_FIELDS: [
            'password', 'passwd', 'pwd', 'secret', 'token', 'key',
            'credit', 'card', 'ssn', 'social', 'bank', 'account'
        ]
    },

    // Messages/Events
    MESSAGES: {
        START_RECORDING: 'start_recording',
        STOP_RECORDING: 'stop_recording',
        CLICK_CAPTURED: 'click_captured',
        SCREENSHOT_CAPTURED: 'screenshot_captured',
        TRACKER_INITIALIZED: 'tracker_initialized',
        RECORDING_ERROR: 'recording_error',
        PROCESSING_COMPLETE: 'processing_complete'
    },

    // Error Codes
    ERRORS: {
        RECORDING_NOT_SUPPORTED: 'RECORDING_NOT_SUPPORTED',
        PERMISSION_DENIED: 'PERMISSION_DENIED',
        STORAGE_FULL: 'STORAGE_FULL',
        UPLOAD_FAILED: 'UPLOAD_FAILED',
        PROCESSING_FAILED: 'PROCESSING_FAILED',
        INVALID_SESSION: 'INVALID_SESSION'
    }
};

// Make constants available globally
if (typeof window !== 'undefined') {
    window.CONSTANTS = CONSTANTS;
}
