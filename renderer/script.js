/**
 * Renderer Process Script
 * 
 * This file contains the client-side JavaScript that runs in the renderer process.
 * It handles UI interactions and communicates with the main process when needed.
 */

console.log("Renderer process loaded");

const { callModel, listModels, configureModel, getModelConfig } = require('../services/modelService');

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    const promptInput = document.getElementById('promptInput');
    const testButton = document.getElementById('testButton');
    const output = document.getElementById('output');
    const modelsSelect = document.getElementById('modelsSelect');
    const temperatureInput = document.getElementById('temperatureInput');
    const maxTokensInput = document.getElementById('maxTokensInput');
    const outputsGrid = document.getElementById('outputsGrid');

    // Tabs
    const tabButtons = Array.from(document.querySelectorAll('.tab-button'));
    const tabContents = Array.from(document.querySelectorAll('.tab-content'));
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const id = btn.getAttribute('data-tab');
            const content = document.getElementById(id);
            if (content) content.classList.add('active');
        });
    });

    // Populate models dropdown from Ollama
    (async function loadModels() {
        try {
            output.textContent = 'Loading models from Ollama…';
            const models = await listModels();
            modelsSelect.innerHTML = '';
            models.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                modelsSelect.appendChild(option);
            });
            output.textContent = models.length ? 'Models loaded. Select one or more and run Test.' : 'No models found in Ollama.';
        } catch (err) {
            output.textContent = `Failed to load models: ${err.message || err}`;
        }
    })();
    
    // Handle test button click
    testButton.addEventListener('click', async function() {
        const prompt = promptInput.value.trim();
        if (!prompt) {
            output.textContent = 'Please enter a prompt.';
            return;
        }
        // Selected models
        const selectedModels = Array.from(modelsSelect.selectedOptions).map(o => o.value);
        if (!selectedModels.length) {
            output.textContent = 'Please select at least one model.';
            return;
        }

        // Parameters with validation
        const temperature = Number(temperatureInput.value);
        const maxTokens = Number(maxTokensInput.value);
        const tempClamped = isNaN(temperature) ? 0.7 : Math.max(0, Math.min(2, temperature));
        const maxTokensClamped = isNaN(maxTokens) ? 512 : Math.max(1, Math.min(8192, Math.floor(maxTokens)));

        // Basic loading state
        testButton.disabled = true;
        const originalLabel = testButton.textContent;
        testButton.textContent = 'Running…';
        output.textContent = 'Contacting Ollama…';
        outputsGrid.innerHTML = '';

        try {
            // Run sequentially to avoid config race conditions
            for (const modelName of selectedModels) {
                configureModel({ model: modelName, temperature: tempClamped, max_tokens: maxTokensClamped });
                const card = document.createElement('div');
                card.className = 'output-card';
                const header = document.createElement('h3');
                header.textContent = `${modelName}`;
                const pre = document.createElement('pre');
                pre.textContent = 'Running…';
                card.appendChild(header);
                card.appendChild(pre);
                outputsGrid.appendChild(card);

                try {
                    const result = await callModel(prompt);
                    pre.textContent = result;
                } catch (innerErr) {
                    pre.textContent = `Error: ${innerErr.message || innerErr}`;
                }
            }
            output.textContent = 'Done.';
        } catch (err) {
            output.textContent = `Error: ${err.message || 'Failed to call model'}`;
        } finally {
            testButton.disabled = false;
            testButton.textContent = originalLabel;
        }
    });
});

