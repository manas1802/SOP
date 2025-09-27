/**
 * Smart Click Tracker - Content Script
 * Captures user interactions across all web pages
 */

class SOPClickTracker {
    constructor() {
        this.isActive = false;
        this.sessionId = null;
        this.clickCount = 0;
        this.observers = [];
        this.lastScreenshot = null;
        
        this.init();
    }

    init() {
        console.log('SOP Click Tracker initializing on:', window.location.href);
        
        // Check if already initialized
        if (window.sopClickTracker) {
            console.log('Click tracker already exists, destroying old instance');
            window.sopClickTracker.destroy();
        }
        
        // Set global reference
        window.sopClickTracker = this;
        
        // Start tracking immediately
        this.startTracking();
        
        // Listen for messages from background script
        this.setupMessageListener();
        
        // Notify background script that tracker is ready
        this.notifyTrackerReady();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.type) {
                case 'start_tracking':
                    this.startSession(message.data.sessionId);
                    sendResponse({ success: true });
                    break;
                    
                case 'stop_tracking':
                    this.stopSession();
                    sendResponse({ success: true });
                    break;
                    
                case 'capture_screenshot':
                    this.captureScreenshot(message.data.description);
                    sendResponse({ success: true });
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        });
    }

    async notifyTrackerReady() {
        try {
            await chrome.runtime.sendMessage({
                type: 'tracker_initialized',
                data: {
                    url: window.location.href,
                    title: document.title,
                    timestamp: Date.now()
                }
            });
        } catch (error) {
            console.error('Failed to notify tracker ready:', error);
        }
    }

    startSession(sessionId) {
        this.sessionId = sessionId;
        this.isActive = true;
        this.clickCount = 0;
        
        console.log('Click tracking started for session:', sessionId);
        
        // Add visual indicator
        this.addTrackingIndicator();
    }

    stopSession() {
        this.isActive = false;
        this.sessionId = null;
        
        console.log('Click tracking stopped');
        
        // Remove visual indicator
        this.removeTrackingIndicator();
    }

    startTracking() {
        // Track clicks
        document.addEventListener('click', this.handleClick.bind(this), true);
        
        // Track form submissions
        document.addEventListener('submit', this.handleFormSubmit.bind(this), true);
        
        // Track input changes
        document.addEventListener('input', this.handleInput.bind(this), true);
        
        // Track key presses (for shortcuts, enter, etc.)
        document.addEventListener('keydown', this.handleKeyDown.bind(this), true);
        
        // Track page navigation
        this.setupNavigationTracking();
        
        // Track dynamic content changes
        this.setupMutationObserver();
        
        console.log('Event listeners attached');
    }

    async handleClick(event) {
        if (!this.isActive) return;
        
        try {
            const element = event.target;
            const clickData = this.extractElementData(element, event);
            
            // Capture screenshot before click
            await this.capturePreClickScreenshot(clickData);
            
            // Send click data to background script
            await this.sendClickData(clickData);
            
            this.clickCount++;
            
            // Capture screenshot after click (with delay for page changes)
            setTimeout(() => {
                this.capturePostClickScreenshot(clickData);
            }, 500);
            
        } catch (error) {
            console.error('Error handling click:', error);
        }
    }

    extractElementData(element, event) {
        const rect = element.getBoundingClientRect();
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        
        // Get element text content
        let text = element.textContent || element.value || element.placeholder || '';
        text = text.trim().substring(0, 100); // Limit length
        
        // Get element attributes
        const attributes = {};
        for (const attr of element.attributes) {
            if (['id', 'class', 'name', 'type', 'role', 'aria-label'].includes(attr.name)) {
                attributes[attr.name] = attr.value;
            }
        }
        
        // Determine element type
        const elementType = this.getElementType(element);
        
        // Get element path/selector
        const selector = this.generateUniqueSelector(element);
        
        return {
            timestamp: Date.now(),
            url: window.location.href,
            pageTitle: document.title,
            element: {
                tagName: element.tagName.toLowerCase(),
                type: elementType,
                text: text,
                attributes: attributes,
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
                y: Math.round(event.clientY),
                button: event.button,
                ctrlKey: event.ctrlKey,
                shiftKey: event.shiftKey,
                altKey: event.altKey
            },
            viewport: viewport,
            scrollPosition: {
                x: window.pageXOffset,
                y: window.pageYOffset
            }
        };
    }

    getElementType(element) {
        const tagName = element.tagName.toLowerCase();
        const type = element.type?.toLowerCase();
        const role = element.getAttribute('role');
        
        // Button types
        if (tagName === 'button' || type === 'button' || type === 'submit') {
            return 'button';
        }
        
        // Input types
        if (tagName === 'input') {
            return `input_${type || 'text'}`;
        }
        
        // Form elements
        if (['select', 'textarea'].includes(tagName)) {
            return tagName;
        }
        
        // Links
        if (tagName === 'a') {
            return 'link';
        }
        
        // Interactive elements
        if (role === 'button' || role === 'link' || role === 'tab') {
            return role;
        }
        
        // Check if element is clickable
        const style = window.getComputedStyle(element);
        if (style.cursor === 'pointer' || element.onclick) {
            return 'clickable';
        }
        
        return tagName;
    }

    generateUniqueSelector(element) {
        // Try ID first
        if (element.id) {
            return `#${element.id}`;
        }
        
        // Try unique class combination
        if (element.className) {
            const classes = element.className.trim().split(/\s+/).slice(0, 3);
            const classSelector = '.' + classes.join('.');
            if (document.querySelectorAll(classSelector).length === 1) {
                return classSelector;
            }
        }
        
        // Generate path-based selector
        const path = [];
        let current = element;
        
        while (current && current.nodeType === Node.ELEMENT_NODE) {
            let selector = current.tagName.toLowerCase();
            
            if (current.id) {
                selector += `#${current.id}`;
                path.unshift(selector);
                break;
            }
            
            if (current.className) {
                const classes = current.className.trim().split(/\s+/).slice(0, 2);
                if (classes.length > 0) {
                    selector += '.' + classes.join('.');
                }
            }
            
            // Add nth-child if needed for uniqueness
            const siblings = Array.from(current.parentNode?.children || [])
                .filter(child => child.tagName === current.tagName);
            
            if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += `:nth-child(${index})`;
            }
            
            path.unshift(selector);
            current = current.parentNode;
            
            // Limit depth
            if (path.length >= 5) break;
        }
        
        return path.join(' > ');
    }

    async handleFormSubmit(event) {
        if (!this.isActive) return;
        
        const form = event.target;
        const formData = new FormData(form);
        const data = {};
        
        for (const [key, value] of formData.entries()) {
            // Don't capture sensitive data
            if (!this.isSensitiveField(key)) {
                data[key] = value.toString().substring(0, 100);
            } else {
                data[key] = '[HIDDEN]';
            }
        }
        
        await this.sendActionData({
            type: 'form_submit',
            timestamp: Date.now(),
            url: window.location.href,
            form: {
                action: form.action || window.location.href,
                method: form.method || 'GET',
                data: data
            }
        });
    }

    async handleInput(event) {
        if (!this.isActive) return;
        
        const element = event.target;
        
        // Debounce input events
        clearTimeout(element._sopInputTimeout);
        element._sopInputTimeout = setTimeout(async () => {
            let value = element.value;
            
            // Hide sensitive inputs
            if (this.isSensitiveField(element.name || element.id)) {
                value = '[HIDDEN]';
            } else {
                value = value.substring(0, 100);
            }
            
            await this.sendActionData({
                type: 'input',
                timestamp: Date.now(),
                url: window.location.href,
                element: {
                    tagName: element.tagName.toLowerCase(),
                    type: element.type,
                    name: element.name,
                    id: element.id,
                    value: value
                }
            });
        }, 1000);
    }

    async handleKeyDown(event) {
        if (!this.isActive) return;
        
        // Track important key combinations
        const importantKeys = ['Enter', 'Tab', 'Escape'];
        const hasModifier = event.ctrlKey || event.altKey || event.metaKey;
        
        if (importantKeys.includes(event.key) || hasModifier) {
            await this.sendActionData({
                type: 'keyboard',
                timestamp: Date.now(),
                url: window.location.href,
                key: {
                    key: event.key,
                    code: event.code,
                    ctrlKey: event.ctrlKey,
                    shiftKey: event.shiftKey,
                    altKey: event.altKey,
                    metaKey: event.metaKey
                }
            });
        }
    }

    setupNavigationTracking() {
        // Track page navigation
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function(...args) {
            originalPushState.apply(this, args);
            window.sopClickTracker?.handleNavigation('pushState');
        };
        
        history.replaceState = function(...args) {
            originalReplaceState.apply(this, args);
            window.sopClickTracker?.handleNavigation('replaceState');
        };
        
        window.addEventListener('popstate', () => {
            this.handleNavigation('popstate');
        });
        
        // Track hash changes
        window.addEventListener('hashchange', () => {
            this.handleNavigation('hashchange');
        });
    }

    async handleNavigation(type) {
        if (!this.isActive) return;
        
        await this.sendActionData({
            type: 'navigation',
            timestamp: Date.now(),
            navigation: {
                type: type,
                url: window.location.href,
                title: document.title
            }
        });
        
        // Capture screenshot of new page
        setTimeout(() => {
            this.captureScreenshot('Page navigation');
        }, 1000);
    }

    setupMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            if (!this.isActive) return;
            
            // Track significant DOM changes
            let significantChanges = 0;
            
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    significantChanges += mutation.addedNodes.length;
                }
            }
            
            if (significantChanges > 5) {
                this.handleDOMChange(significantChanges);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false
        });
        
        this.observers.push(observer);
    }

    async handleDOMChange(changeCount) {
        // Debounce DOM change events
        clearTimeout(this._domChangeTimeout);
        this._domChangeTimeout = setTimeout(async () => {
            await this.sendActionData({
                type: 'dom_change',
                timestamp: Date.now(),
                url: window.location.href,
                changes: changeCount
            });
            
            // Capture screenshot of changes
            this.captureScreenshot('Content loaded');
        }, 2000);
    }

    async capturePreClickScreenshot(clickData) {
        await this.captureScreenshot(`Before clicking: ${clickData.element.text || clickData.element.tagName}`);
    }

    async capturePostClickScreenshot(clickData) {
        await this.captureScreenshot(`After clicking: ${clickData.element.text || clickData.element.tagName}`);
    }

    async captureScreenshot(description = 'Screenshot') {
        if (!this.isActive) return;
        
        try {
            // Rate limit screenshots
            const now = Date.now();
            if (this.lastScreenshot && (now - this.lastScreenshot) < 2000) {
                return; // Don't capture more than once every 2 seconds
            }
            this.lastScreenshot = now;
            
            // Use html2canvas if available, otherwise send message to background
            if (window.html2canvas) {
                const canvas = await html2canvas(document.body, {
                    width: window.innerWidth,
                    height: window.innerHeight,
                    scrollX: 0,
                    scrollY: 0
                });
                
                const dataUrl = canvas.toDataURL('image/png', 0.8);
                
                await this.sendScreenshotData({
                    description: description,
                    timestamp: Date.now(),
                    url: window.location.href,
                    image: dataUrl,
                    viewport: {
                        width: window.innerWidth,
                        height: window.innerHeight
                    }
                });
            } else {
                // Fallback: request screenshot from background script
                await chrome.runtime.sendMessage({
                    type: 'capture_screenshot',
                    data: {
                        description: description,
                        timestamp: Date.now(),
                        url: window.location.href
                    }
                });
            }
            
        } catch (error) {
            console.error('Screenshot capture failed:', error);
        }
    }

    async sendClickData(clickData) {
        try {
            await chrome.runtime.sendMessage({
                type: 'click_captured',
                data: clickData
            });
        } catch (error) {
            console.error('Failed to send click data:', error);
        }
    }

    async sendActionData(actionData) {
        try {
            await chrome.runtime.sendMessage({
                type: 'action_captured',
                data: actionData
            });
        } catch (error) {
            console.error('Failed to send action data:', error);
        }
    }

    async sendScreenshotData(screenshotData) {
        try {
            await chrome.runtime.sendMessage({
                type: 'screenshot_captured',
                data: screenshotData
            });
        } catch (error) {
            console.error('Failed to send screenshot data:', error);
        }
    }

    isSensitiveField(fieldName) {
        if (!fieldName) return false;
        
        const sensitivePatterns = [
            /password/i,
            /passwd/i,
            /pwd/i,
            /secret/i,
            /token/i,
            /key/i,
            /credit/i,
            /card/i,
            /ssn/i,
            /social/i,
            /bank/i,
            /account/i
        ];
        
        return sensitivePatterns.some(pattern => pattern.test(fieldName));
    }

    addTrackingIndicator() {
        // Remove existing indicator
        this.removeTrackingIndicator();
        
        const indicator = document.createElement('div');
        indicator.id = 'sop-tracking-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(239, 68, 68, 0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 20px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 12px;
            font-weight: 600;
            z-index: 999999;
            pointer-events: none;
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            gap: 6px;
            animation: sopPulse 2s infinite;
        `;
        
        indicator.innerHTML = `
            <div style="width: 8px; height: 8px; background: white; border-radius: 50%; animation: sopPulse 1s infinite;"></div>
            Recording
        `;
        
        // Add animation keyframes
        if (!document.getElementById('sop-styles')) {
            const style = document.createElement('style');
            style.id = 'sop-styles';
            style.textContent = `
                @keyframes sopPulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.05); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(indicator);
    }

    removeTrackingIndicator() {
        const indicator = document.getElementById('sop-tracking-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    destroy() {
        console.log('Destroying click tracker');
        
        this.isActive = false;
        
        // Remove event listeners
        document.removeEventListener('click', this.handleClick);
        document.removeEventListener('submit', this.handleFormSubmit);
        document.removeEventListener('input', this.handleInput);
        document.removeEventListener('keydown', this.handleKeyDown);
        
        // Disconnect observers
        this.observers.forEach(observer => observer.disconnect());
        this.observers = [];
        
        // Remove visual indicators
        this.removeTrackingIndicator();
        
        // Clear timeouts
        clearTimeout(this._domChangeTimeout);
        
        // Remove global reference
        if (window.sopClickTracker === this) {
            window.sopClickTracker = null;
        }
    }
}

// Initialize tracker when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new SOPClickTracker();
    });
} else {
    new SOPClickTracker();
}