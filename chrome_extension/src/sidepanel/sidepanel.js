/**
 * Smart SOP Creator - Integrated Side Panel
 * Two-view workflow: Start → Recording (with real screen/audio capture)
 */

class SOPCreator {
    constructor() {
        this.currentView = 'start';
        this.isRecording = false;
        this.isPaused = false;
        this.recordingService = null;
        this.sessionId = null;
        this.startTime = null;
        this.stepCount = 0;
        this.clickCount = 0;
        this.screenshotCount = 0;
        
        // Timers
        this.timerInterval = null;
        this.statsInterval = null;
        
        this.init();
    }

    async init() {
        console.log('Initializing SOP Creator...');
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load recording service
        await this.loadRecordingService();
        
        // Check for existing session
        await this.checkExistingSession();
        
        console.log('SOP Creator ready');
    }

    async loadRecordingService() {
        return new Promise((resolve) => {
            if (window.RecordingService) {
                this.initializeRecordingService();
                resolve();
            } else {
                const script = document.createElement('script');
                script.src = '../services/RecordingService.js';
                script.onload = () => {
                    this.initializeRecordingService();
                    resolve();
                };
                script.onerror = () => {
                    console.error('Failed to load RecordingService');
                    resolve();
                };
                document.head.appendChild(script);
            }
        });
    }

    initializeRecordingService() {
        this.recordingService = new RecordingService();
        this.recordingService.init({
            onStart: () => this.handleRecordingStart(),
            onStop: (blob, duration) => this.handleRecordingStop(blob, duration),
            onPause: () => this.handleRecordingPause(),
            onResume: () => this.handleRecordingResume(),
            onError: (error) => this.handleRecordingError(error),
            onDataAvailable: (data) => this.handleRecordingData(data)
        });
    }

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
        });
    }

    async startCapture() {
        try {
            console.log('Starting capture...');
            
            // Validate recording support
            if (!this.recordingService || !RecordingService.isSupported()) {
                throw new Error('Screen recording not supported in this browser');
            }
            
            // Switch to recording view
            this.switchView('recording');
            
            // Initialize session
            this.sessionId = this.generateSessionId();
            this.startTime = Date.now();
            this.stepCount = 0;
            this.clickCount = 0;
            this.screenshotCount = 0;
            
            // Start real screen and audio recording
            await this.recordingService.startRecording();
            
            // Start cross-tab click tracking
            await this.startClickTracking();
            
            // Start UI updates
            this.startTimer();
            this.startStatsMonitoring();
            
            this.isRecording = true;
            
            // Add initial step
            this.addStep('Started SOP recording');
            
            console.log('Recording started successfully');
            
        } catch (error) {
            console.error('Error starting capture:', error);
            this.showError('Failed to start recording: ' + error.message);
            this.switchView('start');
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

    async togglePause() {
        try {
            if (!this.isRecording) return;
            
            const pauseIcon = document.getElementById('pause-icon');
            
            if (this.isPaused) {
                await this.recordingService.resumeRecording();
                this.isPaused = false;
                if (pauseIcon) pauseIcon.textContent = '⏸️';
                this.addStep('Recording resumed');
            } else {
                await this.recordingService.pauseRecording();
                this.isPaused = true;
                if (pauseIcon) pauseIcon.textContent = '▶️';
                this.addStep('Recording paused');
            }
            
        } catch (error) {
            console.error('Error toggling pause:', error);
        }
    }

    async stopRecording() {
        const confirmed = confirm('Stop recording? This will discard the current session.');
        if (confirmed) {
            await this.cleanup();
            this.switchView('start');
        }
    }

    async completeRecording() {
        const confirmed = confirm('Complete recording and generate SOP?');
        if (confirmed) {
            try {
                this.showProcessing();
                await this.recordingService.stopRecording();
            } catch (error) {
                console.error('Error completing recording:', error);
                this.hideProcessing();
            }
        }
    }

    startTimer() {
        this.updateTimer();
        this.timerInterval = setInterval(() => {
            if (!this.isPaused) {
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
            this.updateAudioLevel();
        }, 1000);
    }

    updateAudioLevel() {
        // Simulate audio level monitoring
        const audioElement = document.getElementById('audio-level');
        if (audioElement && this.recordingService && !this.isPaused) {
            const level = Math.floor(Math.random() * 40) + 60; // 60-100%
            audioElement.textContent = level + '%';
        }
    }

    addStep(description) {
        this.stepCount++;
        
        const stepsList = document.getElementById('steps-list');
        if (!stepsList) return;
        
        const stepElement = document.createElement('div');
        stepElement.className = 'step-item';
        
        const elapsed = Date.now() - this.startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        stepElement.innerHTML = `
            <div class="step-number">${this.stepCount}</div>
            <div class="step-text">${description}</div>
            <div class="step-time">${timeString}</div>
        `;
        
        stepsList.appendChild(stepElement);
        
        // Auto-scroll to bottom
        stepsList.scrollTop = stepsList.scrollHeight;
        
        // Keep only last 10 steps
        const steps = stepsList.querySelectorAll('.step-item');
        if (steps.length > 10) {
            steps[0].remove();
        }
    }

    switchView(viewName) {
        // Hide all views
        const views = document.querySelectorAll('.view');
        views.forEach(view => view.classList.remove('active'));
        
        // Show target view
        const targetView = document.getElementById(`${viewName}-view`);
        if (targetView) {
            targetView.classList.add('active');
        }
        
        this.currentView = viewName;
        console.log('Switched to view:', viewName);
    }

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
            'Stopping recording...',
            'Processing audio transcription...',
            'Analyzing captured screenshots...',
            'Generating SOP structure...',
            'Finalizing document...'
        ];
        
        for (let i = 0; i < steps.length; i++) {
            if (statusElement) {
                statusElement.textContent = steps[i];
            }
            
            const progress = ((i + 1) / steps.length) * 100;
            if (progressFill) {
                progressFill.style.width = `${progress}%`;
            }
            
            await this.sleep(1200);
        }
        
        // Complete
        if (statusElement) {
            statusElement.textContent = 'SOP created successfully!';
        }
        
        await this.sleep(1500);
        
        // In production, this would redirect to your backend/portal
        alert('SOP generated successfully! (Ready for backend integration)');
        
        this.hideProcessing();
        await this.cleanup();
        this.switchView('start');
    }

    // Recording event handlers
    handleRecordingStart() {
        console.log('Screen recording started');
        this.addStep('Screen and audio recording started');
    }

    async handleRecordingStop(blob, duration) {
        console.log('Recording stopped', { size: blob.size, duration });
        
        try {
            // Stop tracking
            await this.stopClickTracking();
            
            // In production: upload blob to your FastAPI backend
            console.log('Recording data ready for backend:', {
                blob: blob,
                duration: duration,
                sessionId: this.sessionId,
                stepCount: this.stepCount,
                clickCount: this.clickCount,
                screenshotCount: this.screenshotCount
            });
            
            // Continue processing
            // this.uploadToBackend(blob, duration);
            
        } catch (error) {
            console.error('Error handling recording stop:', error);
        }
    }

    handleRecordingPause() {
        console.log('Recording paused');
    }

    handleRecordingResume() {
        console.log('Recording resumed');
    }

    handleRecordingError(error) {
        console.error('Recording error:', error);
        this.showError('Recording error: ' + error.message);
        this.cleanup();
        this.switchView('start');
    }

    handleRecordingData(data) {
        // Handle real-time recording chunks if needed
        console.log('Recording data chunk:', data.size, 'bytes');
    }

    handleMessage(message, sender, sendResponse) {
        switch (message.type) {
            case 'click_captured':
                this.handleClickCaptured(message.data);
                break;
                
            case 'screenshot_captured':
                this.handleScreenshotCaptured(message.data);
                break;
                
            case 'recording_error':
                this.handleRecordingError(new Error(message.data.error));
                break;
        }
        
        if (sendResponse) {
            sendResponse({ success: true });
        }
    }

    handleClickCaptured(clickData) {
        if (!this.isRecording) return;
        
        this.clickCount++;
        
        // Update UI
        const clickElement = document.getElementById('click-count');
        if (clickElement) {
            clickElement.textContent = this.clickCount;
        }
        
        // Add step
        const elementText = clickData.element.text || clickData.element.tagName;
        this.addStep(`Clicked on "${elementText}"`);
    }

    handleScreenshotCaptured(screenshotData) {
        if (!this.isRecording) return;
        
        this.screenshotCount++;
        
        // Update UI
        const screenshotElement = document.getElementById('screenshot-count');
        if (screenshotElement) {
            screenshotElement.textContent = this.screenshotCount;
        }
        
        // Add step if significant
        if (screenshotData.description) {
            this.addStep(screenshotData.description);
        }
    }

    async stopClickTracking() {
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
            console.error('Error stopping click tracking:', error);
        }
    }

    async checkExistingSession() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'get_recording_stats'
            });
            
            if (response.success && response.stats.isRecording) {
                this.isRecording = true;
                this.sessionId = response.stats.session.id;
                this.startTime = response.stats.session.startTime;
                this.clickCount = response.stats.clickCount || 0;
                this.screenshotCount = response.stats.screenshotCount || 0;
                
                this.switchView('recording');
                this.startTimer();
                this.startStatsMonitoring();
                
                console.log('Resumed existing recording session');
            }
        } catch (error) {
            console.error('Error checking existing session:', error);
        }
    }

    async cleanup() {
        try {
            // Stop timers
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            
            if (this.statsInterval) {
                clearInterval(this.statsInterval);
                this.statsInterval = null;
            }
            
            // Stop recording if active
            if (this.recordingService && this.isRecording) {
                await this.recordingService.stopRecording();
            }
            
            // Stop click tracking
            await this.stopClickTracking();
            
            // Reset state
            this.isRecording = false;
            this.isPaused = false;
            this.sessionId = null;
            this.startTime = null;
            this.stepCount = 0;
            this.clickCount = 0;
            this.screenshotCount = 0;
            
            // Clear UI
            this.resetUI();
            
            console.log('Cleanup completed');
            
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }

    resetUI() {
        // Reset timer
        const timerElement = document.getElementById('timer');
        if (timerElement) timerElement.textContent = '00:00';
        
        // Reset stats
        const clickElement = document.getElementById('click-count');
        const screenshotElement = document.getElementById('screenshot-count');
        const audioElement = document.getElementById('audio-level');
        
        if (clickElement) clickElement.textContent = '0';
        if (screenshotElement) screenshotElement.textContent = '0';
        if (audioElement) audioElement.textContent = '0%';
        
        // Clear steps
        const stepsList = document.getElementById('steps-list');
        if (stepsList) {
            stepsList.innerHTML = '';
        }
        
        // Reset pause button
        const pauseIcon = document.getElementById('pause-icon');
        if (pauseIcon) pauseIcon.textContent = '⏸️';
        
        // Reset progress
        const progressFill = document.getElementById('progress-fill');
        if (progressFill) progressFill.style.width = '0%';
    }

    showError(message) {
        // Simple toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
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

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Public API for debugging
    getState() {
        return {
            currentView: this.currentView,
            isRecording: this.isRecording,
            isPaused: this.isPaused,
            sessionId: this.sessionId,
            stepCount: this.stepCount,
            clickCount: this.clickCount,
            screenshotCount: this.screenshotCount
        };
    }
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    window.sopCreator = new SOPCreator();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.sopCreator && window.sopCreator.isRecording) {
        window.sopCreator.cleanup();
    }
});

// Export for debugging
window.SOPCreator = SOPCreator;