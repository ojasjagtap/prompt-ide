/**
 * Preload Script
 * Provides a secure bridge between renderer and main process for API key storage
 * This script runs in a privileged context and exposes only the necessary APIs
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose secure API to renderer process
contextBridge.exposeInMainWorld('secureStorage', {
    /**
     * Store an API key securely
     * @param {string} providerId - Provider identifier (e.g., 'openai')
     * @param {string} apiKey - The API key to store
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    setApiKey: (providerId, apiKey) => {
        return ipcRenderer.invoke('secure-storage:set', providerId, apiKey);
    },

    /**
     * Retrieve an API key
     * @param {string} providerId - Provider identifier (e.g., 'openai')
     * @returns {Promise<string|null>}
     */
    getApiKey: (providerId) => {
        return ipcRenderer.invoke('secure-storage:get', providerId);
    },

    /**
     * Remove an API key
     * @param {string} providerId - Provider identifier (e.g., 'openai')
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    removeApiKey: (providerId) => {
        return ipcRenderer.invoke('secure-storage:remove', providerId);
    },

    /**
     * Check if an API key exists
     * @param {string} providerId - Provider identifier (e.g., 'openai')
     * @returns {Promise<boolean>}
     */
    hasApiKey: (providerId) => {
        return ipcRenderer.invoke('secure-storage:has', providerId);
    }
});
