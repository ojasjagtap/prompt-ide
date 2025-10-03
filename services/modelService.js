/**
 * Model Service
 * 
 * Handles AI model interactions and API calls.
 * This service abstracts model communication logic for easy maintenance.
 */

let currentConfig = {
    model: 'gemma3:1b',  // default model
    temperature: 0.7,    // default temperature
    max_tokens: 512      // default max tokens
};

/**
 * Calls local Ollama to generate a response
 * @param {string} prompt - The input prompt
 * @returns {Promise<string>} - The model response text
 */
async function callModel(prompt) {
    if (!prompt || typeof prompt !== 'string') {
        throw new Error('Prompt must be a non-empty string');
    }

    const url = 'http://localhost:11434/api/generate';
    const body = {
        model: currentConfig.model,
        prompt,
        stream: false,
        options: {
            temperature: currentConfig.temperature,
            num_predict: currentConfig.max_tokens
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Ollama request failed: ${response.status} ${response.statusText} ${text}`.trim());
        }

        const data = await response.json();
        // Ollama /api/generate returns { response: string, ... }
        const resultText = typeof data?.response === 'string' ? data.response : '';
        return resultText || 'No response from model.';
    } catch (error) {
        console.error('Ollama call failed:', error);
        throw error;
    }
}

/**
 * Updates model configuration for the current session
 * @param {Object} config - Model configuration options
 *   @param {string} [config.model] - Model name (e.g. "gemma3:1b")
 *   @param {number} [config.temperature] - Sampling temperature (0.0–1.0)
 *   @param {number} [config.max_tokens] - Max tokens to generate
 */
function configureModel(config = {}) {
    if (config.model && typeof config.model === 'string') {
        currentConfig.model = config.model;
    }
    if (typeof config.temperature === 'number') {
        currentConfig.temperature = config.temperature;
    }
    if (typeof config.max_tokens === 'number') {
        currentConfig.max_tokens = config.max_tokens;
    }
    console.log('Model configured with:', currentConfig);
}

/**
 * Returns the current configuration (useful for debugging / UI sync)
 */
function getModelConfig() {
    return { ...currentConfig };
}

/**
 * Lists locally available models from Ollama
 * @returns {Promise<string[]>} - Array of model names
 */
async function listModels() {
    const url = 'http://localhost:11434/api/tags';
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Ollama list models failed: ${response.status} ${response.statusText} ${text}`.trim());
        }

        const data = await response.json();
        // Ollama returns { models: [{ name: 'model:tag', ...}, ...] }
        const models = Array.isArray(data?.models)
            ? data.models.map(m => m.name).filter(Boolean)
            : [];
        return models;
    } catch (error) {
        console.error('Ollama listModels failed:', error);
        throw error;
    }
}

module.exports = {
    callModel,
    configureModel,
    getModelConfig,
    listModels
};