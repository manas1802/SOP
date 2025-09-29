/**
 * Optimized Click Tracker - Memory efficient content script
 * chrome_extension/src/content-scripts/optimized-click-tracker.js
 */

class OptimizedClickTracker {
    constructor() {
        this.isActive = false;
        this.sessionId = null;
        this.clickCount = 0;
        this.screenshotCount = 0;
        
        // Performance optimization
        this.lastClickTime = 0;
        this.clickDebounce = 150; // Prevent rapid clicks
        this.lastScreenshotTime = 0;
        this.screenshotCooldown = 3000; // 3 seconds between screenshots
        
        // Memory management
        this.maxStoredEvents = 50; // Keep only last 50 events
        this.eventBuffer = [];
        this.batchSize = 10; // Send events in batches
        
        // Observers
        this.observers = [];
        this.throttledHandlers = new Map();
        
        this.init();
    }

    init() {
        console.log('🎯 Optimized Click Tracker initializing on:', window.location.href);
        
        // Check if already initialized
        if (window.optimizedClickTracker) {
            console.log('♻️ Replacing existing tracker');
            window.optimizedClickTracker.destroy();
        }
        
        // Set global reference
        window.optimizedClickTracker = this;
        
        // Setup optimized event listeners
        this.setupOptimizedListeners();
        
        // Setup message listener
        this.setupMessageListener();
        
        // Notify that tracker is ready
        this.notifyTrackerReady();
        
        // Start batch processing
        this.startBatchProcessor();
        
        console.log('✅ Optimized tracker ready');
    }

    /**
     * Setup optimized event listeners with throttling
     */
    setupOptimizedListeners() {
        // Optimized click handler with debouncing
        const optimizedClickHandler = this.throttle((event) => {
            this.handleOptimizedClick(event);
        }, this.clickDebounce);
        
        // Optimized input handler
        const optimizedInputHandler = this.throttle((event) => {
            this.handleOptimizedInput(event);
        }, 1000);
        
        // Optimized form handler
        const optimizedFormHandler = this.throttle((event) => {
            this.handleOptimizedForm(event);
        }, 500);
        
        // Add listeners with passive where possible
        document.addEventListener('click', optimizedClickHandler, { 
            capture: true, 
            passive: false 
        });
        
        document.addEventListener('input', optimizedInputHandler, { 
            passive: true 
        });
        
        document.addEventListener('submit', optimizedFormHandler, { 
            capture: true, 
            passive: false 
        });
        
        // Store handlers for cleanup
        this.throttledHandlers.set('click', optimizedClickHandler);
        this.throttledHandlers.set('input', optimizedInputHandler);
        this.throttledHandlers.set('submit', optimizedFormHandler);
        
        // Setup mutation observer with throttling
        this.setupOptimizedMutationObserver();
        
        // Setup navigation tracking
        this.setupOptimizedNavigationTracking();
        
        console.log('🎧 Optimized event listeners attached');
    }

    /**
     * Handle optimized click with memory efficiency
     */
    async handleOptimizedClick(event) {
        if (!this.isActive) return;
        
        const now = Date.now();
        
        // Debounce rapid clicks
        if (now - this.lastClickTime < this.clickDebounce) {
            return;
        }
        this.lastClickTime = now;
        
        try {
            const element = event.target;
            const clickData = this.extractOptimizedElementData(element, event);
            
            if (!clickData) return; // Skip if not relevant
            
            // Add to buffer for batch processing
            this.addToEventBuffer({
                type: 'click',
                data: clickData,
                timestamp: now
            });
            
            this.clickCount++;
            
            // Capture screenshot with cooldown
            if (this.shouldCaptureScreenshot(element, now)) {
                await this.captureOptimizedScreenshot(element, clickData);
            }
            
            console.log(`👆 Click captured: ${this.clickCount} total`);
            
        } catch (error) {
            console.error('❌ Click handling error:', error);
        }
    }

    /**
     * Extract optimized element data (smaller footprint)
     */
    extractOptimizedElementData(element, event) {
        // Skip non-interactive elements
        if (!this.isInteractiveElement(element)) {
            return null;
        }
        
        const rect = element.getBoundingClientRect();
        
        // Skip if element is not visible
        if (rect.width === 0 || rect.height === 0) {
            return null;
        }
        
        // Get essential data only
        const text = this.getElementText(element);
        const selector = this.generateOptimizedSelector(element);
        
        return {
            timestamp: Date.now(),
            url: window.location.href,
            pageTitle: document.title,
            element: {
                tagName: element.tagName.toLowerCase(),
                type: element.type || null,
                text: text,
                selector: selector,
                bounds: {
                    x: Math.round(rect.left),
                    y: Math.round(rect.top),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                }
            },
            click: {
                x: Math.round(event.clientX),
                y: Math.round(event.clientY)
            },
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            }
        };
    }

    /**
     * Check if element is interactive and worth tracking
     */
    isInteractiveElement(element) {
        const interactiveTags = ['button', 'a', 'input', 'select', 'textarea'];
        const interactiveTypes = ['button', 'submit', 'checkbox', 'radio'];
        
        // Check tag name
        if (interactiveTags.includes(element.tagName.toLowerCase())) {
            return true;
        }
        
        // Check input type
        if (element.type && interactiveTypes.includes(element.type.toLowerCase())) {
            return true;
        }
        
        // Check for click handlers or roles
        if (element.onclick || 
            element.getAttribute('role') === 'button' ||
            element.classList.contains('btn') ||
            element.classList.contains('button') ||
            window.getComputedStyle(element).cursor === 'pointer') {
            return true;
        }
        
        return false;
    }

    /**
     * Get element text efficiently
     */
    getElementText(element) {
        let text = '';
        
        // Priority order for text extraction
        text = element.textContent || 
               element.value || 
               element.placeholder || 
               element.alt || 
               element.title || 
               element.ariaLabel || '';
        
        // Clean and limit text
        return text.trim().substring(0, 100);
    }

    /**
     * Generate optimized selector (lightweight)
     */
    generateOptimizedSelector(element) {
        // Try ID first (most specific)
        if (element.id) {
            return `#${element.id}`;
        }
        
        // Try unique class combination
        if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\s+/).slice(0, 2);
            if (classes.length > 0) {
                const classSelector = '.' + classes.join('.');
                if (document.querySelectorAll(classSelector).length === 1) {
                    return classSelector;
                }
            }
        }
        
        // Fallback to tag name with position
        const tagName = element.tagName.toLowerCase();
        const siblings = Array.from(element.parentNode?.children || [])
            .filter(child => child.tagName === element.tagName);
        
        if (siblings.length > 1) {
            const index = siblings.indexOf(element) + 1;
            return `${tagName}:nth-of-type(${index})`;
        }
        
        return tagName;
    }

    /**
     * Handle optimized input with data protection
     */
    handleOptimizedInput(event) {
        if (!this.isActive) return;
        
        const element = event.target;
        
        // Skip sensitive inputs
        if (this.isSensitiveField(element)) {
            return;
        }
        
        // Debounce input events per element
        if (!element._sopInputTimeout) {
            element._sopInputTimeout = setTimeout(() => {
                this.processInputEvent(element);
                element._sopInputTimeout = null;
            }, 1500);
        }
    }

    /**
     * Process input event with data protection
     */
    processInputEvent(element) {
        try {
            let value = element.value || '';
            
            // Limit value length and hide sensitive data
            if (this.isSensitiveField(element)) {
                value = '[HIDDEN]';
            } else {
                value = value.substring(0, 50);
            }
            
            this.addToEventBuffer({
                type: 'input',
                data: {
                    timestamp: Date.now(),
                    url: window.location.href,
                    element: {
                        tagName: element.tagName.toLowerCase(),
                        type: element.type,
                        name: element.name,
                        id: element.id,
                        value: value
                    }
                },
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Input processing error:', error);
        }
    }

    /**
     * Handle optimized form submission
     */
    handleOptimizedForm(event) {
        if (!this.isActive) return;
        
        try {
            const form = event.target;
            const formData = new FormData(form);
            const data = {};
            
            // Extract non-sensitive form data
            for (const [key, value] of formData.entries()) {
                if (!this.isSensitiveField(key)) {
                    data[key] = value.toString().substring(0, 100);
                } else {
                    data[key] = '[HIDDEN]';
                }
            }
            
            this.addToEventBuffer({
                type: 'form_submit',
                data: {
                    timestamp: Date.now(),
                    url: window.location.href,
                    form: {
                        action: form.action || window.location.href,
                        method: form.method || 'GET',
                        data: data
                    }
                },
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Form processing error:', error);
        }
    }

    /**
     * Setup optimized mutation observer
     */
    setupOptimizedMutationObserver() {
        const observer = new MutationObserver(this.throttle((mutations) => {
            if (!this.isActive) return;
            
            let significantChanges = 0;
            
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Only count significant nodes
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE && 
                            node.tagName && 
                            !node.tagName.includes('SCRIPT')) {
                            significantChanges++;
                        }
                    }
                }
            }
            
            // Only track if substantial changes occurred
            if (significantChanges > 3) {
                this.handleDOMChange(significantChanges);
            }
            
        }, 2000)); // Throttle to every 2 seconds
        
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false, // Skip attribute changes for performance
            characterData: false // Skip text changes for performance
        });
        
        this.observers.push(observer);
    }

    /**
     * Handle DOM changes efficiently
     */
    handleDOMChange(changeCount) {
        this.addToEventBuffer({
            type: 'dom_change',
            data: {
                timestamp: Date.now(),
                url: window.location.href,
                changes: changeCount
            },
            timestamp: Date.now()
        });
        
        // Consider capturing screenshot for significant changes
        const now = Date.now();
        if (this.shouldCaptureScreenshot(null, now)) {
            this.captureOptimizedScreenshot(null, { description: 'Content loaded' });
        }
    }

    /**
     * Setup optimized navigation tracking
     */
    setupOptimizedNavigationTracking() {
        // Track page navigation efficiently
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function(...args) {
            originalPushState.apply(this, args);
            window.optimizedClickTracker?.handleNavigation('pushState');
        };
        
        history.replaceState = function(...args) {
            originalReplaceState.apply(this, args);
            window.optimizedClickTracker?.handleNavigation('replaceState');
        };
        
        // Throttled navigation handlers
        window.addEventListener('popstate', this.throttle(() => {
            this.handleNavigation('popstate');
        }, 1000));
        
        window.addEventListener('hashchange', this.throttle(() => {
            this.handleNavigation('hashchange');
        }, 1000));
    }

    /**
     * Handle navigation efficiently
     */
    handleNavigation(type) {
        if (!this.isActive) return;
        
        this.addToEventBuffer({
            type: 'navigation',
            data: {
                timestamp: Date.now(),
                navigation: {
                    type: type,
                    url: window.location.href,
                    title: document.title
                }
            },
            timestamp: Date.now()
        });
        
        // Capture screenshot for navigation
        setTimeout(() => {
            this.captureOptimizedScreenshot(null, { description: 'Page navigation' });
        }, 1000);
    }

    /**
     * Optimized screenshot capture with cooldown
     */
    async captureOptimizedScreenshot(element, metadata = {}) {
        const now = Date.now();
        
        // Check cooldown
        if (now - this.lastScreenshotTime < this.screenshotCooldown) {
            return;
        }
        this.lastScreenshotTime = now;
        
        try {
            // Use simple screenshot method for performance
            const screenshotData = await this.createSimpleScreenshot(element, metadata);
            
            if (screenshotData) {
                this.screenshotCount++;
                
                this.addToEventBuffer({
                    type: 'screenshot',
                    data: screenshotData,
                    timestamp: now
                });
                
                console.log(`📷 Screenshot captured: ${this.screenshotCount} total`);
            }
            
        } catch (error) {
            console.error('❌ Screenshot capture error:', error);
        }
    }

    /**
     * Create simple screenshot data
     */
    async createSimpleScreenshot(element, metadata) {
        try {
            // Create lightweight screenshot data without actual image
            // Image capture will be handled by the backend if needed
            return {
                timestamp: Date.now(),
                url: window.location.href,
                title: document.title,
                description: metadata.description || 'Screenshot',
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                },
                scrollPosition: {
                    x: window.pageXOffset,
                    y: window.pageYOffset
                },
                elementInfo: element ? {
                    tagName: element.tagName.toLowerCase(),
                    bounds: element.getBoundingClientRect()
                } : null
            };
            
        } catch (error) {
            console.error('❌ Screenshot data creation error:', error);
            return null;
        }
    }

    /**
     * Check if screenshot should be captured
     */
    shouldCaptureScreenshot(element, timestamp) {
        // Basic cooldown check
        if (timestamp - this.lastScreenshotTime < this.screenshotCooldown) {
            return false;
        }
        
        // Only capture for significant elements or events
        if (element) {
            const tagName = element.tagName.toLowerCase();
            const significantTags = ['button', 'a', 'input', 'select'];
            return significantTags.includes(tagName);
        }
        
        return true; // For navigation and DOM changes
    }

    /**
     * Event buffer management for batch processing
     */
    addToEventBuffer(event) {
        this.eventBuffer.push(event);
        
        // Maintain buffer size
        if (this.eventBuffer.length > this.maxStoredEvents) {
            this.eventBuffer.shift(); // Remove oldest event
        }
        
        // Auto-flush if buffer is getting full
        if (this.eventBuffer.length >= this.batchSize) {
            this.flushEventBuffer();
        }
    }

    /**
     * Start batch processor for efficient event sending
     */
    startBatchProcessor() {
        // Send events in batches every 5 seconds
        this.batchInterval = setInterval(() => {
            if (this.eventBuffer.length > 0) {
                this.flushEventBuffer();
            }
        }, 5000);
    }

    /**
     * Flush event buffer to background script
     */
    async flushEventBuffer() {
        if (this.eventBuffer.length === 0) return;
        
        try {
            const events = [...this.eventBuffer];
            this.eventBuffer = []; // Clear buffer immediately
            
            // Send batch to background script
            await chrome.runtime.sendMessage({
                type: 'batch_events',
                data: {
                    sessionId: this.sessionId,
                    events: events,
                    stats: {
                        clicks: this.clickCount,
                        screenshots: this.screenshotCount,
                        timestamp: Date.now()
                    }
                }
            });
            
            console.log(`📤 Sent batch of ${events.length} events`);
            
        } catch (error) {
            console.error('❌ Error flushing event buffer:', error);
            // Put events back in buffer for retry
            this.eventBuffer.unshift(...events);
        }
    }

    /**
     * Message listener for commands from extension
     */
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            try {
                switch (message.type) {
                    case 'start_tracking':
                        this.startSession(message.data.sessionId);
                        sendResponse({ success: true });
                        break;
                        
                    case 'stop_tracking':
                        this.stopSession();
                        sendResponse({ success: true });
                        break;
                        
                    case 'get_stats':
                        sendResponse({ 
                            success: true, 
                            stats: this.getStats() 
                        });
                        break;
                        
                    case 'capture_screenshot':
                        this.captureOptimizedScreenshot(null, message.data);
                        sendResponse({ success: true });
                        break;
                        
                    default:
                        sendResponse({ success: false, error: 'Unknown message type' });
                }
            } catch (error) {
                console.error('❌ Message handling error:', error);
                sendResponse({ success: false, error: error.message });
            }
            
            return true; // Keep message channel open
        });
    }

    /**
     * Session management
     */
    startSession(sessionId) {
        this.sessionId = sessionId;
        this.isActive = true;
        this.clickCount = 0;
        this.screenshotCount = 0;
        this.eventBuffer = [];
        
        console.log(`🎯 Tracking started for session: ${sessionId}`);
        this.addTrackingIndicator();
    }

    stopSession() {
        // Flush remaining events
        this.flushEventBuffer();
        
        this.isActive = false;
        this.sessionId = null;
        
        console.log('🛑 Tracking stopped');
        this.removeTrackingIndicator();
    }

    /**
     * Notify background that tracker is ready
     */
    async notifyTrackerReady() {
        try {
            await chrome.runtime.sendMessage({
                type: 'tracker_initialized',
                data: {
                    url: window.location.href,
                    title: document.title,
                    timestamp: Date.now(),
                    optimized: true
                }
            });
        } catch (error) {
            console.error('❌ Failed to notify tracker ready:', error);
        }
    }

    /**
     * Check if field contains sensitive data
     */
    isSensitiveField(field) {
        if (!field) return false;
        
        const fieldName = (typeof field === 'string') ? field : 
                         (field.name || field.id || field.className || '');
        
        const sensitivePatterns = [
            /password/i, /passwd/i, /pwd/i, /secret/i, /token/i, /key/i,
            /credit/i, /card/i, /ssn/i, /social/i, /bank/i, /account/i,
            /pin/i, /cvv/i, /cvc/i, /security/i
        ];
        
        return sensitivePatterns.some(pattern => pattern.test(fieldName));
    }

    /**
     * Visual indicator management
     */
    addTrackingIndicator() {
        this.removeTrackingIndicator();
        
        const indicator = document.createElement('div');
        indicator.id = 'optimized-tracking-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(16, 185, 129, 0.9);
            color: white;
            padding: 6px 12px;
            border-radius: 16px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 11px;
            font-weight: 600;
            z-index: 999999;
            pointer-events: none;
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        `;
        
        indicator.innerHTML = `
            <div style="width: 6px; height: 6px; background: white; border-radius: 50%; animation: pulse 1.5s infinite;"></div>
            Recording
        `;
        
        // Add animation styles
        if (!document.getElementById('optimized-tracker-styles')) {
            const style = document.createElement('style');
            style.id = 'optimized-tracker-styles';
            style.textContent = `
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.1); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(indicator);
    }

    removeTrackingIndicator() {
        const indicator = document.getElementById('optimized-tracking-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    /**
     * Utility methods
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
    }

    debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    /**
     * Get current statistics
     */
    getStats() {
        return {
            isActive: this.isActive,
            sessionId: this.sessionId,
            clickCount: this.clickCount,
            screenshotCount: this.screenshotCount,
            eventBufferLength: this.eventBuffer.length,
            url: window.location.href,
            title: document.title
        };
    }

    /**
     * Cleanup and destroy tracker
     */
    destroy() {
        console.log('🧹 Destroying optimized click tracker');
        
        try {
            // Stop batch processor
            if (this.batchInterval) {
                clearInterval(this.batchInterval);
                this.batchInterval = null;
            }
            
            // Flush remaining events
            this.flushEventBuffer();
            
            // Remove event listeners
            this.throttledHandlers.forEach((handler, type) => {
                document.removeEventListener(type, handler, true);
            });
            this.throttledHandlers.clear();
            
            // Disconnect observers
            this.observers.forEach(observer => observer.disconnect());
            this.observers = [];
            
            // Remove visual indicators
            this.removeTrackingIndicator();
            
            // Clear timeouts
            document.querySelectorAll('*').forEach(element => {
                if (element._sopInputTimeout) {
                    clearTimeout(element._sopInputTimeout);
                    element._sopInputTimeout = null;
                }
            });
            
            // Reset state
            this.isActive = false;
            this.sessionId = null;
            this.eventBuffer = [];
            this.clickCount = 0;
            this.screenshotCount = 0;
            
            // Remove global reference
            if (window.optimizedClickTracker === this) {
                window.optimizedClickTracker = null;
            }
            
            console.log('✅ Optimized tracker destroyed');
            
        } catch (error) {
            console.error('❌ Error destroying tracker:', error);
        }
    }
}

// Initialize tracker when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new OptimizedClickTracker();
    });
} else {
    new OptimizedClickTracker();
}

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.optimizedClickTracker) {
        window.optimizedClickTracker.destroy();
    }
});

console.log('✅ Optimized click tracker script loaded');