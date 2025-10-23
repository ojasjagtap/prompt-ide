/**
 * Secure Storage Module
 * Handles encryption and secure storage of API keys using Electron's safeStorage API
 */

const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

class SecureStorage {
    constructor() {
        // Storage file path in user data directory
        this.storageDir = app.getPath('userData');
        this.storageFile = path.join(this.storageDir, 'credentials.dat');

        // In-memory cache for decrypted keys
        this.cache = new Map();

        // Ensure storage directory exists
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
    }

    /**
     * Load all encrypted keys from file
     */
    _loadFromFile() {
        try {
            if (!fs.existsSync(this.storageFile)) {
                return {};
            }

            const data = fs.readFileSync(this.storageFile, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Failed to load credentials file:', error);
            return {};
        }
    }

    /**
     * Save all encrypted keys to file
     */
    _saveToFile(data) {
        try {
            fs.writeFileSync(this.storageFile, JSON.stringify(data, null, 2), 'utf-8');
        } catch (error) {
            console.error('Failed to save credentials file:', error);
            throw error;
        }
    }

    /**
     * Store an API key securely
     * @param {string} providerId - Provider identifier (e.g., 'openai')
     * @param {string} apiKey - The API key to store
     */
    async setApiKey(providerId, apiKey) {
        try {
            // Check if encryption is available
            if (!safeStorage.isEncryptionAvailable()) {
                throw new Error('Encryption is not available on this system');
            }

            // Encrypt the API key
            const encrypted = safeStorage.encryptString(apiKey);

            // Convert buffer to base64 for JSON storage
            const encryptedBase64 = encrypted.toString('base64');

            // Load existing data
            const data = this._loadFromFile();

            // Store the encrypted key
            const key = `provider_${providerId}_apikey`;
            data[key] = encryptedBase64;

            // Save to file
            this._saveToFile(data);

            // Update cache
            this.cache.set(key, apiKey);

            return { success: true };
        } catch (error) {
            console.error('Failed to store API key:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Retrieve an API key
     * @param {string} providerId - Provider identifier (e.g., 'openai')
     * @returns {string|null} The decrypted API key or null if not found
     */
    async getApiKey(providerId) {
        try {
            const key = `provider_${providerId}_apikey`;

            // Check cache first
            if (this.cache.has(key)) {
                return this.cache.get(key);
            }

            // Load from file
            const data = this._loadFromFile();
            const encryptedBase64 = data[key];

            if (!encryptedBase64) {
                return null;
            }

            // Convert from base64 to buffer
            const encrypted = Buffer.from(encryptedBase64, 'base64');

            // Decrypt
            const decrypted = safeStorage.decryptString(encrypted);

            // Update cache
            this.cache.set(key, decrypted);

            return decrypted;
        } catch (error) {
            console.error('Failed to retrieve API key:', error);
            return null;
        }
    }

    /**
     * Remove an API key
     * @param {string} providerId - Provider identifier (e.g., 'openai')
     */
    async removeApiKey(providerId) {
        try {
            const key = `provider_${providerId}_apikey`;

            // Load existing data
            const data = this._loadFromFile();

            // Remove the key
            delete data[key];

            // Save to file
            this._saveToFile(data);

            // Remove from cache
            this.cache.delete(key);

            return { success: true };
        } catch (error) {
            console.error('Failed to remove API key:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if an API key exists
     * @param {string} providerId - Provider identifier (e.g., 'openai')
     * @returns {boolean} True if the key exists
     */
    async hasApiKey(providerId) {
        const key = `provider_${providerId}_apikey`;

        // Check cache first
        if (this.cache.has(key)) {
            return true;
        }

        // Check file
        const data = this._loadFromFile();
        return !!data[key];
    }

    /**
     * Clear the in-memory cache
     */
    clearCache() {
        this.cache.clear();
    }
}

// Singleton instance
const secureStorage = new SecureStorage();

module.exports = { SecureStorage, secureStorage };
