/**
 * Complete Background Service Worker
 * Handles extension lifecycle, click tracking, and recording coordination
 */

// Extension setup
chrome.runtime.onInstalled.addListener(() => {
  console.log('SOP Creator extension installed');
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  
  // Initialize storage
  chrome.storage.local.set({
    recordingSessions: [],
    settings: {
      autoStartTracking: true,
      screenshotQuality: 0.8,
      includeMouseMovements: false
    }
  });
});

// Enable side panel for all tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'src/sidepanel/sidepanel.html',
      enabled: true
    });
  } catch (error) {
    console.error('Error setting side panel options:', error);
  }
});

// Global state management
let currentRecordingSession = null;
let clickTrackingTabs = new Set();
let recordingData = {
  clicks: [],
  screenshots: [],
  navigationEvents: [],
  startTime: null,
  endTime: null
};

// Message handling from content scripts and extension pages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type, 'from:', sender.tab?.url || 'extension');
  
  switch (message.type) {
    case 'start_recording':
      handleStartRecording(message.data, sender, sendResponse);
      break;
      
    case 'stop_recording':
      handleStopRecording(message.data, sender, sendResponse);
      break;
      
    case 'tracker_initialized':
      handleTrackerInitialized(message.data, sender, sendResponse);
      break;
      
    case 'click_captured':
      handleClickCaptured(message.data, sender, sendResponse);
      break;
      
    case 'screenshot_captured':
      handleScreenshotCaptured(message.data, sender, sendResponse);
      break;
      
    case 'keyboard_action':
      handleKeyboardAction(message.data, sender, sendResponse);
      break;
      
    case 'get_recording_stats':
      handleGetRecordingStats(sender, sendResponse);
      break;
      
    case 'clear_session_data':
      handleClearSessionData(message.data, sender, sendResponse);
      break;
      
    default:
      console.log('Unknown message type:', message.type);
      sendResponse({ success: false, error: 'Unknown message type' });
  }
  
  return true; // Keep message channel open for async response
});

// Handle recording start
async function handleStartRecording(data, sender, sendResponse) {
  try {
    console.log('Starting new recording session...');
    
    // Create new recording session
    currentRecordingSession = {
      id: generateSessionId(),
      startTime: Date.now(),
      tabId: sender.tab?.id,
      url: sender.tab?.url,
      title: sender.tab?.title,
      status: 'recording'
    };
    
    // Reset recording data
    recordingData = {
      clicks: [],
      screenshots: [],
      navigationEvents: [],
      startTime: Date.now(),
      endTime: null,
      sessionId: currentRecordingSession.id
    };
    
    // Start click tracking on current tab
    if (sender.tab?.id) {
      await startClickTrackingOnTab(sender.tab.id);
    }
    
    // Save session to storage
    await saveRecordingSession(currentRecordingSession);
    
    sendResponse({ 
      success: true, 
      sessionId: currentRecordingSession.id,
      message: 'Recording started successfully'
    });
    
    // Notify side panel
    notifyExtensionPages('recording_started', {
      sessionId: currentRecordingSession.id,
      startTime: recordingData.startTime
    });
    
  } catch (error) {
    console.error('Error starting recording:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Handle recording stop
async function handleStopRecording(data, sender, sendResponse) {
  try {
    console.log('Stopping recording session...');
    
    if (!currentRecordingSession) {
      throw new Error('No active recording session');
    }
    
    // Update session
    recordingData.endTime = Date.now();
    currentRecordingSession.status = 'completed';
    currentRecordingSession.endTime = recordingData.endTime;
    currentRecordingSession.duration = recordingData.endTime - recordingData.startTime;
    
    // Stop click tracking
    await stopAllClickTracking();
    
    // Save final recording data
    await saveRecordingData(recordingData);
    await saveRecordingSession(currentRecordingSession);
    
    const sessionData = {
      session: currentRecordingSession,
      recordingData: recordingData,
      stats: {
        duration: currentRecordingSession.duration,
        clickCount: recordingData.clicks.length,
        screenshotCount: recordingData.screenshots.length,
        navigationCount: recordingData.navigationEvents.length
      }
    };
    
    sendResponse({ 
      success: true, 
      message: 'Recording stopped successfully',
      data: sessionData
    });
    
    // Notify extension pages
    notifyExtensionPages('recording_stopped', sessionData);
    
    // Reset current session
    currentRecordingSession = null;
    
  } catch (error) {
    console.error('Error stopping recording:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Handle tracker initialization
async function handleTrackerInitialized(data, sender, sendResponse) {
  try {
    if (sender.tab?.id) {
      clickTrackingTabs.add(sender.tab.id);
      console.log(`Click tracker initialized on tab ${sender.tab.id}:`, data.url);
    }
    
    sendResponse({ success: true, message: 'Tracker registered' });
    
  } catch (error) {
    console.error('Error handling tracker initialization:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Handle click capture
async function handleClickCaptured(data, sender, sendResponse) {
  try {
    if (!currentRecordingSession) {
      sendResponse({ success: false, error: 'No active recording session' });
      return;
    }
    
    // Add metadata
    data.tabId = sender.tab?.id;
    data.recordingSessionId = currentRecordingSession.id;
    data.relativeTime = Date.now() - recordingData.startTime;
    
    // Store click data
    recordingData.clicks.push(data);
    
    console.log(`Click captured: ${data.element.text || data.element.tagName} (Total: ${recordingData.clicks.length})`);
    
    // Notify recording page about new click
    notifyExtensionPages('click_recorded', {
      clickData: data,
      totalClicks: recordingData.clicks.length
    });
    
    sendResponse({ success: true, clickCount: recordingData.clicks.length });
    
  } catch (error) {
    console.error('Error handling click capture:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Handle screenshot capture
async function handleScreenshotCaptured(data, sender, sendResponse) {
  try {
    if (!currentRecordingSession) {
      sendResponse({ success: false, error: 'No active recording session' });
      return;
    }
    
    // Add metadata
    data.tabId = sender.tab?.id;
    data.recordingSessionId = currentRecordingSession.id;
    data.relativeTime = Date.now() - recordingData.startTime;
    
    // Store screenshot data
    recordingData.screenshots.push(data);
    
    console.log(`Screenshot captured: ${data.description} (Total: ${recordingData.screenshots.length})`);
    
    // Notify recording page
    notifyExtensionPages('screenshot_recorded', {
      screenshotData: data,
      totalScreenshots: recordingData.screenshots.length
    });
    
    sendResponse({ success: true, screenshotCount: recordingData.screenshots.length });
    
  } catch (error) {
    console.error('Error handling screenshot capture:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Handle keyboard actions
async function handleKeyboardAction(data, sender, sendResponse) {
  try {
    if (!currentRecordingSession) {
      sendResponse({ success: false, error: 'No active recording session' });
      return;
    }
    
    data.tabId = sender.tab?.id;
    data.recordingSessionId = currentRecordingSession.id;
    data.relativeTime = Date.now() - recordingData.startTime;
    
    // Add to navigation events (keyboard actions can trigger navigation)
    recordingData.navigationEvents.push(data);
    
    sendResponse({ success: true });
    
  } catch (error) {
    console.error('Error handling keyboard action:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Handle recording stats request
async function handleGetRecordingStats(sender, sendResponse) {
  try {
    const stats = {
      isRecording: !!currentRecordingSession,
      session: currentRecordingSession,
      clickCount: recordingData.clicks.length,
      screenshotCount: recordingData.screenshots.length,
      navigationCount: recordingData.navigationEvents.length,
      duration: currentRecordingSession ? Date.now() - recordingData.startTime : 0,
      activeTabs: Array.from(clickTrackingTabs)
    };
    
    sendResponse({ success: true, stats });
    
  } catch (error) {
    console.error('Error getting recording stats:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Handle session data clearing
async function handleClearSessionData(data, sender, sendResponse) {
  try {
    const sessionId = data.sessionId;
    
    // Clear from storage
    await removeRecordingData(sessionId);
    await removeRecordingSession(sessionId);
    
    sendResponse({ success: true, message: 'Session data cleared' });
    
  } catch (error) {
    console.error('Error clearing session data:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Start click tracking on specific tab
async function startClickTrackingOnTab(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['src/content-scripts/click-tracker.js']
    });
    
    clickTrackingTabs.add(tabId);
    console.log(`Click tracking started on tab ${tabId}`);
    
  } catch (error) {
    console.error(`Error starting click tracking on tab ${tabId}:`, error);
  }
}

// Stop click tracking on all tabs
async function stopAllClickTracking() {
  const promises = Array.from(clickTrackingTabs).map(async (tabId) => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          if (window.sopClickTracker) {
            window.sopClickTracker.destroy();
          }
        }
      });
      
      console.log(`Click tracking stopped on tab ${tabId}`);
      
    } catch (error) {
      console.error(`Error stopping click tracking on tab ${tabId}:`, error);
    }
  });
  
  await Promise.all(promises);
  clickTrackingTabs.clear();
}

// Notify extension pages (side panel, recording page)
function notifyExtensionPages(type, data) {
  chrome.runtime.sendMessage({
    type: type,
    data: data,
    source: 'background',
    timestamp: Date.now()
  }).catch(() => {
    // Ignore errors if no listeners
  });
}

// Storage helpers
async function saveRecordingSession(session) {
  try {
    const { recordingSessions = [] } = await chrome.storage.local.get(['recordingSessions']);
    
    const existingIndex = recordingSessions.findIndex(s => s.id === session.id);
    if (existingIndex >= 0) {
      recordingSessions[existingIndex] = session;
    } else {
      recordingSessions.push(session);
    }
    
    await chrome.storage.local.set({ recordingSessions });
    
  } catch (error) {
    console.error('Error saving recording session:', error);
    throw error;
  }
}

async function saveRecordingData(data) {
  try {
    const key = `recording_data_${data.sessionId}`;
    await chrome.storage.local.set({ [key]: data });
    
  } catch (error) {
    console.error('Error saving recording data:', error);
    throw error;
  }
}

async function removeRecordingData(sessionId) {
  try {
    const key = `recording_data_${sessionId}`;
    await chrome.storage.local.remove([key]);
    
  } catch (error) {
    console.error('Error removing recording data:', error);
    throw error;
  }
}

async function removeRecordingSession(sessionId) {
  try {
    const { recordingSessions = [] } = await chrome.storage.local.get(['recordingSessions']);
    const filtered = recordingSessions.filter(s => s.id !== sessionId);
    await chrome.storage.local.set({ recordingSessions: filtered });
    
  } catch (error) {
    console.error('Error removing recording session:', error);
    throw error;
  }
}

// Utility functions
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Tab management
chrome.tabs.onRemoved.addListener((tabId) => {
  clickTrackingTabs.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && clickTrackingTabs.has(tabId)) {
    // Reinject content script if page reloaded
    startClickTrackingOnTab(tabId);
  }
});

// Keep service worker alive
chrome.runtime.onConnect.addListener((port) => {
  console.log('Port connected:', port.name);
});

console.log('SOP Creator background service worker loaded');