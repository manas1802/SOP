/**
 * Real Recording Service - Handles actual screen and audio recording
 */
class RecordingService {
    constructor() {
        this.mediaRecorder = null;
        this.screenStream = null;
        this.audioStream = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.isPaused = false;
        this.startTime = null;
        
        // Event callbacks
        this.onStart = null;
        this.onStop = null;
        this.onPause = null;
        this.onResume = null;
        this.onError = null;
        this.onDataAvailable = null;
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
        this.onDataAvailable = eventHandlers.onDataAvailable || (() => {});
    }

    /**
     * Start recording screen and audio
     */
    async startRecording() {
        try {
            if (this.isRecording) {
                throw new Error('Recording already in progress');
            }

            console.log('Starting screen recording...');

            // Request screen capture
            await this.getScreenStream();
            
            // Request microphone access
            await this.getMicrophoneStream();
            
            // Setup MediaRecorder
            await this.setupMediaRecorder();
            
            // Start recording
            this.mediaRecorder.start(1000); // Collect data every second
            this.isRecording = true;
            this.startTime = Date.now();
            
            console.log('Recording started successfully');
            this.onStart();

        } catch (error) {
            console.error('Failed to start recording:', error);
            this.cleanup();
            this.onError(error);
            throw error;
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

            console.log('Stopping recording...');
            
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.isPaused = false;
            
        } catch (error) {
            console.error('Error stopping recording:', error);
            this.onError(error);
            throw error;
        }
    }

    /**
     * Pause recording
     */
    pauseRecording() {
        try {
            if (!this.isRecording || this.isPaused) {
                throw new Error('Cannot pause recording');
            }

            this.mediaRecorder.pause();
            this.isPaused = true;
            this.onPause();
            
        } catch (error) {
            this.onError(error);
            throw error;
        }
    }

    /**
     * Resume recording
     */
    resumeRecording() {
        try {
            if (!this.isRecording || !this.isPaused) {
                throw new Error('Cannot resume recording');
            }

            this.mediaRecorder.resume();
            this.isPaused = false;
            this.onResume();
            
        } catch (error) {
            this.onError(error);
            throw error;
        }
    }

    /**
     * Get screen capture stream
     */
    async getScreenStream() {
        try {
            // Use Chrome extension desktopCapture API
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

            console.log('Screen stream obtained');

        } catch (error) {
            throw new Error(`Failed to get screen stream: ${error.message}`);
        }
    }

    /**
     * Get desktop capture stream ID using Chrome API
     */
    getDesktopCaptureId() {
        return new Promise((resolve, reject) => {
            chrome.desktopCapture.chooseDesktopMedia(
                ['screen', 'window', 'tab'],
                (streamId) => {
                    if (streamId) {
                        resolve(streamId);
                    } else {
                        reject(new Error('User cancelled screen sharing or permission denied'));
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
                    autoGainControl: true,
                    sampleRate: 44100
                },
                video: false
            });

            console.log('Microphone stream obtained');

        } catch (error) {
            console.warn('Could not get microphone:', error.message);
            // Continue without microphone
            this.audioStream = null;
        }
    }

    /**
     * Setup MediaRecorder with combined streams
     */
    async setupMediaRecorder() {
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

            // Setup MediaRecorder
            const options = this.getMediaRecorderOptions();
            this.mediaRecorder = new MediaRecorder(combinedStream, options);
            this.recordedChunks = [];

            // Event handlers
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                    this.onDataAvailable(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.recordedChunks, { 
                    type: this.getOutputMimeType() 
                });
                const duration = Date.now() - this.startTime;
                
                this.cleanup();
                this.onStop(blob, duration);
            };

            this.mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event.error);
                this.onError(new Error(`Recording error: ${event.error}`));
            };

            console.log('MediaRecorder setup complete');

        } catch (error) {
            throw new Error(`Failed to setup MediaRecorder: ${error.message}`);
        }
    }

    /**
     * Get MediaRecorder options with fallbacks
     */
    getMediaRecorderOptions() {
        const options = [
            { mimeType: 'video/webm;codecs=vp9,opus' },
            { mimeType: 'video/webm;codecs=vp8,opus' },
            { mimeType: 'video/webm;codecs=h264,opus' },
            { mimeType: 'video/webm' },
            { mimeType: 'video/mp4' }
        ];

        for (const option of options) {
            if (MediaRecorder.isTypeSupported(option.mimeType)) {
                console.log('Using MIME type:', option.mimeType);
                return option;
            }
        }

        console.warn('No supported MIME type found, using default');
        return {};
    }

    /**
     * Get output MIME type
     */
    getOutputMimeType() {
        if (this.mediaRecorder && this.mediaRecorder.mimeType) {
            return this.mediaRecorder.mimeType;
        }
        return 'video/webm';
    }

    /**
     * Cleanup streams and resources
     */
cleanup() {
    console.log('🧹 RecordingService cleanup...');
    
    try {
        // Stop recording immediately
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        // Close streams
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => {
                track.stop();
                console.log('🎥 Screen track stopped');
            });
            this.screenStream = null;
        }
        
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => {
                track.stop();
                console.log('🎤 Audio track stopped');
            });
            this.audioStream = null;
        }
        
        // Clear data arrays
        this.recordedChunks = [];
        this.mediaRecorder = null;
        this.isRecording = false;
        this.isPaused = false;
        
        console.log('✅ RecordingService cleanup completed');
        
    } catch (error) {
        console.error('RecordingService cleanup error:', error);
    }
}

    /**
     * Get current recording state
     */
    getState() {
        return {
            isRecording: this.isRecording,
            isPaused: this.isPaused,
            duration: this.isRecording ? Date.now() - this.startTime : 0,
            hasVideo: !!this.screenStream,
            hasAudio: !!this.audioStream,
            recordedSize: this.recordedChunks.reduce((size, chunk) => size + chunk.size, 0)
        };
    }

    /**
     * Get recorded data as blob
     */
    getRecordedBlob() {
        if (this.recordedChunks.length === 0) {
            return null;
        }
        
        return new Blob(this.recordedChunks, { 
            type: this.getOutputMimeType() 
        });
    }

    /**
     * Check browser support
     */
    static isSupported() {
        return !!(
            navigator.mediaDevices &&
            navigator.mediaDevices.getUserMedia &&
            window.MediaRecorder &&
            chrome.desktopCapture
        );
    }

    /**
     * Get supported MIME types
     */
    static getSupportedMimeTypes() {
        const types = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=h264,opus',
            'video/webm',
            'video/mp4'
        ];
        
        return types.filter(type => MediaRecorder.isTypeSupported(type));
    }
}

// Export for use in other files
if (typeof window !== 'undefined') {
    window.RecordingService = RecordingService;
}