/**
 * Optimized SOP Creator Side Panel
 * chrome_extension/src/sidepanel/sidepanel.js
 */

class OptimizedSOPCreator {
    constructor() {
        this.currentView = 'start';
        this.isRecording = false;
        this.isPaused = false;
        this.recordingService = null;
        this.sessionId = null;
        this.startTime = null;
        this.stats = {
            clicks: 0,
            screenshots: 0,
            chunks: 0,
            uploaded: 0
        };
        
        // Timers and intervals
        this.timerInterval = null;
        this.statsInterval = null;
        
        this.init();
    }

    async init() {
        console.log('🚀 Initializing Optimized SOP Creator...');
        
        try {
            // Setup event listeners first
            this.setupEventListeners();
            
            // Load optimized recording service
            await this.loadOptimizedRecordingService();
            
            // Check for existing session
            await this.checkExistingSession();
            
            // Test backend connection
            await this.testBackendConnection();
            
            console.log('✅ SOP Creator ready');
            
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            this.showError('Failed to initialize: ' + error.message);
        }
    }

    /**
     * Load optimized recording service
     */
    async loadOptimizedRecordingService() {
        return new Promise((resolve, reject) => {
            if (window.OptimizedRecordingService) {
                this.initializeRecordingService();
                resolve();
            } else {
                const script = document.createElement('script');
                script.src = '../services/OptimizedRecordingService.js';
                script.onload = () => {
                    this.initializeRecordingService();
                    resolve();
                };
                script.onerror = () => {
                    reject(new Error('Failed to load OptimizedRecordingService'));
                };
                document.head.appendChild(script);
            }
        });
    }

    /**
     * Initialize recording service with optimized handlers
     */
    initializeRecordingService() {
        this.recordingService = new OptimizedRecordingService();
        
        this.recordingService.setEventHandlers({
            onStart: () => this.handleRecordingStart(),
            onStop: (data) => this.handleRecordingStop(data),
            onPause: () => this.handleRecordingPause(),
            onResume: () => this.handleRecordingResume(),
            onError: (error) => this.handleRecordingError(error),
            onChunkProcessed: (data) => this.handleChunkProcessed(data),
            onUploadProgress: (progress) => this.handleUploadProgress(progress),
            onMemoryWarning: (data) => this.handleMemoryWarning(data)
        });
        
        console.log('✅ Recording service initialized');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Start capture buttons
        const startBtn = document.getElementById('start-capture-btn');
        const bottomBtn = document.getElementById('bottom-capture-btn');
        
        if (startBtn) startBtn.addEventListener('click', () => this.startCapture());
        if (bottomBtn) bottomBtn.addEventListener('click', () => this.startCapture());
        
        // Recording controls
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
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === ' ' && this.isRecording && e.target.tagName !== 'INPUT') {
                e.preventDefault();
                this.togglePause();
            }
            if (e.key === 'Escape' && this.isRecording) {
                this.stopRecording();
            }
        });
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isRecording) {
                console.log('📱 Page hidden, continuing recording...');
            }
        });
        
        // Handle beforeunload
        window.addEventListener('beforeunload', () => {
            if (this.isRecording) {
                this.cleanup();
            }
        });
    }

    /**
     * Test backend connection
     */
    async testBackendConnection() {
        try {
            const response = await fetch('http://localhost:8000/api/v1/health', {
                method: 'GET',
                timeout: 5000
            });
            
            if (response.ok) {
                console.log('✅ Backend connection successful');
                return true;
            } else {
                throw new Error(`Backend returned status: ${response.status}`);
            }
        } catch (error) {
            console.warn('⚠️ Backend connection failed:', error.message);
            this.showWarning('Backend not available. Recording will work but upload may fail.');
            return false;
        }
    }

    /**
     * Start capture with optimized flow
     */
    async startCapture() {
        try {
            console.log('🎬 Starting optimized capture...');
            
            // Validate prerequisites
            if (!this.recordingService || !OptimizedRecordingService.isSupported()) {
                throw new Error('Recording not supported in this browser');
            }
            
            // Generate session ID
            this.sessionId = this.generateSessionId();
            this.startTime = Date.now();
            
            // Reset stats
            this.resetStats();
            
            // Switch to recording view
            this.switchView('recording');
            
            // Start recording with session ID
            await this.recordingService.startRecording(this.sessionId);
            
            // Start cross-tab tracking
            await this.startCrossTabTracking();
            
            // Start UI updates
            this.startTimer();
            this.startStatsMonitoring();
            
            this.isRecording = true;
            
            // Add initial activity
            this.addActivity('start', 'Recording started');
            
            console.log('✅ Recording started successfully');
            
        } catch (error) {
            console.error('❌ Error starting capture:', error);
            this.showError('Failed to start recording: ' + error.message);
            this.switchView('start');
        }
    }

    /**
     * Start cross-tab tracking
     */
    async startCrossTabTracking() {
        try {
            // Get all tabs and inject tracker
            const tabs = await chrome.tabs.query({});
            let injected = 0;
            
            for (const tab of tabs) {
                if (this.isValidTabForTracking(tab)) {
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            files: ['../content-scripts/optimized-click-tracker.js']
                        });
                        injected++;
                    } catch (error) {
                        console.warn(`Could not inject tracker into tab ${tab.id}:`, error.message);
                    }
                }
            }
            
            console.log(`✅ Tracking injected into ${injected} tabs`);
            
            // Notify background script
            await chrome.runtime.sendMessage({
                type: 'start_recording',
                data: { sessionId: this.sessionId }
            });
            
        } catch (error) {
            console.error('❌ Error starting cross-tab tracking:', error);
        }
    }

    /**
     * Check if tab is valid for tracking
     */
    isValidTabForTracking(tab) {
        if (!tab.url) return false;
        
        const invalidPatterns = [
            'chrome://',
            'chrome-extension://',
            'edge://',
            'about:',
            'moz-extension://'
        ];
        
        return !invalidPatterns.some(pattern => tab.url.startsWith(pattern));
    }

    /**
     * Recording event handlers
     */
    handleRecordingStart() {
        console.log('📹 Recording started');
        this.addActivity('start', 'Screen recording started');
        this.updateRecordingIndicator(true);
    }

    handleRecordingStop(data) {
        console.log('🛑 Recording stopped:', data);
        
        // Stop timers
        this.stopTimers();
        
        // Stop tracking
        this.stopCrossTabTracking();
        
        // Show processing
        this.showProcessing();
        
        // Simulate final processing
        setTimeout(() => {
            this.hideProcessing();
            this.showSuccess(data);
            this.cleanup();
            this.switchView('start');
        }, 2000);
    }

    handleRecordingPause() {
        this.isPaused = true;
        this.updatePauseButton(true);
        this.addActivity('pause', 'Recording paused');
        console.log('⏸️ Recording paused');
    }

    handleRecordingResume() {
        this.isPaused = false;
        this.updatePauseButton(false);
        this.addActivity('resume', 'Recording resumed');
        console.log('▶️ Recording resumed');
    }

    handleRecordingError(error) {
        console.error('❌ Recording error:', error);
        this.showError('Recording error: ' + error.message);
        this.cleanup();
        this.switchView('start');
    }

    handleChunkProcessed(data) {
        this.stats.chunks = data.totalChunks;
        this.updateStats();
        
        // Add activity for significant chunks
        if (data.chunkId % 5 === 0) { // Every 5th chunk
            this.addActivity('chunk', `${data.totalChunks} chunks processed`);
        }
        
        console.log(`📦 Chunk ${data.chunkId} processed`);
    }

    handleUploadProgress(progress) {
        this.stats.uploaded = progress.uploaded;
        this.updateUploadProgress(progress);
        
        console.log(`📤 Upload progress: ${progress.percentage.toFixed(1)}%`);
    }

    handleMemoryWarning(data) {
        console.warn('⚠️ Memory warning:', data);
        this.showWarning(`High memory usage: ${data.percentage.toFixed(1)}%`);
    }

    /**
     * UI Control Methods
     */
    async togglePause() {
        try {
            if (!this.isRecording) return;
            
            if (this.isPaused) {
                await this.recordingService.resumeRecording();
            } else {
                await this.recordingService.pauseRecording();
            }
        } catch (error) {
            console.error('❌ Error toggling pause:', error);
            this.showError('Failed to toggle pause: ' + error.message);
        }
    }

    async stopRecording() {
        const confirmed = confirm('Stop recording? This will end the current session.');
        if (confirmed) {
            try {
                await this.recordingService.stopRecording();
            } catch (error) {
                console.error('❌ Error stopping recording:', error);
                this.showError('Failed to stop recording: ' + error.message);
            }
        }
    }

    async completeRecording() {
        const confirmed = confirm('Complete recording and generate SOP?');
        if (confirmed) {
            try {
                await this.recordingService.stopRecording();
            } catch (error) {
                console.error('❌ Error completing recording:', error);
                this.showError('Failed to complete recording: ' + error.message);
            }
        }
    }

    /**
     * UI Update Methods
     */
    switchView(viewName) {
        const views = document.querySelectorAll('.view');
        views.forEach(view => view.classList.remove('active'));
        
        const targetView = document.getElementById(`${viewName}-view`);
        if (targetView) {
            targetView.classList.add('active');
        }
        
        this.currentView = viewName;
        console.log(`📱 Switched to view: ${viewName}`);
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
        if (!this.startTime) return;
        
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
            this.checkRecordingHealth();
        }, 2000);
    }

    updateStats() {
        // Update click count
        const clickElement = document.getElementById('click-count');
        if (clickElement) {
            clickElement.textContent = this.stats.clicks;
        }
        
        // Update screenshot count
        const screenshotElement = document.getElementById('screenshot-count');
        if (screenshotElement) {
            screenshotElement.textContent = this.stats.screenshots;
        }
        
        // Update chunks count
        const chunksElement = document.getElementById('chunks-count');
        if (chunksElement) {
            chunksElement.textContent = this.stats.chunks;
        }
        
        // Update upload status
        const uploadElement = document.getElementById('upload-progress');
        if (uploadElement) {
            uploadElement.textContent = `${this.stats.uploaded}/${this.stats.chunks}`;
        }
    }

    updateUploadProgress(progress) {
        // Update progress bar
        const progressBar = document.getElementById('upload-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${progress.percentage}%`;
        }
        
        // Update progress text
        const progressText = document.getElementById('upload-progress-text');
        if (progressText) {
            progressText.textContent = `${progress.percentage.toFixed(1)}% uploaded`;
        }
    }

    updatePauseButton(isPaused) {
        const pauseBtn = document.getElementById('pause-btn');
        if (!pauseBtn) return;
        
        const pauseIcon = pauseBtn.querySelector('svg') || pauseBtn;
        
        if (isPaused) {
            pauseIcon.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5,3 19,12 5,21"></polygon>
                </svg>
            `;
        } else {
            pauseIcon.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
            `;
        }
        
        // Update recording indicator
        this.updateRecordingIndicator(!isPaused);
    }

    updateRecordingIndicator(isActive) {
        const recordingBadge = document.querySelector('.recording-badge span');
        if (recordingBadge) {
            recordingBadge.textContent = isActive ? 'Recording' : 'Paused';
        }
        
        const pulseDot = document.querySelector('.pulse-dot');
        if (pulseDot) {
            pulseDot.style.animationPlayState = isActive ? 'running' : 'paused';
        }
    }

    addActivity(type, text) {
        const stepsList = document.getElementById('steps-list');
        if (!stepsList) return;
        
        const elapsed = Date.now() - this.startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        const icons = {
            start: '▶️',
            pause: '⏸️',
            resume: '▶️',
            click: '👆',
            screenshot: '📷',
            chunk: '📦',
            upload: '📤'
        };
        
        const stepElement = document.createElement('div');
        stepElement.className = 'step-item';
        stepElement.innerHTML = `
            <div class="step-number">${icons[type] || '📋'}</div>
            <div class="step-text">${text}</div>
            <div class="step-time">${timeString}</div>
        `;
        
        // Add with animation
        stepElement.style.opacity = '0';
        stepElement.style.transform = 'translateY(-10px)';
        
        stepsList.insertBefore(stepElement, stepsList.firstChild);
        
        // Animate in
        setTimeout(() => {
            stepElement.style.transition = 'all 0.3s ease';
            stepElement.style.opacity = '1';
            stepElement.style.transform = 'translateY(0)';
        }, 10);
        
        // Keep only last 10 items
        const items = stepsList.querySelectorAll('.step-item');
        if (items.length > 10) {
            items[items.length - 1].remove();
        }
        
        // Auto-scroll to top
        stepsList.scrollTop = 0;
    }

    /**
     * Message handling from content scripts
     */
    handleMessage(message, sender, sendResponse) {
        switch (message.type) {
            case 'click_captured':
                this.handleClickCaptured(message.data);
                break;
                
            case 'screenshot_captured':
                this.handleScreenshotCaptured(message.data);
                break;
                
            case 'recording_stats':
                this.handleStatsUpdate(message.data);
                break;
        }
        
        if (sendResponse) {
            sendResponse({ success: true });
        }
    }

    handleClickCaptured(clickData) {
        if (!this.isRecording) return;
        
        this.stats.clicks++;
        this.updateStats();
        
        const elementText = clickData.element?.text || clickData.element?.tagName || 'element';
        this.addActivity('click', `Clicked: ${elementText.substring(0, 30)}`);
    }

    handleScreenshotCaptured(screenshotData) {
        if (!this.isRecording) return;
        
        this.stats.screenshots++;
        this.updateStats();
        
        this.addActivity('screenshot', screenshotData.description || 'Screenshot captured');
    }

    handleStatsUpdate(data) {
        Object.assign(this.stats, data);
        this.updateStats();
    }

    /**
     * Health monitoring
     */
    checkRecordingHealth() {
        if (!this.recordingService) return;
        
        const state = this.recordingService.getState();
        
        // Check for issues
        if (state.uploadQueueLength > 10) {
            console.warn('⚠️ Upload queue getting large:', state.uploadQueueLength);
        }
        
        if (state.memoryUsage && state.memoryUsage.used > 200) {
            console.warn('⚠️ High memory usage:', state.memoryUsage.used, 'MB');
        }
    }

    /**
     * Processing and success screens
     */
    showProcessing() {
        const overlay = document.getElementById('processing-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }
        
        this.simulateProcessing();
    }

    hideProcessing() {
        const overlay = document.getElementById('processing-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    async simulateProcessing() {
        const statusElement = document.getElementById('processing-status');
        const progressFill = document.getElementById('progress-fill');
        
        const steps = [
            'Finalizing video chunks...',
            'Processing click data...',
            'Analyzing screenshots...',
            'Generating SOP structure...',
            'Saving to database...'
        ];
        
        for (let i = 0; i < steps.length; i++) {
            if (statusElement) {
                statusElement.textContent = steps[i];
            }
            
            const progress = ((i + 1) / steps.length) * 100;
            if (progressFill) {
                progressFill.style.width = `${progress}%`;
            }
            
            await this.sleep(800);
        }
        
        if (statusElement) {
            statusElement.textContent = 'Processing complete!';
        }
    }

    showSuccess(data) {
        const duration = this.formatDuration(data.duration);
        const message = `✅ Recording completed successfully!\n\n` +
                       `Duration: ${duration}\n` +
                       `Chunks: ${data.totalChunks}\n` +
                       `Uploaded: ${data.uploadedChunks}\n` +
                       `Clicks: ${this.stats.clicks}\n` +
                       `Screenshots: ${this.stats.screenshots}`;
        
        if (confirm(message + '\n\nView in backend?')) {
            window.open('http://localhost:8000/docs', '_blank');
        }
    }

    /**
     * Error and warning handling
     */
    showError(message) {
        this.showToast(message, 'error');
    }

    showWarning(message) {
        this.showToast(message, 'warning');
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${this.getToastColor(type)};
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
        }, 10);
        
        // Auto remove
        setTimeout(() => {
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, 5000);
    }

    getToastColor(type) {
        const colors = {
            info: '#3b82f6',
            success: '#10b981',
            warning: '#f59e0b',
            error: '#ef4444'
        };
        return colors[type] || colors.info;
    }

    /**
     * Session management
     */
    async checkExistingSession() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'get_recording_stats'
            });
            
            if (response?.success && response.stats?.isRecording) {
                console.log('📱 Found existing recording session');
                
                // Resume existing session
                this.sessionId = response.stats.session.id;
                this.startTime = response.stats.session.startTime;
                this.isRecording = true;
                
                // Update stats
                this.stats.clicks = response.stats.clickCount || 0;
                this.stats.screenshots = response.stats.screenshotCount || 0;
                
                // Switch to recording view
                this.switchView('recording');
                this.startTimer();
                this.startStatsMonitoring();
                
                console.log('✅ Resumed existing session');
            }
        } catch (error) {
            console.warn('⚠️ Could not check existing session:', error);
        }
    }

    /**
     * Cross-tab tracking management
     */
    async stopCrossTabTracking() {
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
                            if (window.optimizedClickTracker) {
                                window.optimizedClickTracker.destroy();
                            }
                        }
                    });
                } catch (error) {
                    // Ignore errors for tabs we can't access
                }
            }
            
            console.log('✅ Cross-tab tracking stopped');
            
        } catch (error) {
            console.error('❌ Error stopping tracking:', error);
        }
    }

    /**
     * Cleanup and utility methods
     */
    stopTimers() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
    }

    resetStats() {
        this.stats = {
            clicks: 0,
            screenshots: 0,
            chunks: 0,
            uploaded: 0
        };
        this.updateStats();
    }

    async cleanup() {
        console.log('🧹 Cleaning up SOP Creator...');
        
        try {
            // Stop timers
            this.stopTimers();
            
            // Stop recording service
            if (this.recordingService && this.isRecording) {
                await this.recordingService.cleanup();
            }
            
            // Stop tracking
            await this.stopCrossTabTracking();
            
            // Reset state
            this.isRecording = false;
            this.isPaused = false;
            this.sessionId = null;
            this.startTime = null;
            
            // Reset UI
            this.resetStats();
            this.hideProcessing();
            
            console.log('✅ Cleanup completed');
            
        } catch (error) {
            console.error('❌ Cleanup error:', error);
        }
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

    /**
     * Public API for debugging
     */
    getState() {
        return {
            currentView: this.currentView,
            isRecording: this.isRecording,
            isPaused: this.isPaused,
            sessionId: this.sessionId,
            stats: { ...this.stats },
            recordingServiceState: this.recordingService?.getState()
        };
    }
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing SOP Creator...');
    window.optimizedSOPCreator = new OptimizedSOPCreator();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.optimizedSOPCreator?.isRecording) {
        window.optimizedSOPCreator.cleanup();
    }
});

// Export for debugging
window.OptimizedSOPCreator = OptimizedSOPCreator;