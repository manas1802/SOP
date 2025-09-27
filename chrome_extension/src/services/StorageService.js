/**
 * Storage Service - Manages local data storage and sync
 */

class StorageService {
    constructor() {
        this.storageArea = chrome.storage.local;
        this.maxStorageSize = 100 * 1024 * 1024; // 100MB limit
        this.compressionThreshold = 1024 * 1024; // 1MB - compress larger data
    }

    /**
     * Save recording session data
     */
    async saveRecordingSession(sessionData) {
        try {
            const key = `session_${sessionData.sessionId}`;
            await this.storageArea.set({ [key]: sessionData });
            
            // Update session index
            await this.updateSessionIndex(sessionData.sessionId, 'add');
            
            console.log('Recording session saved:', sessionData.sessionId);
            return true;
            
        } catch (error) {
            console.error('Failed to save recording session:', error);
            throw error;
        }
    }

    /**
     * Get recording session data
     */
    async getRecordingSession(sessionId) {
        try {
            const key = `session_${sessionId}`;
            const result = await this.storageArea.get([key]);
            return result[key] || null;
            
        } catch (error) {
            console.error('Failed to get recording session:', error);
            return null;
        }
    }

    /**
     * Save click data for a session
     */
    async saveClickData(sessionId, clicksArray) {
        try {
            const key = `clicks_${sessionId}`;
            const data = {
                sessionId,
                clicks: clicksArray,
                timestamp: Date.now(),
                count: clicksArray.length
            };
            
            // Compress if data is large
            const compressedData = await this.maybeCompress(data);
            await this.storageArea.set({ [key]: compressedData });
            
            console.log(`Saved ${clicksArray.length} clicks for session:`, sessionId);
            return true;
            
        } catch (error) {
            console.error('Failed to save click data:', error);
            throw error;
        }
    }

    /**
     * Get click data for a session
     */
    async getClickData(sessionId) {
        try {
            const key = `clicks_${sessionId}`;
            const result = await this.storageArea.get([key]);
            const data = result[key];
            
            if (!data) return { clicks: [], count: 0 };
            
            // Decompress if needed
            const decompressedData = await this.maybeDecompress(data);
            return decompressedData;
            
        } catch (error) {
            console.error('Failed to get click data:', error);
            return { clicks: [], count: 0 };
        }
    }

    /**
     * Save screenshot data (metadata only, images stored separately)
     */
    async saveScreenshotData(sessionId, screenshotsArray) {
        try {
            const key = `screenshots_${sessionId}`;
            
            // Store only metadata, not the image data
            const metadata = screenshotsArray.map(screenshot => ({
                description: screenshot.description,
                timestamp: screenshot.timestamp,
                url: screenshot.url,
                viewport: screenshot.viewport,
                id: screenshot.id || this.generateId()
            }));
            
            const data = {
                sessionId,
                screenshots: metadata,
                timestamp: Date.now(),
                count: metadata.length
            };
            
            await this.storageArea.set({ [key]: data });
            
            console.log(`Saved ${metadata.length} screenshot metadata for session:`, sessionId);
            return true;
            
        } catch (error) {
            console.error('Failed to save screenshot data:', error);
            throw error;
        }
    }

    /**
     * Save user settings/preferences
     */
    async saveUserSettings(settings) {
        try {
            const currentSettings = await this.getUserSettings();
            const mergedSettings = { ...currentSettings, ...settings };
            
            await this.storageArea.set({ user_settings: mergedSettings });
            
            console.log('User settings saved:', mergedSettings);
            return true;
            
        } catch (error) {
            console.error('Failed to save user settings:', error);
            throw error;
        }
    }

    /**
     * Get user settings/preferences
     */
    async getUserSettings() {
        try {
            const result = await this.storageArea.get(['user_settings']);
            return result.user_settings || this.getDefaultSettings();
            
        } catch (error) {
            console.error('Failed to get user settings:', error);
            return this.getDefaultSettings();
        }
    }

    /**
     * Get default settings
     */
    getDefaultSettings() {
        return {
            recordingQuality: 'high',
            autoStartTracking: true,
            includeAudio: true,
            includeMicrophone: true,
            screenshotInterval: 5000, // 5 seconds
            maxRecordingDuration: 3600000, // 1 hour
            autoUpload: true,
            compressionEnabled: true,
            notifications: true,
            debugMode: false
        };
    }

    /**
     * Get all recording sessions
     */
    async getAllSessions() {
        try {
            const sessionIndex = await this.getSessionIndex();
            const sessionKeys = sessionIndex.map(id => `session_${id}`);
            
            if (sessionKeys.length === 0) return [];
            
            const result = await this.storageArea.get(sessionKeys);
            return Object.values(result).filter(Boolean);
            
        } catch (error) {
            console.error('Failed to get all sessions:', error);
            return [];
        }
    }

    /**
     * Delete recording session and associated data
     */
    async deleteSession(sessionId) {
        try {
            const keysToDelete = [
                `session_${sessionId}`,
                `clicks_${sessionId}`,
                `screenshots_${sessionId}`,
                `audio_${sessionId}`,
                `processing_${sessionId}`
            ];
            
            await this.storageArea.remove(keysToDelete);
            await this.updateSessionIndex(sessionId, 'remove');
            
            console.log('Session deleted:', sessionId);
            return true;
            
        } catch (error) {
            console.error('Failed to delete session:', error);
            throw error;
        }
    }

    /**
     * Clear all data (for reset/cleanup)
     */
    async clearAllData() {
        try {
            const confirmed = confirm('This will delete all recorded data. Are you sure?');
            if (!confirmed) return false;
            
            await this.storageArea.clear();
            console.log('All storage data cleared');
            return true;
            
        } catch (error) {
            console.error('Failed to clear all data:', error);
            throw error;
        }
    }

    /**
     * Get storage usage statistics
     */
    async getStorageStats() {
        try {
            const result = await this.storageArea.get(null);
            const entries = Object.entries(result);
            
            let totalSize = 0;
            const stats = {
                sessions: 0,
                clicks: 0,
                screenshots: 0,
                totalEntries: entries.length,
                sizeByType: {}
            };
            
            for (const [key, value] of entries) {
                const size = this.estimateSize(value);
                totalSize += size;
                
                if (key.startsWith('session_')) {
                    stats.sessions++;
                    stats.sizeByType.sessions = (stats.sizeByType.sessions || 0) + size;
                } else if (key.startsWith('clicks_')) {
                    stats.clicks++;
                    stats.sizeByType.clicks = (stats.sizeByType.clicks || 0) + size;
                } else if (key.startsWith('screenshots_')) {
                    stats.screenshots++;
                    stats.sizeByType.screenshots = (stats.sizeByType.screenshots || 0) + size;
                } else {
                    stats.sizeByType.other = (stats.sizeByType.other || 0) + size;
                }
            }
            
            stats.totalSize = totalSize;
            stats.usagePercentage = (totalSize / this.maxStorageSize) * 100;
            
            return stats;
            
        } catch (error) {
            console.error('Failed to get storage stats:', error);
            return null;
        }
    }

    /**
     * Clean up old data to free space
     */
    async cleanupOldData(daysOld = 7) {
        try {
            const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
            const sessions = await this.getAllSessions();
            
            let cleanedCount = 0;
            
            for (const session of sessions) {
                if (session.startTime < cutoffTime) {
                    await this.deleteSession(session.sessionId);
                    cleanedCount++;
                }
            }
            
            console.log(`Cleaned up ${cleanedCount} old sessions`);
            return cleanedCount;
            
        } catch (error) {
            console.error('Failed to cleanup old data:', error);
            return 0;
        }
    }

    /**
     * Export data for backup
     */
    async exportData() {
        try {
            const allData = await this.storageArea.get(null);
            const exportData = {
                timestamp: Date.now(),
                version: '1.0',
                data: allData
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
                type: 'application/json' 
            });
            
            return blob;
            
        } catch (error) {
            console.error('Failed to export data:', error);
            throw error;
        }
    }

    /**
     * Import data from backup
     */
    async importData(jsonData) {
        try {
            const parsed = JSON.parse(jsonData);
            
            if (!parsed.data || !parsed.version) {
                throw new Error('Invalid backup data format');
            }
            
            // Clear existing data
            await this.storageArea.clear();
            
            // Import new data
            await this.storageArea.set(parsed.data);
            
            console.log('Data imported successfully');
            return true;
            
        } catch (error) {
            console.error('Failed to import data:', error);
            throw error;
        }
    }

    /**
     * Manage session index for quick lookups
     */
    async updateSessionIndex(sessionId, action = 'add') {
        try {
            const currentIndex = await this.getSessionIndex();
            
            if (action === 'add' && !currentIndex.includes(sessionId)) {
                currentIndex.push(sessionId);
            } else if (action === 'remove') {
                const index = currentIndex.indexOf(sessionId);
                if (index > -1) {
                    currentIndex.splice(index, 1);
                }
            }
            
            await this.storageArea.set({ session_index: currentIndex });
            
        } catch (error) {
            console.error('Failed to update session index:', error);
        }
    }

    /**
     * Get session index
     */
    async getSessionIndex() {
        try {
            const result = await this.storageArea.get(['session_index']);
            return result.session_index || [];
        } catch (error) {
            console.error('Failed to get session index:', error);
            return [];
        }
    }

    /**
     * Compress data if it's large
     */
    async maybeCompress(data) {
        const size = this.estimateSize(data);
        
        if (size > this.compressionThreshold) {
            try {
                const compressed = await this.compress(JSON.stringify(data));
                return {
                    _compressed: true,
                    data: compressed,
                    originalSize: size
                };
            } catch (error) {
                console.warn('Compression failed, storing uncompressed:', error);
                return data;
            }
        }
        
        return data;
    }

    /**
     * Decompress data if it was compressed
     */
    async maybeDecompress(data) {
        if (data && data._compressed) {
            try {
                const decompressed = await this.decompress(data.data);
                return JSON.parse(decompressed);
            } catch (error) {
                console.error('Decompression failed:', error);
                throw error;
            }
        }
        
        return data;
    }

    /**
     * Simple compression using gzip (if available)
     */
    async compress(text) {
        if ('CompressionStream' in window) {
            const stream = new CompressionStream('gzip');
            const writer = stream.writable.getWriter();
            const reader = stream.readable.getReader();
            
            writer.write(new TextEncoder().encode(text));
            writer.close();
            
            const chunks = [];
            let done = false;
            
            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                if (value) chunks.push(value);
            }
            
            const compressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
            let offset = 0;
            for (const chunk of chunks) {
                compressed.set(chunk, offset);
                offset += chunk.length;
            }
            
            return Array.from(compressed);
        }
        
        // Fallback: base64 encoding (not real compression)
        return btoa(text);
    }

    /**
     * Simple decompression
     */
    async decompress(compressedData) {
        if ('DecompressionStream' in window && Array.isArray(compressedData)) {
            const stream = new DecompressionStream('gzip');
            const writer = stream.writable.getWriter();
            const reader = stream.readable.getReader();
            
            writer.write(new Uint8Array(compressedData));
            writer.close();
            
            const chunks = [];
            let done = false;
            
            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                if (value) chunks.push(value);
            }
            
            const decompressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
            let offset = 0;
            for (const chunk of chunks) {
                decompressed.set(chunk, offset);
                offset += chunk.length;
            }
            
            return new TextDecoder().decode(decompressed);
        }
        
        // Fallback: base64 decoding
        return atob(compressedData);
    }

    /**
     * Estimate data size in bytes
     */
    estimateSize(obj) {
        return new Blob([JSON.stringify(obj)]).size;
    }

    /**
     * Generate unique ID
     */
    generateId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Set up storage event listeners
     */
    setupStorageListeners() {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                console.log('Storage changed:', changes);
                
                // Emit custom events for UI updates
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('storageChanged', { 
                        detail: changes 
                    }));
                }
            }
        });
    }

    /**
     * Check if storage is approaching limits
     */
    async checkStorageLimits() {
        const stats = await this.getStorageStats();
        
        if (stats && stats.usagePercentage > 80) {
            console.warn('Storage usage is high:', stats.usagePercentage + '%');
            
            // Auto-cleanup if over 90%
            if (stats.usagePercentage > 90) {
                console.log('Auto-cleaning old data...');
                await this.cleanupOldData(3); // Clean data older than 3 days
            }
            
            return {
                warning: true,
                usage: stats.usagePercentage,
                message: 'Storage space is running low'
            };
        }
        
        return { warning: false, usage: stats?.usagePercentage || 0 };
    }
}

// Export for use in other files
if (typeof window !== 'undefined') {
    window.StorageService = StorageService;
}

// Create singleton instance
const storageService = new StorageService();
if (typeof window !== 'undefined') {
    window.storageService = storageService;
    storageService.setupStorageListeners();
}