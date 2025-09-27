/**
 * Complete Streaming Recording Controller
 * Prevents browser hanging by uploading video chunks in real-time
 */

class StreamingRecordingController {
    constructor() {
        this.startTime = Date.now();
        this.isPaused = false;
        this.isRecording = false;
        this.clickCount = 0;
        this.stepCount = 0;
        this.screenshotCount = 0;
        this.sessionId = null;
        this.recordingService = null;
        
        // Streaming-specific properties
        this.chunksUploaded = 0;
        this.totalChunks = 0;
        this.uploadProgress = 0;
        this.streamingEnabled = true;
        
        // Timers
        this.timerInterval = null;
        this.statsInterval = null;
        
        this.init();
    }

    async init() {
        try {
            console.log('🚀 Initializing streaming recording controller...');
            
            // Load and initialize streaming recording service
            await this.loadStreamingRecordingService();
            
            // Initialize recording service with streaming event handlers
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

    async startCapture() {
        try {
            console.log('🎬 Starting streaming capture...');
            
            // Validate streaming support
            if (!this.recordingService || !StreamingRecordingService.isSupported()) {
                throw new Error('Streaming recording not supported in this browser');
            }
            
            // Generate session ID
            this.sessionId = this.generateSessionId();
            this.startTime = Date.now();
            this.stepCount = 0;
            this.clickCount = 0;
            this.screenshotCount = 0;
            this.chunksUploaded = 0;
            this.totalChunks = 0;
            this.uploadProgress = 0;
            
            // Start streaming recording
            await this.recordingService.startRecording();
            
            // Start cross-tab click tracking
            await this.startClickTracking();
            
            // Start UI updates
            this.startTimer();
            this.startStatsMonitoring();
            
            this.isRecording = true;
            
            // Add initial step
            this.addStep('Started streaming SOP recording');
            
            console.log('✅ Streaming recording started successfully');
            
        } catch (error) {
            console.error('Error starting streaming capture:', error);
            this.showError('Failed to start recording: ' + error.message);
        }
    }

    async startClickTracking() {
        try {
            // Inject click tracker into all tabs
            const tabs = await chrome.tabs.query({});
            
            for (const tab of tabs) {
                if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                    continue;
                }
                
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['../content-scripts/click-tracker.js']
                    });
                } catch (error) {
                    console.warn('Could not inject tracker into tab:', tab.id);
                }
            }
            
            // Notify background script
            await chrome.runtime.sendMessage({
                type: 'start_recording',
                data: { sessionId: this.sessionId }
            });
            
        } catch (error) {
            console.error('Error starting click tracking:', error);
        }
    }

    setupEventListeners() {
        // Control buttons
        const pauseBtn = document.getElementById('pause-btn');
        const stopBtn = document.getElementById('stop-btn');
        const completeBtn = document.getElementById('complete-btn');

        if (pauseBtn) pauseBtn.addEventListener('click', () => this.togglePause());
        if (stopBtn) stopBtn.addEventListener('click', () => this.stopRecording());
        if (completeBtn) completeBtn.addEventListener('click', () => this.completeRecording());
        
        // Listen for background messages
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
        });
        
        // Prevent accidental close during recording
        window.addEventListener('beforeunload', (e) => {
            if (this.isRecording) {
                e.returnValue = 'Streaming recording in progress. Are you sure you want to leave?';
                return e.returnValue;
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === ' ' && this.isRecording && e.target.tagName !== 'INPUT') {
                e.preventDefault();
                this.togglePause();
            }
        });
    }

    startTimer() {
        this.updateTimer();
        this.timerInterval = setInterval(() => {
            if (!this.isPaused && this.isRecording) {
                this.updateTimer();
            }
        }, 1000);
    }

    updateTimer() {
        const elapsed = Date.now() - this.startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        const timerElement = document.getElementById('timer');
        if (timerElement) {
            timerElement.textContent = timeString;
        }
    }

    startStatsMonitoring() {
        this.statsInterval = setInterval(() => {
            this.updateStats();
        }, 2000); // Update every 2 seconds
    }

    updateStats() {
        // Update streaming-specific stats
        this.updateStreamingProgress();
        
        // Update memory usage if available
        if (performance.memory) {
            const usedMB = performance.memory.usedJSHeapSize / 1024 / 1024;
            console.log(`💾 Memory usage: ${usedMB.toFixed(1)} MB`);
            
            // Warn if memory gets high (shouldn't happen with streaming)
            if (usedMB > 200) {
                console.warn('⚠️ High memory usage detected - streaming may have an issue');
            }
        }
    }

    /**
     * STREAMING-SPECIFIC METHODS
     */

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
            
            // Wait for final uploads to complete
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
        const chunksElement = document.getElementById('chunks-count');
        if (chunksElement) {
            chunksElement.textContent = this.totalChunks;
        }
        
        // Update upload progress
        const uploadElement = document.getElementById('upload-progress');
        if (uploadElement) {
            uploadElement.textContent = `${this.chunksUploaded}/${this.totalChunks}`;
        }
    }

    /**
     * Update upload progress bar
     */
    updateUploadProgress(progress) {
        const progressBar = document.getElementById('upload-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${progress.percentage}%`;
        }
        
        const progressText = document.getElementById('upload-progress-text');
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
                       `All data has been streamed to the server - no memory issues!`;
        
        if (confirm(message + '\n\nView recording in backend?')) {
            window.open('http://localhost:8000/docs', '_blank');
        }
        
        // Close after delay
        setTimeout(() => window.close(), 3000);
    }

    /**
     * STANDARD RECORDING METHODS (Updated for streaming)
     */

    async togglePause() {
        try {
            if (this.isPaused) {
                await this.recordingService.resumeRecording();
            } else {
                await this.recordingService.pauseRecording();
            }
        } catch (error) {
            console.error('Error toggling pause:', error);
        }
    }

    async stopRecording() {
        const confirmed = confirm('Stop recording? This will finalize the current session.');
        if (confirmed) {
            try {
                await this.recordingService.stopRecording();
            } catch (error) {
                console.error('Error stopping recording:', error);
            }
        }
    }

    async completeRecording() {
        const confirmed = confirm('Complete recording and generate SOP?');
        if (confirmed) {
            try {
                await this.recordingService.stopRecording();
            } catch (error) {
                console.error('Error completing recording:', error);
                this.hideProcessingOverlay();
            }
        }
    }

    async stopTracking() {
        try {
            // Notify background script
            await chrome.runtime.sendMessage({
                type: 'stop_recording',
                data: { sessionId: this.sessionId }
            });
            
            // Clean up content scripts
            const tabs = await chrome.tabs.query({});
            
            for (const tab of tabs) {
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => {
                            if (window.sopClickTracker) {
                                window.sopClickTracker.destroy();
                            }
                        }
                    });
                } catch (error) {
                    console.warn('Could not cleanup tracker from tab:', tab.id);
                }
            }
            
        } catch (error) {
            console.error('Error stopping tracking:', error);
        }
    }

    // Recording service event handlers
    handleRecordingStart() {
        console.log('🎬 Streaming recording started');
        this.addActivity('start', 'Streaming recording started');
    }

    handleRecordingPause() {
        this.isPaused = true;
        this.updatePauseButton(true);
        this.addActivity('pause', 'Recording paused');
    }

    handleRecordingResume() {
        this.isPaused = false;
        this.updatePauseButton(false);
        this.addActivity('resume', 'Recording resumed');
    }

    handleRecordingError(error) {
        console.error('Streaming recording error:', error);
        this.showError('Recording error: ' + error.message);
        this.cleanup();
    }

    // Cross-browser tracking handlers
    handleMessage(message, sender, sendResponse) {
        switch (message.type) {
            case 'click_captured':
                this.handleNewClick(message.data);
                break;
            case 'screenshot_captured':
                this.handleNewScreenshot(message.data);
                break;
        }
        
        if (sendResponse) {
            sendResponse({ success: true });
        }
    }

    handleNewClick(clickData) {
        this.clickCount++;
        this.stepCount++;
        
        // Update counters
        this.updateStat('clicks-count', this.clickCount);
        this.updateStat('steps-count', this.stepCount);
        
        // Add to activity feed
        const elementText = clickData.element?.text || clickData.element?.tagName || 'element';
        this.addActivity('click', `Clicked on "${elementText}"`);
        
        console.log(`Click captured: ${elementText} (Total: ${this.clickCount})`);
    }

    handleNewScreenshot(screenshotData) {
        this.screenshotCount++;
        this.addActivity('screenshot', screenshotData.description || 'Screenshot captured');
    }

    updateStat(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }

    addActivity(type, text) {
        const activityFeed = document.getElementById('activity-feed');
        if (!activityFeed) return;
        
        const elapsed = Date.now() - this.startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        const icons = {
            start: '▶️',
            click: '👆',
            screenshot: '📷',
            chunk: '📦',
            pause: '⏸️',
            resume: '▶️',
            navigate: '🔗'
        };
        
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        activityItem.innerHTML = `
            <div class="activity-time">${timeString}</div>
            <div class="activity-icon ${type}">${icons[type] || '📋'}</div>
            <div class="activity-text">${text}</div>
        `;
        
        // Add animation
        activityItem.style.opacity = '0';
        activityItem.style.transform = 'translateY(-10px)';
        
        // Insert at top (after the start item)
        const startItem = activityFeed.querySelector('.start-item');
        if (startItem && startItem.nextSibling) {
            activityFeed.insertBefore(activityItem, startItem.nextSibling);
        } else {
            activityFeed.appendChild(activityItem);
        }
        
        // Animate in
        setTimeout(() => {
            activityItem.style.transition = 'all 0.3s ease';
            activityItem.style.opacity = '1';
            activityItem.style.transform = 'translateY(0)';
        }, 10);
        
        // Keep only last 10 items (plus start item)
        const items = activityFeed.querySelectorAll('.activity-item:not(.start-item)');
        if (items.length > 10) {
            items[items.length - 1].remove();
        }
    }

    updatePauseButton(isPaused) {
        const pauseBtn = document.getElementById('pause-btn');
        if (!pauseBtn) return;
        
        if (isPaused) {
            pauseBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5,3 19,12 5,21"></polygon>
                </svg>
                <span>Resume</span>
            `;
        } else {
            pauseBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
                <span>Pause</span>
            `;
        }
        
        // Update recording badge
        const recordingBadge = document.querySelector('.recording-badge span');
        if (recordingBadge) {
            recordingBadge.textContent = isPaused ? 'Paused' : 'Recording';
        }
        
        const pulseDot = document.querySelector('.pulse-dot');
        if (pulseDot) {
            pulseDot.style.animationPlayState = isPaused ? 'paused' : 'running';
        }
    }

    showProcessingOverlay() {
        const overlay = document.getElementById('processing-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }
        
        // Stop timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
    }

    hideProcessingOverlay() {
        const overlay = document.getElementById('processing-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    updateProcessingStatus(message) {
        console.log('📝 Status:', message);
        const statusElement = document.getElementById('processing-status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    showError(message) {
        // Simple toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(239, 68, 68, 0.9);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            backdrop-filter: blur(10px);
            max-width: 300px;
            text-align: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        `;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 5000);
    }

    generateSessionId() {
        return `sop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Cleanup
    cleanup() {
        console.log('🧹 Streaming controller cleanup...');
        
        try {
            // Stop all timers
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            
            if (this.statsInterval) {
                clearInterval(this.statsInterval);
                this.statsInterval = null;
            }
            
            // Stop recording service
            if (this.recordingService) {
                this.recordingService.cleanup();
            }
            
            // Reset state
            this.isRecording = false;
            this.isPaused = false;
            this.sessionId = null;
            this.startTime = null;
            this.stepCount = 0;
            this.clickCount = 0;
            this.screenshotCount = 0;
            this.chunksUploaded = 0;
            this.totalChunks = 0;
            this.uploadProgress = 0;
            
            // Force garbage collection
            if (window.gc) {
                window.gc();
            }
            
            console.log('✅ Streaming cleanup completed');
            
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }

    // Public API for debugging
    getState() {
        return {
            isRecording: this.isRecording,
            isPaused: this.isPaused,
            sessionId: this.sessionId,
            stepCount: this.stepCount,
            clickCount: this.clickCount,
            screenshotCount: this.screenshotCount,
            totalChunks: this.totalChunks,
            chunksUploaded: this.chunksUploaded,
            uploadProgress: this.uploadProgress,
            streamingEnabled: this.streamingEnabled
        };
    }
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎬 Initializing streaming recording controller...');
    window.recordingController = new StreamingRecordingController();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.recordingController && window.recordingController.isRecording) {
        window.recordingController.cleanup();
    }
});

// Export for debugging
window.StreamingRecordingController = StreamingRecordingController;