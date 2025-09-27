/**
 * Screenshot Capture Service - Content Script
 * Integrates with your existing click tracker to capture real screenshots
 */

class ScreenshotCapture {
    constructor() {
        this.isActive = false;
        this.quality = 0.8;
        this.maxWidth = 1920;
        this.maxHeight = 1080;
        this.lastCaptureTime = 0;
        this.captureQueue = [];
        this.isProcessingQueue = false;
        
        this.init();
    }

    init() {
        console.log('Screenshot Capture Service initialized');
        
        // Listen for capture requests from your click tracker
        window.addEventListener('sopCaptureScreenshot', this.handleCaptureRequest.bind(this));
        
        // Make this available globally for your click tracker
        window.sopScreenshotCapture = this;
    }

    /**
     * Main screenshot capture method - replaces your placeholder
     */
    async captureScreenshot(options = {}) {
        try {
            const {
                description = 'Screenshot',
                element = null,
                fullPage = false,
                includeScrollPosition = true
            } = options;

            // Rate limiting - don't capture more than once per 2 seconds
            const now = Date.now();
            if (now - this.lastCaptureTime < 2000) {
                console.log('Screenshot rate limited');
                return null;
            }
            this.lastCaptureTime = now;

            let screenshot = null;

            // Try different capture methods in order of preference
            if (this.isHtml2CanvasAvailable()) {
                screenshot = await this.captureWithHtml2Canvas(fullPage);
            } else if (this.isScreenCaptureAvailable()) {
                screenshot = await this.captureWithScreenAPI();
            } else {
                screenshot = await this.captureWithCanvas();
            }

            if (!screenshot) {
                console.warn('No screenshot capture method succeeded');
                return null;
            }

            // Add metadata
            const metadata = {
                timestamp: Date.now(),
                url: window.location.href,
                title: document.title,
                description: description,
                viewport: this.getViewportInfo(),
                scrollPosition: includeScrollPosition ? this.getScrollPosition() : null,
                elementInfo: element ? this.getElementInfo(element) : null,
                captureMethod: screenshot.method || 'unknown'
            };

            return {
                image: screenshot.dataUrl,
                metadata: metadata,
                size: this.getImageSize(screenshot.dataUrl)
            };

        } catch (error) {
            console.error('Screenshot capture failed:', error);
            return null;
        }
    }

    /**
     * Method 1: HTML2Canvas (best quality, works offline)
     */
    async captureWithHtml2Canvas(fullPage = false) {
        try {
            if (!window.html2canvas) {
                // Dynamically load html2canvas if not available
                await this.loadHtml2Canvas();
            }

            const options = {
                allowTaint: false,
                useCORS: true,
                scale: 1,
                width: fullPage ? null : window.innerWidth,
                height: fullPage ? null : window.innerHeight,
                scrollX: fullPage ? 0 : window.pageXOffset,
                scrollY: fullPage ? 0 : window.pageYOffset,
                ignoreElements: (element) => {
                    return element.classList.contains('sop-click-indicator') ||
                           element.classList.contains('sop-recording-indicator') ||
                           element.hasAttribute('data-sop-ignore');
                }
            };

            const canvas = await html2canvas(document.body, options);
            const dataUrl = canvas.toDataURL('image/png', this.quality);

            return {
                dataUrl: dataUrl,
                method: 'html2canvas'
            };

        } catch (error) {
            console.error('HTML2Canvas capture failed:', error);
            return null;
        }
    }

    /**
     * Method 2: Screen Capture API (requires permissions)
     */
    async captureWithScreenAPI() {
        try {
            // Request screen capture through background script
            return new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    type: 'capture_screen',
                    data: {
                        options: {
                            mediaSource: 'screen',
                            width: { max: this.maxWidth },
                            height: { max: this.maxHeight }
                        }
                    }
                }, (response) => {
                    if (response && response.success) {
                        resolve({
                            dataUrl: response.dataUrl,
                            method: 'screen_api'
                        });
                    } else {
                        resolve(null);
                    }
                });
            });

        } catch (error) {
            console.error('Screen API capture failed:', error);
            return null;
        }
    }

    /**
     * Method 3: Canvas-based capture (fallback)
     */
    async captureWithCanvas() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = Math.min(window.innerWidth, this.maxWidth);
            canvas.height = Math.min(window.innerHeight, this.maxHeight);

            // Create a representation of the page
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw page title
            ctx.fillStyle = '#1f2937';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(document.title, canvas.width / 2, 50);

            // Draw URL
            ctx.fillStyle = '#6b7280';
            ctx.font = '16px Arial';
            ctx.fillText(window.location.hostname, canvas.width / 2, 80);

            // Draw timestamp
            ctx.fillStyle = '#9ca3af';
            ctx.font = '14px Arial';
            ctx.fillText(new Date().toLocaleString(), canvas.width / 2, canvas.height - 30);

            // Try to capture visible text content
            const textElements = document.querySelectorAll('h1, h2, h3, p, button, a');
            let y = 120;
            
            for (let i = 0; i < Math.min(textElements.length, 10) && y < canvas.height - 60; i++) {
                const element = textElements[i];
                if (this.isElementVisible(element)) {
                    const text = element.textContent.trim().substring(0, 50);
                    if (text) {
                        ctx.fillStyle = '#374151';
                        ctx.font = '12px Arial';
                        ctx.textAlign = 'left';
                        ctx.fillText(`• ${text}`, 20, y);
                        y += 20;
                    }
                }
            }

            const dataUrl = canvas.toDataURL('image/png', this.quality);
            
            return {
                dataUrl: dataUrl,
                method: 'canvas_fallback'
            };

        } catch (error) {
            console.error('Canvas capture failed:', error);
            return null;
        }
    }

    /**
     * Load html2canvas library dynamically
     */
    async loadHtml2Canvas() {
        return new Promise((resolve, reject) => {
            if (window.html2canvas) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load html2canvas'));
            document.head.appendChild(script);
        });
    }

    /**
     * Capture element-specific screenshot
     */
    async captureElement(element, padding = 10) {
        try {
            if (!this.isElementVisible(element)) {
                console.warn('Element not visible for capture');
                return null;
            }

            const rect = element.getBoundingClientRect();
            
            if (window.html2canvas) {
                const canvas = await html2canvas(element, {
                    allowTaint: false,
                    useCORS: true,
                    backgroundColor: null,
                    width: rect.width + (padding * 2),
                    height: rect.height + (padding * 2),
                    scrollX: 0,
                    scrollY: 0,
                    x: rect.left - padding,
                    y: rect.top - padding
                });

                return canvas.toDataURL('image/png', this.quality);
            }

            return null;

        } catch (error) {
            console.error('Element capture failed:', error);
            return null;
        }
    }

    /**
     * Handle capture requests from your click tracker
     */
    async handleCaptureRequest(event) {
        const { detail } = event;
        const screenshot = await this.captureScreenshot(detail);
        
        if (screenshot) {
            // Send back to click tracker
            window.dispatchEvent(new CustomEvent('sopScreenshotReady', {
                detail: {
                    requestId: detail.requestId,
                    screenshot: screenshot
                }
            }));
        }
    }

    /**
     * Queue-based screenshot capture for high-frequency events
     */
    queueCapture(options) {
        this.captureQueue.push({
            ...options,
            timestamp: Date.now(),
            id: this.generateId()
        });

        if (!this.isProcessingQueue) {
            this.processQueue();
        }
    }

    async processQueue() {
        this.isProcessingQueue = true;

        while (this.captureQueue.length > 0) {
            const request = this.captureQueue.shift();
            
            try {
                const screenshot = await this.captureScreenshot(request);
                
                if (screenshot && request.callback) {
                    request.callback(screenshot);
                }

                // Rate limiting between queued captures
                await this.sleep(1000);

            } catch (error) {
                console.error('Queued capture failed:', error);
            }
        }

        this.isProcessingQueue = false;
    }

    /**
     * Utility methods
     */
    isHtml2CanvasAvailable() {
        return typeof window.html2canvas === 'function';
    }

    isScreenCaptureAvailable() {
        return !!(chrome && chrome.runtime);
    }

    isElementVisible(element) {
        if (!element) return false;
        
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.right <= window.innerWidth &&
            rect.width > 0 &&
            rect.height > 0 &&
            window.getComputedStyle(element).visibility !== 'hidden' &&
            window.getComputedStyle(element).display !== 'none'
        );
    }

    getViewportInfo() {
        return {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio || 1
        };
    }

    getScrollPosition() {
        return {
            x: window.pageXOffset || document.documentElement.scrollLeft,
            y: window.pageYOffset || document.documentElement.scrollTop
        };
    }

    getElementInfo(element) {
        const rect = element.getBoundingClientRect();
        return {
            tagName: element.tagName.toLowerCase(),
            id: element.id || null,
            className: element.className || null,
            bounds: {
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height
            }
        };
    }

    getImageSize(dataUrl) {
        // Estimate size in bytes
        const base64Length = dataUrl.split(',')[1].length;
        return Math.round(base64Length * 0.75); // Approximate bytes
    }

    generateId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Integration method for your existing click tracker
     */
    async captureForClickTracker(description = 'Click screenshot') {
        const screenshot = await this.captureScreenshot({
            description: description,
            includeScrollPosition: true
        });

        if (screenshot) {
            return screenshot.image; // Return just the data URL for compatibility
        }

        return null;
    }

    /**
     * Start/stop capturing
     */
    start() {
        this.isActive = true;
        console.log('Screenshot capture started');
    }

    stop() {
        this.isActive = false;
        this.captureQueue = [];
        console.log('Screenshot capture stopped');
    }

    /**
     * Configuration
     */
    configure(options) {
        if (options.quality !== undefined) this.quality = options.quality;
        if (options.maxWidth !== undefined) this.maxWidth = options.maxWidth;
        if (options.maxHeight !== undefined) this.maxHeight = options.maxHeight;
    }

    /**
     * Get capture statistics
     */
    getStats() {
        return {
            isActive: this.isActive,
            queueLength: this.captureQueue.length,
            lastCaptureTime: this.lastCaptureTime,
            html2canvasAvailable: this.isHtml2CanvasAvailable(),
            screenApiAvailable: this.isScreenCaptureAvailable()
        };
    }
}

// Initialize and make available globally
if (typeof window !== 'undefined') {
    window.sopScreenshotCapture = new ScreenshotCapture();
}