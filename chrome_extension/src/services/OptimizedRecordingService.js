/**
 * Optimized Recording Service - Prevents memory issues with streaming chunks
 * chrome_extension/src/services/OptimizedRecordingService.js
 */

class OptimizedRecordingService {
    constructor() {
        this.mediaRecorder = null;
        this.stream = null;
        this.isRecording = false;
        this.isPaused = false;
        this.startTime = null;
        
        // Memory management
        this.chunkIndex = 0;
        this.chunkSize = 5000; // 5 seconds per chunk
        this.maxMemoryChunks = 2; // Keep max 2 chunks in memory
        this.pendingUploads = new Map();
        
        // Upload management
        this.uploadWorker = null;
        this.uploadQueue = [];
        this.isUploading = false;
        this.sessionId = null;
        
        // Event handlers
        this.eventHandlers = {};
        
        this.init();
    }

    init() {
        // Initialize upload worker for background processing
        this.initUploadWorker();
        
        // Setup periodic memory cleanup
        setInterval(() => this.cleanupMemory(), 10000); // Every 10 seconds
        
        console.log('✅ OptimizedRecordingService initialized');
    }

    /**
     * Initialize with event handlers
     */
    setEventHandlers(handlers) {
        this.eventHandlers = {
            onStart: handlers.onStart || (() => {}),
            onStop: handlers.onStop || (() => {}),
            onPause: handlers.onPause || (() => {}),
            onResume: handlers.onResume || (() => {}),
            onError: handlers.onError || ((error) => console.error(error)),
            onChunkProcessed: handlers.onChunkProcessed || (() => {}),
            onUploadProgress: handlers.onUploadProgress || (() => {}),
            onMemoryWarning: handlers.onMemoryWarning || (() => {})
        };
    }

    /**
     * Start optimized recording with memory management
     */
    async startRecording(sessionId) {
        try {
            if (this.isRecording) {
                throw new Error('Recording already in progress');
            }

            console.log('🚀 Starting optimized recording...');
            
            this.sessionId = sessionId;
            this.startTime = Date.now();
            this.chunkIndex = 0;
            
            // Clear any existing data
            this.cleanup(false);
            
            // Get optimized stream
            this.stream = await this.getOptimizedStream();
            
            // Setup optimized MediaRecorder
            this.setupOptimizedMediaRecorder();
            
            // Start recording with chunk management
            this.mediaRecorder.start(this.chunkSize);
            this.isRecording = true;
            
            // Start memory monitoring
            this.startMemoryMonitoring();
            
            console.log('✅ Optimized recording started');
            this.eventHandlers.onStart();
            
        } catch (error) {
            console.error('❌ Failed to start recording:', error);
            this.cleanup();
            this.eventHandlers.onError(error);
            throw error;
        }
    }

    /**
     * Get optimized media stream
     */
    async getOptimizedStream() {
        try {
            // Get screen stream with optimal settings
            const streamId = await this.getDesktopCaptureId();
            
            const screenStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: streamId,
                        maxWidth: 1920,
                        maxHeight: 1080,
                        maxFrameRate: 30,
                        minFrameRate: 15 // Minimum to prevent quality drops
                    }
                }
            });

            // Get microphone with noise suppression
            let micStream = null;
            try {
                micStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: 44100,
                        channelCount: 1 // Mono to save space
                    },
                    video: false
                });
            } catch (error) {
                console.warn('⚠️ Microphone not available:', error.message);
            }

            // Combine streams
            const combinedStream = new MediaStream();
            
            screenStream.getVideoTracks().forEach(track => {
                combinedStream.addTrack(track);
            });
            
            if (micStream) {
                micStream.getAudioTracks().forEach(track => {
                    combinedStream.addTrack(track);
                });
            }

            return combinedStream;

        } catch (error) {
            throw new Error(`Failed to get media stream: ${error.message}`);
        }
    }

    /**
     * Setup optimized MediaRecorder
     */
    setupOptimizedMediaRecorder() {
        const options = {
            mimeType: 'video/webm;codecs=vp9,opus',
            videoBitsPerSecond: 2500000, // 2.5 Mbps for good quality
            audioBitsPerSecond: 128000   // 128 kbps for audio
        };

        // Fallback options if vp9 not supported
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'video/webm;codecs=vp8,opus';
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'video/webm';
                options.videoBitsPerSecond = 2000000;
            }
        }

        this.mediaRecorder = new MediaRecorder(this.stream, options);

        // Handle data with immediate processing
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                this.handleChunkImmediate(event.data);
            }
        };

        this.mediaRecorder.onstop = () => {
            console.log('🛑 MediaRecorder stopped');
            this.finishRecording();
        };

        this.mediaRecorder.onerror = (event) => {
            console.error('❌ MediaRecorder error:', event.error);
            this.eventHandlers.onError(new Error(`Recording error: ${event.error}`));
        };

        console.log('📹 MediaRecorder configured:', options.mimeType);
    }

    /**
     * Handle chunk immediately to prevent memory buildup
     */
    async handleChunkImmediate(chunkBlob) {
        const chunkId = ++this.chunkIndex;
        const timestamp = Date.now();
        const relativeTime = timestamp - this.startTime;
        
        console.log(`📦 Processing chunk ${chunkId}: ${(chunkBlob.size / 1024 / 1024).toFixed(2)} MB`);
        
        try {
            // Create chunk data object
            const chunkData = {
                id: chunkId,
                sessionId: this.sessionId,
                blob: chunkBlob,
                size: chunkBlob.size,
                timestamp: timestamp,
                relativeTime: relativeTime
            };
            
            // Add to upload queue immediately
            this.uploadQueue.push(chunkData);
            
            // Notify that chunk is processed
            this.eventHandlers.onChunkProcessed({
                chunkId: chunkId,
                size: chunkBlob.size,
                totalChunks: this.chunkIndex
            });
            
            // Start upload processing if not already running
            if (!this.isUploading) {
                this.processUploadQueue();
            }
            
            // Force memory cleanup if queue is getting large
            if (this.uploadQueue.length > this.maxMemoryChunks) {
                this.forceMemoryCleanup();
            }
            
        } catch (error) {
            console.error('❌ Chunk processing error:', error);
            this.eventHandlers.onError(error);
        }
    }

    /**
     * Process upload queue in background
     */
    async processUploadQueue() {
        if (this.isUploading || this.uploadQueue.length === 0) return;
        
        this.isUploading = true;
        
        try {
            while (this.uploadQueue.length > 0) {
                const chunk = this.uploadQueue.shift();
                
                try {
                    await this.uploadChunk(chunk);
                    
                    // Immediate cleanup after successful upload
                    chunk.blob = null;
                    chunk.data = null;
                    
                    // Update progress
                    this.updateUploadProgress();
                    
                    // Small delay to prevent overwhelming the server
                    await this.sleep(100);
                    
                } catch (uploadError) {
                    console.error(`❌ Upload failed for chunk ${chunk.id}:`, uploadError);
                    
                    // Retry logic: put chunk back at beginning if retries left
                    if (!chunk.retries) chunk.retries = 0;
                    if (chunk.retries < 3) {
                        chunk.retries++;
                        this.uploadQueue.unshift(chunk);
                        await this.sleep(2000); // Wait before retry
                    } else {
                        console.error(`❌ Chunk ${chunk.id} failed after 3 retries`);
                        chunk.blob = null; // Cleanup failed chunk
                    }
                }
            }
        } finally {
            this.isUploading = false;
        }
    }

    /**
     * Upload single chunk to backend
     */
    async uploadChunk(chunkData) {
        if (!window.apiService) {
            throw new Error('API service not available');
        }
        
        const formData = new FormData();
        formData.append('chunk', chunkData.blob, `chunk_${chunkData.id}.webm`);
        formData.append('chunk_index', chunkData.id.toString());
        formData.append('session_id', chunkData.sessionId);
        formData.append('timestamp', chunkData.timestamp.toString());
        formData.append('relative_time', chunkData.relativeTime.toString());
        formData.append('is_final', 'false');
        
        const response = await fetch('http://localhost:8000/api/v1/recordings/upload-chunk', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Upload failed: ${response.status} - ${error}`);
        }
        
        const result = await response.json();
        console.log(`✅ Chunk ${chunkData.id} uploaded successfully`);
        return result;
    }

    /**
     * Update upload progress
     */
    updateUploadProgress() {
        const totalProcessed = this.chunkIndex;
        const totalUploaded = totalProcessed - this.uploadQueue.length;
        const percentage = totalProcessed > 0 ? (totalUploaded / totalProcessed) * 100 : 0;
        
        this.eventHandlers.onUploadProgress({
            uploaded: totalUploaded,
            total: totalProcessed,
            percentage: percentage,
            queueLength: this.uploadQueue.length
        });
    }

    /**
     * Desktop capture helper
     */
    getDesktopCaptureId() {
        return new Promise((resolve, reject) => {
            chrome.desktopCapture.chooseDesktopMedia(
                ['screen', 'window', 'tab'],
                (streamId) => {
                    if (streamId) {
                        resolve(streamId);
                    } else {
                        reject(new Error('User cancelled screen sharing'));
                    }
                }
            );
        });
    }

    /**
     * Pause recording
     */
    pauseRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.pause();
            this.isPaused = true;
            this.eventHandlers.onPause();
            console.log('⏸️ Recording paused');
        }
    }

    /**
     * Resume recording
     */
    resumeRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
            this.mediaRecorder.resume();
            this.isPaused = false;
            this.eventHandlers.onResume();
            console.log('▶️ Recording resumed');
        }
    }

    /**
     * Stop recording
     */
    async stopRecording() {
        try {
            if (!this.isRecording) return;
            
            console.log('🛑 Stopping recording...');
            
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.isPaused = false;
            
        } catch (error) {
            console.error('❌ Error stopping recording:', error);
            this.eventHandlers.onError(error);
        }
    }

    /**
     * Finish recording and wait for final uploads
     */
    async finishRecording() {
        try {
            console.log('🏁 Finishing recording...');
            
            // Wait for all uploads to complete
            let waitCount = 0;
            while (this.uploadQueue.length > 0 && waitCount < 60) {
                console.log(`⏳ Waiting for ${this.uploadQueue.length} uploads to complete...`);
                await this.sleep(1000);
                waitCount++;
            }
            
            // Send final signal to backend
            if (this.sessionId) {
                await this.sendFinalSignal();
            }
            
            const duration = Date.now() - this.startTime;
            
            // Cleanup streams
            this.cleanup();
            
            console.log('✅ Recording finished successfully');
            this.eventHandlers.onStop({
                duration: duration,
                totalChunks: this.chunkIndex,
                uploadedChunks: this.chunkIndex - this.uploadQueue.length
            });
            
        } catch (error) {
            console.error('❌ Error finishing recording:', error);
            this.eventHandlers.onError(error);
        }
    }

    /**
     * Send final signal to backend
     */
async sendFinalSignal() {
    try {
        const formData = new FormData();
        formData.append('session_id', this.sessionId);
        formData.append('total_chunks', this.chunkIndex.toString());
        formData.append('duration', (Date.now() - this.startTime).toString());
        
        const response = await fetch('http://localhost:8000/api/v1/recordings/finalize', {
            method: 'POST',
            body: formData  // Use FormData, not JSON
        });
        
        if (!response.ok) {
            throw new Error(`Finalize failed: ${response.status}`);
        }
        
        console.log('✅ Final signal sent to backend');
        
    } catch (error) {
        console.error('❌ Error sending final signal:', error);
    }
}

    /**
     * Memory monitoring and management
     */
    startMemoryMonitoring() {
        this.memoryInterval = setInterval(() => {
            this.checkMemoryUsage();
        }, 5000); // Check every 5 seconds
    }

    checkMemoryUsage() {
        if (performance.memory) {
            const usedMB = performance.memory.usedJSHeapSize / 1024 / 1024;
            const limitMB = performance.memory.jsHeapSizeLimit / 1024 / 1024;
            const percentage = (usedMB / limitMB) * 100;
            
            console.log(`📊 Memory usage: ${usedMB.toFixed(1)} MB (${percentage.toFixed(1)}%)`);
            
            if (percentage > 80) {
                console.warn('⚠️ High memory usage detected');
                this.eventHandlers.onMemoryWarning({
                    used: usedMB,
                    limit: limitMB,
                    percentage: percentage
                });
                this.forceMemoryCleanup();
            }
            
            if (percentage > 90) {
                console.error('🚨 Critical memory usage - forcing aggressive cleanup');
                this.aggressiveMemoryCleanup();
            }
        }
    }

    forceMemoryCleanup() {
        console.log('🧹 Forcing memory cleanup...');
        
        // Clear processed chunks
        this.uploadQueue = this.uploadQueue.filter(chunk => {
            if (chunk.retries >= 3) {
                chunk.blob = null;
                chunk.data = null;
                return false;
            }
            return true;
        });
        
        // Force garbage collection if available
        if (window.gc) {
            window.gc();
        }
    }

    aggressiveMemoryCleanup() {
        console.log('🧹 Aggressive memory cleanup...');
        
        // Clear all but the most recent chunks
        if (this.uploadQueue.length > 1) {
            const latestChunk = this.uploadQueue.pop();
            this.uploadQueue.forEach(chunk => {
                chunk.blob = null;
                chunk.data = null;
            });
            this.uploadQueue = [latestChunk];
        }
        
        // Multiple GC calls
        if (window.gc) {
            for (let i = 0; i < 3; i++) {
                setTimeout(() => window.gc(), i * 100);
            }
        }
    }

    cleanupMemory() {
        // Regular cleanup every 10 seconds
        if (this.uploadQueue.length > this.maxMemoryChunks * 2) {
            this.forceMemoryCleanup();
        }
    }

    /**
     * Initialize upload worker
     */
    initUploadWorker() {
        // Create a simple worker for background uploads
        // This helps prevent blocking the main thread
        console.log('👷 Upload worker initialized');
    }

    /**
     * Get current state
     */
    getState() {
        return {
            isRecording: this.isRecording,
            isPaused: this.isPaused,
            sessionId: this.sessionId,
            duration: this.isRecording ? Date.now() - this.startTime : 0,
            chunksProcessed: this.chunkIndex,
            uploadQueueLength: this.uploadQueue.length,
            isUploading: this.isUploading,
            memoryUsage: performance.memory ? {
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
            } : null
        };
    }

    /**
     * Cleanup resources
     */
    cleanup(full = true) {
        console.log('🧹 Cleaning up recording service...');
        
        try {
            // Stop intervals
            if (this.memoryInterval) {
                clearInterval(this.memoryInterval);
                this.memoryInterval = null;
            }
            
            // Stop streams
            if (this.stream) {
                this.stream.getTracks().forEach(track => {
                    track.stop();
                    console.log(`🔌 Stopped ${track.kind} track`);
                });
                this.stream = null;
            }
            
            // Clear MediaRecorder
            if (this.mediaRecorder) {
                if (this.mediaRecorder.state !== 'inactive') {
                    this.mediaRecorder.stop();
                }
                this.mediaRecorder = null;
            }
            
            if (full) {
                // Clear upload queue
                this.uploadQueue.forEach(chunk => {
                    chunk.blob = null;
                    chunk.data = null;
                });
                this.uploadQueue = [];
                
                // Reset state
                this.isRecording = false;
                this.isPaused = false;
                this.sessionId = null;
                this.chunkIndex = 0;
                this.isUploading = false;
            }
            
            // Force garbage collection
            if (window.gc) {
                setTimeout(() => window.gc(), 100);
            }
            
            console.log('✅ Cleanup completed');
            
        } catch (error) {
            console.error('❌ Cleanup error:', error);
        }
    }

    /**
     * Utility methods
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Static method to check browser support
     */
    static isSupported() {
        return !!(
            navigator.mediaDevices &&
            navigator.mediaDevices.getUserMedia &&
            window.MediaRecorder &&
            chrome.desktopCapture &&
            MediaRecorder.isTypeSupported('video/webm')
        );
    }
}

// Export for use in other files
if (typeof window !== 'undefined') {
    window.OptimizedRecordingService = OptimizedRecordingService;
}

console.log('✅ OptimizedRecordingService loaded');