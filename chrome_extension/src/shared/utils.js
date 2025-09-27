
// src/shared/utils.js
/**
 * Utility Functions for SOP Creator
 */

const Utils = {
    /**
     * Generate unique session ID
     */
    generateSessionId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `sop_${timestamp}_${random}`;
    },

    /**
     * Format duration from milliseconds to readable string
     */
    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
        }
    },

    /**
     * Format file size in bytes to readable string
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Debounce function execution
     */
    debounce(func, wait, immediate = false) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) func(...args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func(...args);
        };
    },

    /**
     * Throttle function execution
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Sleep/delay utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Check if value is empty
     */
    isEmpty(value) {
        return value == null || 
               (typeof value === 'string' && value.trim() === '') ||
               (Array.isArray(value) && value.length === 0) ||
               (typeof value === 'object' && Object.keys(value).length === 0);
    },

    /**
     * Deep clone object
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        if (typeof obj === 'object') {
            const cloned = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    cloned[key] = this.deepClone(obj[key]);
                }
            }
            return cloned;
        }
        return obj;
    },

    /**
     * Sanitize filename for download
     */
    sanitizeFilename(filename) {
        return filename
            .replace(/[^a-z0-9\-_\.]/gi, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_|_$/g, '');
    },

    /**
     * Convert data URL to blob
     */
    dataURLtoBlob(dataURL) {
        const arr = dataURL.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        
        return new Blob([u8arr], { type: mime });
    },

    /**
     * Download blob as file
     */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.sanitizeFilename(filename);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Get current timestamp in ISO format
     */
    getCurrentTimestamp() {
        return new Date().toISOString();
    },

    /**
     * Format timestamp for display
     */
    formatTimestamp(timestamp, format = 'datetime') {
        const date = new Date(timestamp);
        
        switch (format) {
            case 'time':
                return date.toLocaleTimeString();
            case 'date':
                return date.toLocaleDateString();
            case 'datetime':
                return date.toLocaleString();
            case 'relative':
                return this.getRelativeTime(timestamp);
            default:
                return date.toLocaleString();
        }
    },

    /**
     * Get relative time (e.g., "2 minutes ago")
     */
    getRelativeTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        
        const minute = 60 * 1000;
        const hour = minute * 60;
        const day = hour * 24;
        const week = day * 7;
        const month = day * 30;
        const year = day * 365;
        
        if (diff < minute) return 'Just now';
        if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
        if (diff < day) return `${Math.floor(diff / hour)}h ago`;
        if (diff < week) return `${Math.floor(diff / day)}d ago`;
        if (diff < month) return `${Math.floor(diff / week)}w ago`;
        if (diff < year) return `${Math.floor(diff / month)}mo ago`;
        return `${Math.floor(diff / year)}y ago`;
    },

    /**
     * Validate email format
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    /**
     * Validate URL format
     */
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },

    /**
     * Get file extension from filename
     */
    getFileExtension(filename) {
        return filename.split('.').pop()?.toLowerCase() || '';
    },

    /**
     * Check if browser supports required features
     */
    checkBrowserSupport() {
        const required = [
            'MediaRecorder',
            'getUserMedia',
            'desktopCapture'
        ];
        
        const support = {
            mediaRecorder: typeof MediaRecorder !== 'undefined',
            getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            desktopCapture: !!(chrome && chrome.desktopCapture),
            webRTC: !!(window.RTCPeerConnection || window.webkitRTCPeerConnection),
            storage: !!(chrome && chrome.storage),
            fileApi: !!(window.File && window.FileReader && window.FileList && window.Blob)
        };
        
        support.isSupported = Object.values(support).every(Boolean);
        
        return support;
    },

    /**
     * Create toast notification
     */
    showToast(message, type = 'info', duration = 5000) {
        // Remove existing toasts
        const existingToasts = document.querySelectorAll('.sop-toast');
        existingToasts.forEach(toast => toast.remove());
        
        const toast = document.createElement('div');
        toast.className = `sop-toast sop-toast-${type}`;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${this.getToastColor(type)};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 14px;
            font-weight: 500;
            z-index: 999999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            backdrop-filter: blur(10px);
            max-width: 400px;
            animation: sopToastSlideIn 0.3s ease;
        `;
        
        toast.textContent = message;
        
        // Add animation styles
        if (!document.getElementById('sop-toast-styles')) {
            const style = document.createElement('style');
            style.id = 'sop-toast-styles';
            style.textContent = `
                @keyframes sopToastSlideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes sopToastSlideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(toast);
        
        // Auto remove
        setTimeout(() => {
            toast.style.animation = 'sopToastSlideOut 0.3s ease';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, duration);
        
        return toast;
    },

    /**
     * Get toast color by type
     */
    getToastColor(type) {
        const colors = {
            info: '#3b82f6',
            success: '#10b981',
            warning: '#f59e0b',
            error: '#ef4444'
        };
        return colors[type] || colors.info;
    },

    /**
     * Create loading overlay
     */
    showLoading(message = 'Loading...', container = document.body) {
        const overlay = document.createElement('div');
        overlay.className = 'sop-loading-overlay';
        overlay.style.cssText = `
            position: ${container === document.body ? 'fixed' : 'absolute'};
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999998;
            backdrop-filter: blur(5px);
        `;
        
        overlay.innerHTML = `
            <div style="
                background: rgba(255, 255, 255, 0.9);
                border-radius: 12px;
                padding: 24px;
                text-align: center;
                box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            ">
                <div style="
                    width: 40px;
                    height: 40px;
                    border: 4px solid #e5e7eb;
                    border-top: 4px solid #3b82f6;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 16px;
                "></div>
                <div style="
                    color: #374151;
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                    font-size: 16px;
                    font-weight: 500;
                ">${message}</div>
            </div>
        `;
        
        // Add spin animation
        if (!document.getElementById('sop-loading-styles')) {
            const style = document.createElement('style');
            style.id = 'sop-loading-styles';
            style.textContent = `
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
        
        container.appendChild(overlay);
        return overlay;
    },

    /**
     * Hide loading overlay
     */
    hideLoading(overlay) {
        if (overlay && overlay.parentNode) {
            overlay.remove();
        }
    },

    /**
     * Parse error message
     */
    parseError(error) {
        if (typeof error === 'string') return error;
        if (error.message) return error.message;
        if (error.error) return error.error;
        return 'An unknown error occurred';
    },

    /**
     * Retry async function with exponential backoff
     */
    async retry(fn, maxAttempts = 3, baseDelay = 1000) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (attempt === maxAttempts) {
                    throw error;
                }
                
                const delay = baseDelay * Math.pow(2, attempt - 1);
                await this.sleep(delay);
            }
        }
        
        throw lastError;
    },

    /**
     * Create confirmation dialog
     */
    confirm(message, title = 'Confirm') {
        return new Promise((resolve) => {
            // Use native confirm for now, can be enhanced with custom modal
            const result = window.confirm(`${title}\n\n${message}`);
            resolve(result);
        });
    },

    /**
     * Validate session data
     */
    validateSessionData(sessionData) {
        const required = ['sessionId', 'startTime'];
        const errors = [];
        
        for (const field of required) {
            if (!sessionData[field]) {
                errors.push(`Missing required field: ${field}`);
            }
        }
        
        if (sessionData.duration && sessionData.duration < CONSTANTS.RECORDING.MIN_DURATION) {
            errors.push('Recording duration too short');
        }
        
        if (sessionData.duration && sessionData.duration > CONSTANTS.RECORDING.MAX_DURATION) {
            errors.push('Recording duration too long');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    },

    /**
     * Get browser info
     */
    getBrowserInfo() {
        const ua = navigator.userAgent;
        let browser = 'unknown';
        let version = 'unknown';
        
        if (ua.includes('Chrome')) {
            browser = 'chrome';
            version = ua.match(/Chrome\/(\d+)/)?.[1] || 'unknown';
        } else if (ua.includes('Firefox')) {
            browser = 'firefox';
            version = ua.match(/Firefox\/(\d+)/)?.[1] || 'unknown';
        } else if (ua.includes('Safari')) {
            browser = 'safari';
            version = ua.match(/Version\/(\d+)/)?.[1] || 'unknown';
        }
        
        return {
            browser,
            version,
            userAgent: ua,
            platform: navigator.platform,
            language: navigator.language
        };
    },

    /**
     * Log with context
     */
    log(level, message, context = {}) {
        const timestamp = this.getCurrentTimestamp();
        const browserInfo = this.getBrowserInfo();
        
        const logData = {
            timestamp,
            level,
            message,
            context,
            browser: browserInfo,
            url: window.location?.href
        };
        
        console[level] && console[level](`[SOP Creator] ${message}`, logData);
        
        // In production, you might want to send logs to a service
        // this.sendLogToService(logData);
    }
};

// Make utils available globally
if (typeof window !== 'undefined') {
    window.Utils = Utils;
}