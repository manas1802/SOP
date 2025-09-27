// ===== Update your Chrome Extension's ApiService.js =====
/**
 * Enhanced ApiService - Now connects to your FastAPI backend
 * Replace your existing ApiService.js with this updated version
 */

class ApiService {
    constructor() {
        this.baseUrl = 'http://localhost:8000/api/v1'; // Your FastAPI backend
        this.timeout = 60000; // 60 seconds for video uploads
        this.retryAttempts = 3;
    }
    async uploadVideoChunk(chunkBlob, chunkData) {
    try {
        console.log(`📤 Uploading chunk ${chunkData.index}...`);
        
        const formData = new FormData();
        formData.append('chunk', chunkBlob, `chunk_${chunkData.index}.webm`);
        formData.append('chunk_index', chunkData.index);
        formData.append('session_id', chunkData.sessionId);
        formData.append('timestamp', chunkData.timestamp);
        formData.append('relative_time', chunkData.relativeTime);
        formData.append('is_final', 'false');
        
        const response = await this.makeRequest('/recordings/upload-chunk', {
            method: 'POST',
            body: formData,
            timeout: 30000 // 30 seconds per chunk
        });
        
        console.log(`✅ Chunk ${chunkData.index} uploaded successfully`);
        return response;
        
    } catch (error) {
        console.error(`❌ Chunk ${chunkData.index} upload failed:`, error);
        throw error;
    }
}

async finalizeRecording(sessionId, totalChunks, duration) {
    try {
        console.log(`🏁 Finalizing recording ${sessionId}...`);
        
        const response = await this.makeRequest('/recordings/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                total_chunks: totalChunks,
                duration: duration,
                is_final: true
            })
        });
        
        console.log('✅ Recording finalized successfully');
        return response;
        
    } catch (error) {
        console.error('❌ Recording finalization failed:', error);
        throw error;
    }
}
    /**
     * Upload recording with metadata to FastAPI backend
     * This replaces your existing uploadRecording method
     */
    async uploadRecording(videoBlob, sessionData) {
        try {
            console.log('🚀 Uploading to FastAPI backend...', {
                videoSize: videoBlob.size,
                sessionId: sessionData.sessionId,
                backendUrl: this.baseUrl
            });

            const formData = new FormData();
            
            // Add video file
            formData.append('video', videoBlob, `recording_${sessionData.sessionId}.webm`);
            
            // Add session ID
            formData.append('session_id', sessionData.sessionId);
            
            // Add metadata
            const metadata = {
                title: sessionData.title || `Recording ${sessionData.sessionId}`,
                description: sessionData.description || 'Recorded with SOP Creator Chrome Extension',
                url: sessionData.url || window.location.href,
                page_title: sessionData.pageTitle || document.title,
                browser_info: {
                    browser: 'chrome',
                    userAgent: navigator.userAgent,
                    extension_version: '1.0.0',
                    timestamp: Date.now()
                }
            };
            formData.append('metadata', JSON.stringify(metadata));
            
            // Add click data if available
            if (sessionData.clicks && sessionData.clicks.length > 0) {
                formData.append('click_data', JSON.stringify(sessionData.clicks));
                console.log(`📊 Including ${sessionData.clicks.length} clicks`);
            }
            
            // Add screenshot data if available  
            if (sessionData.screenshots && sessionData.screenshots.length > 0) {
                formData.append('screenshot_data', JSON.stringify(sessionData.screenshots));
                console.log(`📸 Including ${sessionData.screenshots.length} screenshots`);
            }

            // Upload to FastAPI
            const response = await this.makeRequest('/recordings/upload', {
                method: 'POST',
                body: formData,
                timeout: 120000 // 2 minutes for large videos
            });

            console.log('✅ Upload successful!', response);
            
            return {
                success: true,
                recording_id: response.recording_id,
                session_id: response.session_id,
                status: response.status,
                message: response.message,
                backend_response: response
            };

        } catch (error) {
            console.error('❌ Upload to FastAPI failed:', error);
            throw new Error(`FastAPI upload failed: ${error.message}`);
        }
    }

    /**
     * Get recording status from FastAPI
     */
    async getRecordingStatus(recordingId) {
        try {
            const response = await this.makeRequest(`/recordings/${recordingId}`);
            return {
                success: true,
                recording: response.recording,
                clicks: response.clicks,
                screenshots: response.screenshots,
                transcript: response.transcript,
                sops: response.sops
            };
        } catch (error) {
            console.error('Failed to get recording status:', error);
            throw error;
        }
    }

    /**
     * List all recordings from FastAPI
     */
    async listRecordings(skip = 0, limit = 10) {
        try {
            const response = await this.makeRequest(`/recordings?skip=${skip}&limit=${limit}`);
            return {
                success: true,
                recordings: response.recordings,
                total: response.total
            };
        } catch (error) {
            console.error('Failed to list recordings:', error);
            throw error;
        }
    }

    /**
     * Health check - test FastAPI connection
     */
    async healthCheck() {
        try {
            const response = await this.makeRequest('/health', {
                timeout: 5000
            });
            return response.status === 'healthy';
        } catch (error) {
            console.warn('FastAPI health check failed:', error);
            return false;
        }
    }

    /**
     * Core request method with retry logic
     * Enhanced for FastAPI integration
     */
    async makeRequest(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const defaultOptions = {
            method: 'GET',
            headers: {
                // Don't set Content-Type for FormData, let browser set it
                ...this.getAuthHeaders()
            },
            timeout: this.timeout
        };

        // Merge options
        const requestOptions = { ...defaultOptions, ...options };

        // Don't override Content-Type for FormData
        if (options.body instanceof FormData) {
            delete requestOptions.headers['Content-Type'];
        } else if (!requestOptions.headers['Content-Type']) {
            requestOptions.headers['Content-Type'] = 'application/json';
        }

        let lastError;

        // Retry logic
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                console.log(`🌐 API Request (attempt ${attempt}): ${requestOptions.method} ${url}`);

                const response = await this.fetchWithTimeout(url, requestOptions);

                if (!response.ok) {
                    const errorData = await this.parseErrorResponse(response);
                    throw new Error(`HTTP ${response.status}: ${errorData.detail || errorData.error || response.statusText}`);
                }

                const data = await response.json();
                console.log(`✅ API Response: ${requestOptions.method} ${url}`, data);
                return data;

            } catch (error) {
                lastError = error;
                console.error(`❌ API Request failed (attempt ${attempt}):`, error);

                // Don't retry on certain errors
                if (this.shouldNotRetry(error)) {
                    break;
                }

                // Wait before retry (exponential backoff)
                if (attempt < this.retryAttempts) {
                    const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                    console.log(`⏳ Retrying in ${delay/1000}s...`);
                    await this.sleep(delay);
                }
            }
        }

        throw lastError;
    }

    /**
     * Enhanced fetch with timeout
     */
    async fetchWithTimeout(url, options) {
        const { timeout, ...fetchOptions } = options;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            console.log(`⏰ Request timeout after ${timeout}ms: ${url}`);
        }, timeout);

        try {
            const response = await fetch(url, {
                ...fetchOptions,
                signal: controller.signal
            });
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Parse error response from FastAPI
     */
    async parseErrorResponse(response) {
        try {
            const data = await response.json();
            return data;
        } catch {
            return { 
                error: response.statusText,
                detail: `HTTP ${response.status}`
            };
        }
    }

    /**
     * Check if error should not be retried
     */
    shouldNotRetry(error) {
        const noRetryErrors = [400, 401, 403, 404, 413, 422]; // Client errors
        
        if (error.message.includes('HTTP')) {
            const statusCode = parseInt(error.message.match(/HTTP (\d+)/)?.[1]);
            return noRetryErrors.includes(statusCode);
        }
        
        // Don't retry on timeout or network errors that won't resolve
        if (error.name === 'AbortError') {
            return true; // Timeout
        }
        
        return false;
    }

    /**
     * Get authentication headers
     */
    getAuthHeaders() {
        const headers = {};
        
        // Add extension identification
        if (chrome.runtime && chrome.runtime.id) {
            headers['X-Extension-ID'] = chrome.runtime.id;
            headers['X-Extension-Version'] = '1.0.0';
        }
        
        // Add user agent info
        headers['X-User-Agent'] = navigator.userAgent;
        
        return headers;
    }

    /**
     * Configure API service
     */
    configure(config) {
        if (config.baseUrl) {
            this.baseUrl = config.baseUrl;
            console.log(`🔧 API base URL updated: ${this.baseUrl}`);
        }
        if (config.timeout) this.timeout = config.timeout;
        if (config.retryAttempts) this.retryAttempts = config.retryAttempts;
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Test FastAPI connection
     */
    async testConnection() {
        try {
            console.log('🔍 Testing FastAPI connection...');
            
            const healthCheck = await this.healthCheck();
            if (!healthCheck) {
                throw new Error('Health check failed');
            }
            
            // Test detailed health endpoint
            const detailedHealth = await this.makeRequest('/health/detailed');
            console.log('📊 FastAPI Status:', detailedHealth);
            
            return {
                success: true,
                message: 'FastAPI connection successful',
                details: detailedHealth
            };
            
        } catch (error) {
            console.error('❌ FastAPI connection test failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Create singleton instance
const apiService = new ApiService();

// Make available globally
if (typeof window !== 'undefined') {
    window.ApiService = ApiService;
    window.apiService = apiService;
}

// Test connection on load
if (typeof window !== 'undefined') {
    // Test connection after a short delay
    setTimeout(async () => {
        try {
            const result = await apiService.testConnection();
            if (result.success) {
                console.log('✅ FastAPI backend connected successfully!');
            } else {
                console.warn('⚠️ FastAPI backend connection failed:', result.error);
            }
        } catch (error) {
            console.warn('⚠️ Could not test FastAPI connection:', error.message);
        }
    }, 1000);
}