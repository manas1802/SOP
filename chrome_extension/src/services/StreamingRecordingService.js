// ===== FILE 1: src/services/StreamingRecordingService.js =====
/**
 * Streaming Recording Service - Prevents Chrome hanging by processing chunks immediately
 * Replace your existing RecordingService.js with this
 */

class StreamingRecordingService {
    constructor() {
        this.mediaRecorder = null;
        this.screenStream = null;
        this.audioStream = null;
        this.isRecording = false;
        this.isPaused = false;
        this.startTime = null;
        
        // Chunk management
        this.chunkIndex = 0;
        this.chunkInterval = 5000; // 5 seconds per chunk
        this.maxChunksInMemory = 2; // Keep max 2 chunks in memory
        this.chunks = []; // Temporary storage before upload
        
        // Upload queue
        this.uploadQueue = [];
        this.isUploading = false;
        
        // Event callbacks
        this.onStart = null;
        this.onStop = null;
        this.onPause = null;
        this.onResume = null;
        this.onError = null;
        this.onChunkReady = null;
        this.onUploadProgress = null;
    }

    /**
     * Initialize with event handlers
     */
    init(eventHandlers = {}) {
        this.onStart = eventHandlers.onStart || (() => {});
        this.onStop = eventHandlers.onStop || (() => {});
        this.onPause = eventHandlers.onPause || (() => {});
        this.onResume = eventHandlers.onResume || (() => {});
        this.onError = eventHandlers.onError || ((error) => console.error(error));
        this.onChunkReady = eventHandlers.onChunkReady || (() => {});
        this.onUploadProgress = eventHandlers.onUploadProgress || (() => {});
    }

    /**
     * Start streaming recording
     */
    async startRecording() {
        try {
            if (this.isRecording) {
                throw new Error('Recording already in progress');
            }

            console.log('🚀 Starting streaming recording...');

            // Request screen capture
            await this.getScreenStream();
            
            // Request microphone access
            await this.getMicrophoneStream();
            
            // Setup streaming MediaRecorder
            await this.setupStreamingMediaRecorder();
            
            // Start recording with chunking
            this.mediaRecorder.start(this.chunkInterval); // Create chunk every 5 seconds
            this.isRecording = true;
            this.startTime = Date.now();
            this.chunkIndex = 0;
            
            console.log('✅ Streaming recording started');
            this.onStart();

        } catch (error) {
            console.error('Failed to start streaming recording:', error);
            this.cleanup();
            this.onError(error);
            throw error;
        }
    }

    /**
     * Setup MediaRecorder with streaming configuration
     */
    async setupStreamingMediaRecorder() {
        try {
            // Create combined stream
            const combinedStream = new MediaStream();
            
            // Add video tracks
            if (this.screenStream) {
                this.screenStream.getVideoTracks().forEach(track => {
                    combinedStream.addTrack(track);
                });
                
                // Add system audio if available
                this.screenStream.getAudioTracks().forEach(track => {
                    combinedStream.addTrack(track);
                });
            }
            
            // Add microphone audio
            if (this.audioStream) {
                this.audioStream.getAudioTracks().forEach(track => {
                    combinedStream.addTrack(track);
                });
            }

            // Setup MediaRecorder with optimal settings for streaming
            const options = this.getStreamingMediaRecorderOptions();
            this.mediaRecorder = new MediaRecorder(combinedStream, options);

            // 🔥 KEY: Handle each chunk immediately as it's created
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.handleChunk(event.data);
                }
            };

            // Handle recording stop
            this.mediaRecorder.onstop = () => {
                console.log('📹 MediaRecorder stopped');
                this.finishRecording();
            };

            // Handle errors
            this.mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event.error);
                this.onError(new Error(`Recording error: ${event.error}`));
            };

            console.log('📹 Streaming MediaRecorder setup complete');

        } catch (error) {
            throw new Error(`Failed to setup streaming MediaRecorder: ${error.message}`);
        }
    }

    /**
     * 🔥 KEY METHOD: Handle each chunk immediately
     */
    async handleChunk(chunkBlob) {
        this.chunkIndex++;
        const timestamp = Date.now();
        const relativeTime = timestamp - this.startTime;
        
        console.log(`📦 Chunk ${this.chunkIndex} ready: ${(chunkBlob.size / 1024 / 1024).toFixed(2)} MB`);
        
        const chunkData = {
            index: this.chunkIndex,
            blob: chunkBlob,
            size: chunkBlob.size,
            timestamp: timestamp,
            relativeTime: relativeTime,
            sessionId: this.getSessionId()
        };
        
        // Notify that chunk is ready
        this.onChunkReady(chunkData);
        
        // Option 1: Upload immediately (recommended)
        if (window.apiService) {
            await this.uploadChunkImmediately(chunkData);
        } 
        // Option 2: Store in IndexedDB for later
        else {
            await this.storeChunkInIndexedDB(chunkData);
        }
        
        // Keep only recent chunks in memory
        this.manageMemoryUsage();
    }

    /**
     * Upload chunk immediately to prevent memory buildup
     */
    async uploadChunkImmediately(chunkData) {
        try {
            console.log(`🚀 Uploading chunk ${chunkData.index} immediately...`);
            
            // Add to upload queue
            this.uploadQueue.push(chunkData);
            
            // Process upload queue
            if (!this.isUploading) {
                await this.processUploadQueue();
            }
            
        } catch (error) {
            console.error('Immediate chunk upload error:', error);
            
            // Fallback: store in IndexedDB
            await this.storeChunkInIndexedDB(chunkData);
        }
    }

    /**
     * Process upload queue
     */
    async processUploadQueue() {
        if (this.isUploading || this.uploadQueue.length === 0) return;
        
        this.isUploading = true;
        
        while (this.uploadQueue.length > 0) {
            const chunk = this.uploadQueue.shift();
            
            try {
                await this.uploadSingleChunk(chunk);
                
                // Clear chunk from memory immediately after upload
                chunk.blob = null;
                
                // Update progress
                this.onUploadProgress({
                    uploaded: this.chunkIndex - this.uploadQueue.length,
                    total: this.chunkIndex,
                    percentage: ((this.chunkIndex - this.uploadQueue.length) / this.chunkIndex) * 100
                });
                
            } catch (error) {
                console.error('Chunk upload error:', error);
                
                // Put chunk back in queue for retry
                this.uploadQueue.unshift(chunk);
                break;
            }
        }
        
        this.isUploading = false;
    }

    /**
     * Upload single chunk to FastAPI backend
     */
async uploadSingleChunk(chunkData) {
    // Use the new ApiService method
    const response = await window.apiService.uploadVideoChunk(chunkData.blob, chunkData);
    
    console.log(`✅ Chunk ${chunkData.index} uploaded successfully`);
    return response;
}
    /**
     * Store chunk in IndexedDB as fallback
     */
    async storeChunkInIndexedDB(chunkData) {
        try {
            console.log(`💾 Storing chunk ${chunkData.index} in IndexedDB...`);
            
            // Convert blob to array buffer for IndexedDB
            const arrayBuffer = await chunkData.blob.arrayBuffer();
            
            const chunkRecord = {
                sessionId: chunkData.sessionId,
                chunkIndex: chunkData.index,
                data: arrayBuffer,
                size: chunkData.size,
                timestamp: chunkData.timestamp,
                relativeTime: chunkData.relativeTime
            };
            
            await this.saveToIndexedDB(chunkRecord);
            
            // Clear blob from memory
            chunkData.blob = null;
            
            console.log(`✅ Chunk ${chunkData.index} stored in IndexedDB`);
            
        } catch (error) {
            console.error('IndexedDB storage error:', error);
        }
    }

    /**
     * Manage memory usage by clearing old chunks
     */
    manageMemoryUsage() {
        // Keep only recent chunks in memory
        if (this.chunks.length > this.maxChunksInMemory) {
            const oldChunks = this.chunks.splice(0, this.chunks.length - this.maxChunksInMemory);
            
            // Clear blob references
            oldChunks.forEach(chunk => {
                if (chunk.blob) {
                    chunk.blob = null;
                }
            });
            
            // Force garbage collection if available
            if (window.gc) {
                window.gc();
                console.log('🧹 Memory cleanup performed');
            }
        }
    }

    /**
     * Stop recording
     */
    async stopRecording() {
        try {
            if (!this.isRecording) {
                throw new Error('No recording in progress');
            }

            console.log('🛑 Stopping streaming recording...');
            
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.isPaused = false;
            
        } catch (error) {
            console.error('Error stopping streaming recording:', error);
            this.onError(error);
            throw error;
        }
    }

    /**
     * Finish recording and upload final chunk
     */
    async finishRecording() {
        try {
            console.log('🏁 Finishing recording...');
            
            // Wait for all uploads to complete
            while (this.uploadQueue.length > 0 && this.isUploading) {
                await this.sleep(1000);
            }
            
            // Send final signal to backend
            if (window.apiService) {
                await this.sendFinalSignal();
            }
            
            const duration = Date.now() - this.startTime;
            
            console.log('✅ Streaming recording completed');
            this.onStop(null, duration); // No single blob, just duration
            
        } catch (error) {
            console.error('Error finishing recording:', error);
            this.onError(error);
        }
    }

    /**
     * Send final signal to backend
     */
async sendFinalSignal() {
    try {
        const response = await window.apiService.finalizeRecording(
            this.getSessionId(),
            this.chunkIndex,
            Date.now() - this.startTime
        );
        
        console.log('✅ Final signal sent to backend');
        return response;
        
    } catch (error) {
        console.error('Error sending final signal:', error);
        throw error;
    }
}

    /**
     * Get screen stream
     */
    async getScreenStream() {
        try {
            const streamId = await this.getDesktopCaptureId();
            
            this.screenStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: streamId,
                        maxWidth: 1920,
                        maxHeight: 1080,
                        maxFrameRate: 30
                    }
                }
            });

            console.log('🖥️ Screen stream obtained');

        } catch (error) {
            throw new Error(`Failed to get screen stream: ${error.message}`);
        }
    }

    /**
     * Get desktop capture stream ID
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
     * Get microphone stream
     */
    async getMicrophoneStream() {
        try {
            this.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

            console.log('🎤 Microphone stream obtained');

        } catch (error) {
            console.warn('Could not get microphone:', error.message);
            this.audioStream = null;
        }
    }

    /**
     * Get MediaRecorder options optimized for streaming
     */
    getStreamingMediaRecorderOptions() {
        const options = [
            { 
                mimeType: 'video/webm;codecs=vp9,opus',
                videoBitsPerSecond: 2500000, // Lower bitrate for streaming
                audioBitsPerSecond: 128000
            },
            { 
                mimeType: 'video/webm;codecs=vp8,opus',
                videoBitsPerSecond: 2000000,
                audioBitsPerSecond: 128000
            },
            { 
                mimeType: 'video/webm',
                videoBitsPerSecond: 1500000
            }
        ];

        for (const option of options) {
            if (MediaRecorder.isTypeSupported(option.mimeType)) {
                console.log('🎥 Using streaming format:', option.mimeType);
                return option;
            }
        }

        return { videoBitsPerSecond: 1500000 };
    }

    /**
     * IndexedDB operations
     */
    async saveToIndexedDB(data) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('SOPRecordingDB', 1);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('chunks')) {
                    db.createObjectStore('chunks', { keyPath: ['sessionId', 'chunkIndex'] });
                }
            };
            
            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction(['chunks'], 'readwrite');
                const store = transaction.objectStore('chunks');
                
                store.add(data);
                
                transaction.oncomplete = () => {
                    db.close();
                    resolve();
                };
                
                transaction.onerror = (error) => {
                    db.close();
                    reject(error);
                };
            };
            
            request.onerror = reject;
        });
    }

    /**
     * Pause recording
     */
    pauseRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.pause();
            this.isPaused = true;
            this.onPause();
        }
    }

    /**
     * Resume recording
     */
    resumeRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
            this.mediaRecorder.resume();
            this.isPaused = false;
            this.onResume();
        }
    }

    /**
     * Get current state
     */
    getState() {
        return {
            isRecording: this.isRecording,
            isPaused: this.isPaused,
            duration: this.isRecording ? Date.now() - this.startTime : 0,
            chunksProcessed: this.chunkIndex,
            uploadQueueLength: this.uploadQueue.length,
            memoryChunks: this.chunks.length
        };
    }

    /**
     * Cleanup
     */
    cleanup() {
        console.log('🧹 Streaming recording cleanup...');
        
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }
        
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }
        
        // Clear chunks
        this.chunks = [];
        this.uploadQueue = [];
        this.mediaRecorder = null;
        this.isRecording = false;
        this.isPaused = false;
        
        // Force garbage collection
        if (window.gc) {
            window.gc();
        }
        
        console.log('✅ Streaming cleanup completed');
    }

    /**
     * Utilities
     */
    getSessionId() {
        return window.recordingController?.sessionId || `session_${Date.now()}`;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Check browser support
     */
    static isSupported() {
        return !!(
            navigator.mediaDevices &&
            navigator.mediaDevices.getUserMedia &&
            window.MediaRecorder &&
            chrome.desktopCapture &&
            window.indexedDB
        );
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.StreamingRecordingService = StreamingRecordingService;
}

// ===== FILE 2: src/recording/recording.js - UPDATE =====
/**
 * Update your RecordingController to use streaming service
 * Replace the relevant parts in your existing RecordingController
 */

class StreamingRecordingController extends RecordingController {
    constructor() {
        super();
        this.chunksUploaded = 0;
        this.totalChunks = 0;
        this.uploadProgress = 0;
    }

    async init() {
        try {
            console.log('🚀 Initializing streaming recording controller...');
            
            // Load streaming recording service instead of regular one
            await this.loadStreamingRecordingService();
            
            // Initialize recording service with streaming handlers
            this.recordingService.init({
                onStart: () => this.handleRecordingStart(),
                onStop: (blob, duration) => this.handleStreamingRecordingStop(duration),
                onPause: () => this.handleRecordingPause(),
                onResume: () => this.handleRecordingResume(),
                onError: (error) => this.handleRecordingError(error),
                onChunkReady: (chunkData) => this.handleChunkReady(chunkData),
                onUploadProgress: (progress) => this.handleUploadProgress(progress)
            });
            
            // Setup UI
            this.setupEventListeners();
            this.startTimer();
            this.startCrossBrowserTracking();
            
            console.log('✅ Streaming recording controller ready');
            
        } catch (error) {
            console.error('Failed to initialize streaming recording:', error);
            this.showError('Failed to start recording: ' + error.message);
        }
    }

    async loadStreamingRecordingService() {
        return new Promise((resolve, reject) => {
            if (window.StreamingRecordingService) {
                this.recordingService = new StreamingRecordingService();
                resolve();
            } else {
                const script = document.createElement('script');
                script.src = '../services/StreamingRecordingService.js';
                script.onload = () => {
                    if (window.StreamingRecordingService) {
                        this.recordingService = new StreamingRecordingService();
                        resolve();
                    } else {
                        reject(new Error('StreamingRecordingService not loaded'));
                    }
                };
                script.onerror = () => reject(new Error('Failed to load StreamingRecordingService'));
                document.head.appendChild(script);
            }
        });
    }

    /**
     * Handle chunk ready - called for each 5-second chunk
     */
    handleChunkReady(chunkData) {
        this.totalChunks++;
        
        console.log(`📦 Chunk ${chunkData.index} ready: ${(chunkData.size / 1024 / 1024).toFixed(2)} MB`);
        
        // Update UI with streaming progress
        this.updateStreamingProgress();
        
        // Add to activity feed
        this.addActivity('chunk', `Chunk ${chunkData.index} processed (${(chunkData.size / 1024 / 1024).toFixed(1)} MB)`);
    }

    /**
     * Handle upload progress
     */
    handleUploadProgress(progress) {
        this.chunksUploaded = progress.uploaded;
        this.uploadProgress = progress.percentage;
        
        console.log(`📤 Upload progress: ${progress.uploaded}/${progress.total} chunks (${progress.percentage.toFixed(1)}%)`);
        
        // Update UI
        this.updateUploadProgress(progress);
    }

    /**
     * Handle streaming recording stop (no big blob!)
     */
    async handleStreamingRecordingStop(duration) {
        console.log('🏁 Streaming recording stopped', { 
            duration,
            totalChunks: this.totalChunks,
            chunksUploaded: this.chunksUploaded
        });
        
        try {
            // No big blob to worry about - everything was streamed!
            this.showProcessingOverlay();
            this.updateProcessingStatus('Finalizing recording...');
            
            // Stop cross-browser tracking
            await this.stopTracking();
            
            // Wait a moment for final uploads to complete
            await this.waitForUploadsToComplete();
            
            // Show success
            this.updateProcessingStatus('Recording completed successfully!');
            
            const sessionData = {
                sessionId: this.sessionId,
                duration: duration,
                totalChunks: this.totalChunks,
                chunksUploaded: this.chunksUploaded,
                clickCount: this.clickCount,
                screenshotCount: this.screenshotCount
            };
            
            setTimeout(() => {
                this.hideProcessingOverlay();
                this.showStreamingSuccess(sessionData);
            }, 2000);
            
        } catch (error) {
            console.error('Error handling streaming stop:', error);
            this.showError('Recording completed but there was an error processing the data.');
        }
    }

    /**
     * Wait for uploads to complete
     */
    async waitForUploadsToComplete() {
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds max wait
        
        while (this.chunksUploaded < this.totalChunks && attempts < maxAttempts) {
            this.updateProcessingStatus(`Uploading remaining chunks: ${this.chunksUploaded}/${this.totalChunks}`);
            await this.sleep(1000);
            attempts++;
        }
        
        if (this.chunksUploaded < this.totalChunks) {
            console.warn('⚠️ Not all chunks were uploaded in time');
        } else {
            console.log('✅ All chunks uploaded successfully');
        }
    }

    /**
     * Update streaming progress in UI
     */
    updateStreamingProgress() {
        // Update chunk count
        const chunksElement = document.querySelector('#chunks-count');
        if (chunksElement) {
            chunksElement.textContent = this.totalChunks;
        }
        
        // Update upload progress
        const uploadElement = document.querySelector('#upload-progress');
        if (uploadElement) {
            uploadElement.textContent = `${this.chunksUploaded}/${this.totalChunks}`;
        }
    }

    /**
     * Update upload progress bar
     */
    updateUploadProgress(progress) {
        const progressBar = document.querySelector('#upload-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${progress.percentage}%`;
        }
        
        const progressText = document.querySelector('#upload-progress-text');
        if (progressText) {
            progressText.textContent = `${progress.percentage.toFixed(1)}% uploaded`;
        }
    }

    /**
     * Show streaming success
     */
    showStreamingSuccess(sessionData) {
        const message = `✅ Streaming recording completed successfully!\n\n` +
                       `Duration: ${this.formatDuration(sessionData.duration)}\n` +
                       `Chunks processed: ${sessionData.totalChunks}\n` +
                       `Chunks uploaded: ${sessionData.chunksUploaded}\n` +
                       `Clicks captured: ${sessionData.clickCount}\n` +
                       `Screenshots: ${sessionData.screenshotCount}\n\n` +
                       `All data has been streamed to the server!`;
        
        if (confirm(message + '\n\nView recording in backend?')) {
            window.open('http://localhost:8000/docs', '_blank');
        }
        
        // Close after delay
        setTimeout(() => window.close(), 3000);
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        return `${minutes}m ${seconds % 60}s`;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Replace your existing RecordingController
window.RecordingController = StreamingRecordingController;