/**
 * Provider Registry
 * Central registry for managing model providers (Ollama, OpenAI, etc.)
 */

const { OllamaAdapter } = require('../renderer/model-adapters');

class ProviderRegistry {
    constructor() {
        this.providers = new Map();
        this.modelCache = new Map(); // providerId -> models[]
        this.adapters = new Map(); // providerId -> adapter instance

        // Register built-in providers
        this.registerProvider({
            id: 'ollama',
            name: 'Ollama',
            requiresApiKey: false
        });

        this.registerProvider({
            id: 'openai',
            name: 'OpenAI',
            requiresApiKey: true
        });

        this.registerProvider({
            id: 'claude',
            name: 'Claude (Anthropic)',
            requiresApiKey: true
        });
    }

    /**
     * Register a provider
     */
    registerProvider(config) {
        this.providers.set(config.id, config);
    }

    /**
     * Get all registered providers
     */
    getProviders() {
        return Array.from(this.providers.values());
    }

    /**
     * Get provider config
     */
    getProvider(providerId) {
        return this.providers.get(providerId);
    }

    /**
     * Check if a provider is configured (has API key if required) - async
     */
    async isProviderConfigured(providerId) {
        const provider = this.providers.get(providerId);
        if (!provider) return false;

        if (!provider.requiresApiKey) return true;

        // Check if API key exists in storage
        const apiKey = await this.getApiKey(providerId);
        return !!apiKey;
    }

    /**
     * Set API key for a provider (async - uses secure storage)
     */
    async setApiKey(providerId, apiKey) {
        try {
            // Use secure storage if available, fallback to localStorage
            if (typeof window !== 'undefined' && window.secureStorage) {
                if (apiKey) {
                    await window.secureStorage.setApiKey(providerId, apiKey);
                } else {
                    await window.secureStorage.removeApiKey(providerId);
                }
            } else if (typeof localStorage !== 'undefined') {
                // Fallback to localStorage (less secure)
                const storageKey = `provider_${providerId}_apikey`;
                if (apiKey) {
                    localStorage.setItem(storageKey, apiKey);
                } else {
                    localStorage.removeItem(storageKey);
                }
            }

            // Clear model cache when API key changes
            this.modelCache.delete(providerId);
        } catch (error) {
            console.error('Failed to set API key:', error);
            throw error;
        }
    }

    /**
     * Get API key for a provider (async - uses secure storage)
     */
    async getApiKey(providerId) {
        try {
            // Use secure storage if available, fallback to localStorage
            if (typeof window !== 'undefined' && window.secureStorage) {
                return await window.secureStorage.getApiKey(providerId);
            } else if (typeof localStorage !== 'undefined') {
                // Fallback to localStorage (less secure)
                const storageKey = `provider_${providerId}_apikey`;
                return localStorage.getItem(storageKey);
            }
            return null;
        } catch (error) {
            console.error('Failed to get API key:', error);
            return null;
        }
    }

    /**
     * Remove API key for a provider (async - uses secure storage)
     */
    async removeApiKey(providerId) {
        await this.setApiKey(providerId, null);
        this.modelCache.delete(providerId);
    }

    /**
     * List models for a provider
     */
    async listModels(providerId) {
        // Check cache first
        if (this.modelCache.has(providerId)) {
            return this.modelCache.get(providerId);
        }

        let models = [];

        if (providerId === 'ollama') {
            try {
                const response = await fetch('http://localhost:11434/api/tags', {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!response.ok) {
                    throw new Error(`Ollama list models failed: ${response.status}`);
                }

                const data = await response.json();
                models = Array.isArray(data?.models)
                    ? data.models.map(m => ({ id: m.name, name: m.name }))
                    : [];
            } catch (error) {
                console.error('provider_list_models_error: ollama', error);
                throw error;
            }
        } else if (providerId === 'openai') {
            const apiKey = await this.getApiKey('openai');
            if (!apiKey) {
                throw new Error('OpenAI API key not configured');
            }

            try {
                const response = await fetch('https://api.openai.com/v1/models', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`OpenAI list models failed: ${response.status}`);
                }

                const data = await response.json();

                // Filter to only chat models and sort by most useful first
                const chatModels = data.data
                    .filter(m => m.id.includes('gpt'))
                    .sort((a, b) => {
                        // Prioritize newer models
                        const priority = ['gpt-4', 'gpt-3.5-turbo', 'gpt-4o'];
                        const aIdx = priority.findIndex(p => a.id.includes(p));
                        const bIdx = priority.findIndex(p => b.id.includes(p));
                        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
                        if (aIdx !== -1) return -1;
                        if (bIdx !== -1) return 1;
                        return a.id.localeCompare(b.id);
                    });

                models = chatModels.map(m => ({ id: m.id, name: m.id }));
            } catch (error) {
                console.error('provider_list_models_error: openai', error);
                throw error;
            }
        } else if (providerId === 'claude') {
            // Claude/Anthropic doesn't have a models endpoint
            // Return a curated list of available Claude models
            models = [
                { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
                { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
                { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
                { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
                { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }
            ];
        }

        // Cache the results
        this.modelCache.set(providerId, models);

        return models;
    }

    /**
     * Get adapter instance for a provider (async - retrieves API key securely)
     */
    async getAdapter(providerId) {
        // Return cached adapter if available
        if (this.adapters.has(providerId)) {
            return this.adapters.get(providerId);
        }

        let adapter = null;

        if (providerId === 'ollama') {
            adapter = new OllamaAdapter();
        } else if (providerId === 'openai') {
            const { OpenAIAdapter } = require('../renderer/model-adapters');
            const apiKey = await this.getApiKey('openai');
            adapter = new OpenAIAdapter({
                apiKey: apiKey
            });
        } else if (providerId === 'claude') {
            const { ClaudeAdapter } = require('../renderer/model-adapters');
            const apiKey = await this.getApiKey('claude');
            adapter = new ClaudeAdapter({
                apiKey: apiKey
            });
        }

        if (adapter) {
            this.adapters.set(providerId, adapter);
        }

        return adapter;
    }

    /**
     * Clear all caches (useful for testing or refresh)
     */
    clearCaches() {
        this.modelCache.clear();
        this.adapters.clear();
    }
}

// Singleton instance
const providerRegistry = new ProviderRegistry();

module.exports = {
    ProviderRegistry,
    providerRegistry
};
