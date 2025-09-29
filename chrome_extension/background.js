/**
 * Optimized Background Service Worker
 * chrome_extension/background.js
 */

class OptimizedBackgroundService {
    constructor() {
        this.currentSession = null;
        this.trackingTabs = new Set();
        this.eventBuffer = [];
        this.maxBufferSize = 100;
        
        // Performance tracking
        this.startTime = null;
        this.stats = {
            totalEvents: 0,
            totalClicks: 0,
            totalScreenshots: 0,
            sessionsCreated: 0
        };
        
        this.init();
    }

    init() {
        console.log('🚀 Optimized Background Service initializing...');
        
        // Setup event listeners
        this.setupExtensionListeners();
        this.setupMessageHandlers();
        this.setupTabManagement();
        
        // Start periodic cleanup
        this.startPeriodicCleanup();
        
        console.log('✅ Background service ready');
    }

    /**
     * Setup extension lifecycle listeners
     */
    setupExtensionListeners() {
        // Extension installation
        chrome.runtime.onInstalled.addListener((details) => {
            console.log('📦 Extension installed/updated:', details.reason);
            
            this.initializeExtension();
        });

        // Side panel setup
        chrome.tabs.onActivated.addListener(async ({ tabId }) => {
            try {
                await chrome.sidePanel.setOptions({
                    tabId,
                    path: 'src/sidepanel/sidepanel.html',
                    enabled: true
                });
            } catch (error) {
                console.error('❌ Side panel setup error:', error);
            }
        });

        // Keep service worker alive
        chrome.runtime.onConnect.addListener((port) => {
            console.log('🔌 Port connected:', port.name);
        });
    }

    /**
     * Initialize extension data
     */
    async initializeExtension() {
        try {
            await chrome.storage.local.set({
                recordingSessions: [],
                settings: {
                    autoStartTracking: true,
                    screenshotQuality: 0.8,
                    includeMouseMovements: false,
                    debugMode: false
                },
                stats: this.stats
            });
            
            // Enable side panel for all tabs
            chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
            
            console.log('✅ Extension initialized');
            
        } catch (error) {
            console.error('❌ Extension initialization error:', error);
        }
    }

    /**
     * Setup message handlers
     */
    setupMessageHandlers() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log(`📨 Message: ${message.type} from ${sender.tab?.url || 'extension'}`);
            
            // Handle message asynchronously
            this.handleMessage(message, sender, sendResponse);
            
            return true; // Keep message channel open for async response
        });
    }

    /**
     * Handle messages efficiently
     */
    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'start_recording':
                    await this.handleStartRecording(message.data, sender, sendResponse);
                    break;
                    
                case 'stop_recording':
                    await this.handleStopRecording(message.data, sender, sendResponse);
                    break;
                    
                case 'batch_events':
                    await this.handleBatchEvents(message.data, sender, sendResponse);
                    break;
                    
                case 'tracker_initialized':
                    await this.handleTrackerInitialized(message.data, sender, sendResponse);
                    break;
                    
                case 'get_recording_stats':
                    await this.handleGetRecordingStats(sender, sendResponse);
                    break;
                    
                case 'clear_session_data':
                    await this.handleClearSessionData(message.data, sender, sendResponse);
                    break;
                    
                default:
                    console.warn('⚠️ Unknown message type:', message.type);
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('❌ Message handling error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    /**
     * Handle recording start
     */
    async handleStartRecording(data, sender, sendResponse) {
        try {
            console.log('🎬 Starting new recording session...');
            
            // Create new session
            this.currentSession = {
                id: data.sessionId || this.generateSessionId(),
                startTime: Date.now(),
                tabId: sender.tab?.id,
                url: sender.tab?.url,
                title: sender.tab?.title,
                status: 'recording',
                events: [],
                stats: {
                    clicks: 0,
                    screenshots: 0,
                    totalEvents: 0
                }
            };
            
            this.startTime = this.currentSession.startTime;
            
            // Start tracking on current tab
            if (sender.tab?.id) {
                await this.startTrackingOnTab(sender.tab.id);
            }
            
            // Save session
            await this.saveSession(this.currentSession);
            
            // Update global stats
            this.stats.sessionsCreated++;
            await this.saveStats();
            
            sendResponse({
                success: true,
                sessionId: this.currentSession.id,
                message: 'Recording started successfully'
            });
            
            // Notify extension pages
            this.notifyExtensionPages('recording_started', {
                sessionId: this.currentSession.id,
                startTime: this.currentSession.startTime
            });
            
            console.log(`✅ Recording session started: ${this.currentSession.id}`);
            
        } catch (error) {
            console.error('❌ Error starting recording:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    /**
     * Handle recording stop
     */
    async handleStopRecording(data, sender, sendResponse) {
        try {
            console.log('🛑 Stopping recording session...');
            
            if (!this.currentSession) {
                throw new Error('No active recording session');
            }
            
            // Update session
            this.currentSession.endTime = Date.now();
            this.currentSession.duration = this.currentSession.endTime - this.currentSession.startTime;
            this.currentSession.status = 'completed';
            
            // Stop all tracking
            await this.stopAllTracking();
            
            // Save final session data
            await this.saveSession(this.currentSession);
            
            const sessionData = {
                session: this.currentSession,
                stats: this.currentSession.stats,
                events: this.eventBuffer
            };
            
            sendResponse({
                success: true,
                message: 'Recording stopped successfully',
                data: sessionData
            });
            
            // Notify extension pages
            this.notifyExtensionPages('recording_stopped', sessionData);
            
            // Reset current session
            this.currentSession = null;
            this.eventBuffer = [];
            
            console.log('✅ Recording session stopped');
            
        } catch (error) {
            console.error('❌ Error stopping recording:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    /**
     * Handle batch events from content scripts
     */
    async handleBatchEvents(data, sender, sendResponse) {
        try {
            if (!this.currentSession) {
                sendResponse({ success: false, error: 'No active session' });
                return;
            }
            
            const { events, stats } = data;
            
            // Process events efficiently
            for (const event of events) {
                this.processEvent(event, sender);
            }
            
            // Update session stats
            if (stats) {
                this.currentSession.stats.clicks = stats.clicks || 0;
                this.currentSession.stats.screenshots = stats.screenshots || 0;
                this.currentSession.stats.totalEvents += events.length;
            }
            
            // Maintain buffer size
            this.maintainEventBuffer();
            
            // Update global stats
            this.stats.totalEvents += events.length;
            
            sendResponse({
                success: true,
                processed: events.length,
                totalEvents: this.currentSession.stats.totalEvents
            });
            
            // Notify extension pages with throttling
            this.throttledNotify('events_processed', {
                count: events.length,
                stats: this.currentSession.stats
            });
            
        } catch (error) {
            console.error('❌ Error handling batch events:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    /**
     * Process individual event
     */
    processEvent(event, sender) {
        try {
            // Add metadata
            event.tabId = sender.tab?.id;
            event.sessionId = this.currentSession.id;
            event.relativeTime = event.timestamp - this.currentSession.startTime;
            
            // Add to buffer
            this.eventBuffer.push(event);
            
            // Update specific stats
            switch (event.type) {
                case 'click':
                    this.stats.totalClicks++;
                    break;
                case 'screenshot':
                    this.stats.totalScreenshots++;
                    break;
            }
            
        } catch (error) {
            console.error('❌ Event processing error:', error);
        }
    }

    /**
     * Handle tracker initialization
     */
    async handleTrackerInitialized(data, sender, sendResponse) {
        try {
            if (sender.tab?.id) {
                this.trackingTabs.add(sender.tab.id);
                console.log(`✅ Tracker initialized on tab ${sender.tab.id}: ${data.url}`);
            }
            
            sendResponse({ success: true, message: 'Tracker registered' });
            
        } catch (error) {
            console.error('❌ Tracker initialization error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    /**
     * Handle recording stats request
     */
    async handleGetRecordingStats(sender, sendResponse) {
        try {
            const stats = {
                isRecording: !!this.currentSession,
                session: this.currentSession,
                globalStats: this.stats,
                eventBufferSize: this.eventBuffer.length,
                trackingTabs: Array.from(this.trackingTabs),
                duration: this.currentSession ? Date.now() - this.currentSession.startTime : 0
            };
            
            sendResponse({ success: true, stats });
            
        } catch (error) {
            console.error('❌ Stats request error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    /**
     * Handle session data clearing
     */
    async handleClearSessionData(data, sender, sendResponse) {
        try {
            const sessionId = data.sessionId;
            
            // Clear from storage
            await this.removeSessionData(sessionId);
            
            sendResponse({ success: true, message: 'Session data cleared' });
            
        } catch (error) {
            console.error('❌ Session clearing error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    /**
     * Tab management
     */
    setupTabManagement() {
        // Handle tab removal
        chrome.tabs.onRemoved.addListener((tabId) => {
            this.trackingTabs.delete(tabId);
            console.log(`🗑️ Removed tracking for tab ${tabId}`);
        });

        // Handle tab updates
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && this.trackingTabs.has(tabId)) {
                // Reinject tracker if page reloaded
                this.startTrackingOnTab(tabId);
            }
        });
    }

    /**
     * Start tracking on specific tab
     */
    async startTrackingOnTab(tabId) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['src/content-scripts/optimized-click-tracker.js']
            });
            
            this.trackingTabs.add(tabId);
            console.log(`🎯 Tracking started on tab ${tabId}`);
            
        } catch (error) {
            console.error(`❌ Error starting tracking on tab ${tabId}:`, error);
        }
    }

    /**
     * Stop all tracking
     */
    async stopAllTracking() {
        const promises = Array.from(this.trackingTabs).map(async (tabId) => {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: () => {
                        if (window.optimizedClickTracker) {
                            window.optimizedClickTracker.destroy();
                        }
                    }
                });
                
                console.log(`🛑 Tracking stopped on tab ${tabId}`);
                
            } catch (error) {
                console.error(`❌ Error stopping tracking on tab ${tabId}:`, error);
            }
        });
        
        await Promise.all(promises);
        this.trackingTabs.clear();
        
        console.log('✅ All tracking stopped');
    }

    /**
     * Event buffer management
     */
    maintainEventBuffer() {
        if (this.eventBuffer.length > this.maxBufferSize) {
            // Remove oldest events to maintain performance
            const excessCount = this.eventBuffer.length - this.maxBufferSize;
            this.eventBuffer.splice(0, excessCount);
            
            console.log(`🧹 Trimmed ${excessCount} old events from buffer`);
        }
    }

    /**
     * Storage management
     */
    async saveSession(session) {
        try {
            const { recordingSessions = [] } = await chrome.storage.local.get(['recordingSessions']);
            
            const existingIndex = recordingSessions.findIndex(s => s.id === session.id);
            if (existingIndex >= 0) {
                recordingSessions[existingIndex] = session;
            } else {
                recordingSessions.push(session);
            }
            
            // Limit stored sessions to prevent storage bloat
            if (recordingSessions.length > 20) {
                recordingSessions.splice(0, recordingSessions.length - 20);
            }
            
            await chrome.storage.local.set({ recordingSessions });
            
        } catch (error) {
            console.error('❌ Error saving session:', error);
        }
    }

    async saveStats() {
        try {
            await chrome.storage.local.set({ stats: this.stats });
        } catch (error) {
            console.error('❌ Error saving stats:', error);
        }
    }

    async removeSessionData(sessionId) {
        try {
            const { recordingSessions = [] } = await chrome.storage.local.get(['recordingSessions']);
            const filtered = recordingSessions.filter(s => s.id !== sessionId);
            await chrome.storage.local.set({ recordingSessions: filtered });
            
            console.log(`🗑️ Removed session data: ${sessionId}`);
            
        } catch (error) {
            console.error('❌ Error removing session data:', error);
        }
    }

    /**
     * Notification management
     */
    notifyExtensionPages(type, data) {
        chrome.runtime.sendMessage({
            type: type,
            data: data,
            source: 'background',
            timestamp: Date.now()
        }).catch(() => {
            // Ignore errors if no listeners
        });
    }

    // Throttled notification to prevent spam
    throttledNotify = this.throttle((type, data) => {
        this.notifyExtensionPages(type, data);
    }, 1000);

    /**
     * Periodic cleanup
     */
    startPeriodicCleanup() {
        // Run cleanup every 5 minutes
        setInterval(() => {
            this.performCleanup();
        }, 5 * 60 * 1000);
    }

    async performCleanup() {
        try {
            console.log('🧹 Performing periodic cleanup...');
            
            // Clean up old sessions (older than 24 hours)
            const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
            const { recordingSessions = [] } = await chrome.storage.local.get(['recordingSessions']);
            
            const filteredSessions = recordingSessions.filter(session => 
                session.startTime > cutoffTime
            );
            
            if (filteredSessions.length < recordingSessions.length) {
                await chrome.storage.local.set({ recordingSessions: filteredSessions });
                console.log(`🗑️ Cleaned up ${recordingSessions.length - filteredSessions.length} old sessions`);
            }
            
            // Clean up event buffer if too large
            if (this.eventBuffer.length > this.maxBufferSize / 2) {
                this.maintainEventBuffer();
            }
            
            // Save updated stats
            await this.saveStats();
            
        } catch (error) {
            console.error('❌ Cleanup error:', error);
        }
    }

    /**
     * Utility methods
     */
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

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

    /**
     * Get current service state (for debugging)
     */
    getState() {
        return {
            currentSession: this.currentSession,
            trackingTabs: Array.from(this.trackingTabs),
            eventBufferSize: this.eventBuffer.length,
            stats: this.stats,
            uptime: this.startTime ? Date.now() - this.startTime : 0
        };
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            // Test storage access
            await chrome.storage.local.get(['test']);
            
            // Test tab access
            const tabs = await chrome.tabs.query({ active: true });
            
            return {
                storage: true,
                tabs: tabs.length > 0,
                trackingTabs: this.trackingTabs.size,
                currentSession: !!this.currentSession,
                eventBuffer: this.eventBuffer.length,
                uptime: this.startTime ? Date.now() - this.startTime : 0
            };
            
        } catch (error) {
            console.error('❌ Health check failed:', error);
            return {
                storage: false,
                tabs: false,
                error: error.message
            };
        }
    }
}

// Initialize the background service
const backgroundService = new OptimizedBackgroundService();

// Make available for debugging
self.backgroundService = backgroundService;

// Handle service worker lifecycle
self.addEventListener('activate', (event) => {
    console.log('🔄 Service worker activated');
});

self.addEventListener('install', (event) => {
    console.log('📦 Service worker installed');
    self.skipWaiting();
});

// Handle unhandled promise rejections
self.addEventListener('unhandledrejection', (event) => {
    console.error('💥 Unhandled promise rejection:', event.reason);
});

// Keep service worker alive
chrome.runtime.onSuspend.addListener(() => {
    console.log('😴 Service worker suspending...');
});

console.log('✅ Optimized background service worker loaded');