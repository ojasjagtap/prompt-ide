/**
 * DSPy Optimize Node Helper
 * Handles DSPy optimization node creation, rendering, validation, and execution
 * Uses actual DSPy library via Python bridge for prompt optimization
 */

const { executeDSPyOptimization, checkDSPyEnvironment, validateDSPyConfig } = require('./dspy-worker');
const path = require('path');

// ============================================================================
// DATA STRUCTURE
// ============================================================================

/**
 * Initialize DSPy optimize node data structure
 */
function createDSPyOptimizeNodeData() {
    return {
        title: 'DSPy',

        // Optimizer Configuration
        optimizer: 'BootstrapFewShot',  // 'BootstrapFewShot' | 'MIPROv2'
        optimizationMode: 'light',       // For MIPRO: 'light' | 'medium' | 'heavy'
        programType: 'predict',          // 'predict' | 'chain_of_thought' | 'react'

        // Metric Configuration
        metricType: 'exact_match',       // 'exact_match' | 'contains' | 'semantic_f1'
        metricCaseSensitive: false,
        metricThreshold: null,

        // Optimizer Parameters
        maxBootstrappedDemos: 4,
        maxLabeledDemos: 16,
        maxRounds: 1,                    // For BootstrapFewShot
        numTrials: 30,                   // For MIPRO
        minibatch: true,                 // For MIPRO
        minibatchSize: 35,               // For MIPRO

        // Dataset Management
        trainDataset: [],                // Array of {input, output}
        valDataset: [],                  // Validation set (optional)
        datasetMode: 'manual',           // 'manual' | 'csv' (future)

        // Results
        optimizationStatus: 'idle',      // 'idle' | 'running' | 'success' | 'error'
        validationScore: 0,
        optimizedSignature: null,        // Object with instructions per predictor
        optimizedDemos: [],              // Array of demo objects
        predictors: [],                  // Predictor metadata
        compiledProgramPath: null,
        optimizationLog: [],             // Progress messages

        // Dataset sizes for display
        datasetSizes: {
            train: 0,
            val: 0
        }
    };
}

// ============================================================================
// NODE RENDERING
// ============================================================================

/**
 * Render DSPy optimize node HTML
 */
function renderDSPyOptimizeNode(node, edges, nodes) {
    const collapseIconId = node.collapsed ? 'icon-chevron-right' : 'icon-chevron-down';

    // Calculate dataset info
    const trainSize = node.data.trainDataset?.length || 0;
    const valSize = node.data.valDataset?.length || 0;
    const datasetInfo = trainSize > 0 ? `${trainSize} train${valSize > 0 ? `, ${valSize} val` : ''}` : 'No dataset';

    return `
        <div class="node-header">
            <div class="header-top">
                <div class="header-left">
                    <svg class="collapse-toggle" data-node-id="${node.id}" width="12" height="12">
                        <use href="#${collapseIconId}"></use>
                    </svg>
                    <span class="node-title">${node.data.title}</span>
                </div>
                <span class="node-status-badge">${node.status}</span>
            </div>
            <div class="header-bottom">
                <div class="pin-container pin-input-container">
                    <div class="pin pin-input" data-pin="prompt"></div>
                    <span class="pin-label">prompt</span>
                </div>
                <div class="pin-spacer"></div>
            </div>
        </div>
        <div class="node-body" style="display: ${node.collapsed ? 'none' : 'block'}">
            <div class="node-description">
                <div>${node.data.optimizer} optimization</div>
                <div style="font-size: 10px; color: #888; margin-top: 4px;">${datasetInfo}</div>
            </div>
            ${node.data.validationScore > 0 ? `
                <div class="optimization-stats" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #333; font-size: 11px;">
                    <div style="color: #4a9eff;">Score: ${(node.data.validationScore * 100).toFixed(1)}%</div>
                    ${node.data.optimizedDemos.length > 0 ? `<div style="color: #888;">${node.data.optimizedDemos.length} demos</div>` : ''}
                </div>
            ` : ''}
        </div>
    `;
}

// ============================================================================
// INSPECTOR UI
// ============================================================================

/**
 * Render DSPy optimize node inspector UI
 */
function renderDSPyOptimizeInspector(node, updateNodeDisplay, edges, nodes, state) {
    const buttonDisabled = state.isRunning || state.isOptimizing || state.isRunningModelNode;
    const hasResults = node.data.validationScore > 0 && node.data.optimizedSignature;
    const applyButtonDisabled = buttonDisabled || !hasResults;

    const html = `
        <div class="inspector-section">
            <label>Title</label>
            <input type="text" id="inspectorTitle" class="inspector-input" value="${node.data.title}">
        </div>

        <!-- Optimizer Selection -->
        <div class="inspector-section">
            <label>Optimizer</label>
            <select id="inspectorOptimizer" class="inspector-input">
                <option value="BootstrapFewShot" ${node.data.optimizer === 'BootstrapFewShot' ? 'selected' : ''}>BootstrapFewShot</option>
                <option value="MIPROv2" ${node.data.optimizer === 'MIPROv2' ? 'selected' : ''}>MIPROv2</option>
            </select>
        </div>

        <!-- Program Type -->
        <div class="inspector-section">
            <label>Program Type</label>
            <select id="inspectorProgramType" class="inspector-input">
                <option value="predict" ${node.data.programType === 'predict' ? 'selected' : ''}>Predict</option>
                <option value="chain_of_thought" ${node.data.programType === 'chain_of_thought' ? 'selected' : ''}>Chain of Thought</option>
                <option value="react" ${node.data.programType === 'react' ? 'selected' : ''}>ReAct</option>
            </select>
        </div>

        <!-- MIPRO Mode (shown only for MIPROv2) -->
        <div class="inspector-section" id="miproModeSection" style="display: ${node.data.optimizer === 'MIPROv2' ? 'block' : 'none'};">
            <label>MIPRO Mode</label>
            <select id="inspectorOptimizationMode" class="inspector-input">
                <option value="light" ${node.data.optimizationMode === 'light' ? 'selected' : ''}>Light (fast)</option>
                <option value="medium" ${node.data.optimizationMode === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="heavy" ${node.data.optimizationMode === 'heavy' ? 'selected' : ''}>Heavy (thorough)</option>
            </select>
        </div>

        <!-- Metric Configuration -->
        <div class="inspector-section">
            <label>Metric Type</label>
            <select id="inspectorMetricType" class="inspector-input">
                <option value="exact_match" ${node.data.metricType === 'exact_match' ? 'selected' : ''}>Exact Match</option>
                <option value="contains" ${node.data.metricType === 'contains' ? 'selected' : ''}>Contains</option>
                <option value="semantic_f1" ${node.data.metricType === 'semantic_f1' ? 'selected' : ''}>Semantic F1</option>
            </select>
        </div>

        <!-- Case Sensitive (for exact_match and contains) -->
        <div class="inspector-section" id="caseSensitiveSection" style="display: ${['exact_match', 'contains'].includes(node.data.metricType) ? 'block' : 'none'};">
            <label>
                <input type="checkbox" id="inspectorMetricCaseSensitive" ${node.data.metricCaseSensitive ? 'checked' : ''}>
                Case Sensitive
            </label>
        </div>

        <!-- Optimizer Parameters -->
        <div class="inspector-section">
            <details>
                <summary style="cursor: pointer; font-weight: bold; margin-bottom: 8px;">Advanced Parameters</summary>

                <div style="margin-top: 8px;">
                    <label>Max Bootstrapped Demos</label>
                    <input type="number" id="inspectorMaxBootstrappedDemos" class="inspector-input"
                           value="${node.data.maxBootstrappedDemos}" min="1" max="20">
                </div>

                <div style="margin-top: 8px;">
                    <label>Max Labeled Demos</label>
                    <input type="number" id="inspectorMaxLabeledDemos" class="inspector-input"
                           value="${node.data.maxLabeledDemos}" min="1" max="50">
                </div>

                <div style="margin-top: 8px;" id="numTrialsSection" style="display: ${node.data.optimizer === 'MIPROv2' ? 'block' : 'none'};">
                    <label>Num Trials (MIPRO)</label>
                    <input type="number" id="inspectorNumTrials" class="inspector-input"
                           value="${node.data.numTrials}" min="5" max="200">
                </div>

                <div style="margin-top: 8px;">
                    <label>Metric Threshold (optional)</label>
                    <input type="number" id="inspectorMetricThreshold" class="inspector-input"
                           value="${node.data.metricThreshold || ''}" min="0" max="1" step="0.01" placeholder="0.8">
                </div>
            </details>
        </div>

        <!-- Training Dataset -->
        <div class="inspector-section">
            <label>Training Dataset (JSON)</label>
            <textarea id="inspectorTrainDataset" class="inspector-textarea code-editor" rows="10"
                      placeholder='[&#10;  {"input": "What is 2+2?", "output": "4"},&#10;  {"input": "What is 3+3?", "output": "6"}&#10;]'>${JSON.stringify(node.data.trainDataset, null, 2)}</textarea>
            <div style="font-size: 10px; color: #888; margin-top: 4px;">
                ${node.data.trainDataset.length} examples
            </div>
        </div>

        <!-- Validation Dataset -->
        <div class="inspector-section">
            <details>
                <summary style="cursor: pointer; font-weight: bold; margin-bottom: 8px;">Validation Dataset (optional)</summary>
                <textarea id="inspectorValDataset" class="inspector-textarea code-editor" rows="6"
                          placeholder='[{"input": "...", "output": "..."}]'>${JSON.stringify(node.data.valDataset, null, 2)}</textarea>
                <div style="font-size: 10px; color: #888; margin-top: 4px;">
                    ${node.data.valDataset.length > 0 ? `${node.data.valDataset.length} examples` : 'Auto-split from training if empty'}
                </div>
            </details>
        </div>

        <!-- Results Display -->
        ${node.data.validationScore > 0 ? `
            <div class="inspector-section">
                <label>Optimization Results</label>
                <div style="background: #1a1a1a; padding: 12px; border-radius: 4px; font-size: 12px;">
                    <div style="margin-bottom: 8px;">
                        <strong style="color: #4a9eff;">Validation Score:</strong>
                        <span style="color: #4a9eff;">${(node.data.validationScore * 100).toFixed(1)}%</span>
                    </div>
                    ${node.data.optimizedSignature && Object.keys(node.data.optimizedSignature).length > 0 ? `
                        <div style="margin-bottom: 8px;">
                            <strong>Optimized Instructions:</strong>
                            ${Object.entries(node.data.optimizedSignature).map(([name, instruction]) =>
                                `<div style="margin-top: 4px; color: #888;">${name}: ${instruction}</div>`
                            ).join('')}
                        </div>
                    ` : ''}
                    <div>
                        <strong>Demos Generated:</strong> ${node.data.optimizedDemos.length}
                    </div>
                </div>
            </div>

            <!-- Show sample demos -->
            ${node.data.optimizedDemos.length > 0 ? `
                <div class="inspector-section">
                    <details>
                        <summary style="cursor: pointer; font-weight: bold;">Sample Demonstrations (${node.data.optimizedDemos.length})</summary>
                        <div style="margin-top: 8px; max-height: 200px; overflow-y: auto;">
                            ${node.data.optimizedDemos.slice(0, 5).map((demo, i) => `
                                <div style="background: #1a1a1a; padding: 8px; border-radius: 4px; margin-bottom: 8px; font-size: 11px;">
                                    <div style="color: #888;">Demo ${i + 1}:</div>
                                    <div style="margin-top: 4px;"><strong>Input:</strong> ${demo.input}</div>
                                    <div style="margin-top: 4px;"><strong>Output:</strong> ${demo.output}</div>
                                </div>
                            `).join('')}
                            ${node.data.optimizedDemos.length > 5 ? `<div style="color: #888; font-size: 10px;">... and ${node.data.optimizedDemos.length - 5} more</div>` : ''}
                        </div>
                    </details>
                </div>
            ` : ''}
        ` : ''}

        <!-- Optimization Log -->
        ${node.data.optimizationLog.length > 0 ? `
            <div class="inspector-section">
                <details>
                    <summary style="cursor: pointer; font-weight: bold;">Optimization Log (${node.data.optimizationLog.length})</summary>
                    <div style="margin-top: 8px; max-height: 150px; overflow-y: auto; background: #1a1a1a; padding: 8px; border-radius: 4px; font-size: 10px; font-family: monospace;">
                        ${node.data.optimizationLog.slice(-20).map(msg =>
                            `<div style="margin-bottom: 4px; color: #888;">${msg}</div>`
                        ).join('')}
                    </div>
                </details>
            </div>
        ` : ''}

        <!-- Action Buttons -->
        <div class="inspector-section">
            <button id="inspectorRunOptimize" class="inspector-button"
                    style="width: 100%; padding: 10px; background: ${buttonDisabled ? '#6c757d' : '#4a9eff'}; color: white; border: none; border-radius: 4px; cursor: ${buttonDisabled ? 'not-allowed' : 'pointer'}; font-size: 14px; opacity: ${buttonDisabled ? '0.6' : '1'};"
                    ${buttonDisabled ? 'disabled' : ''}>
                Run Optimization
            </button>
        </div>

        ${hasResults ? `
            <div class="inspector-section">
                <button id="inspectorApplyToPrompt" class="inspector-button"
                        style="width: 100%; padding: 10px; background: ${applyButtonDisabled ? '#6c757d' : '#28a745'}; color: white; border: none; border-radius: 4px; cursor: ${applyButtonDisabled ? 'not-allowed' : 'pointer'}; font-size: 14px; opacity: ${applyButtonDisabled ? '0.6' : '1'};"
                        ${applyButtonDisabled ? 'disabled' : ''}>
                    Apply to Prompt Node
                </button>
            </div>
        ` : ''}
    `;

    return {
        html,
        setupListeners: (context) => {
            // Title
            document.getElementById('inspectorTitle').addEventListener('input', (e) => {
                node.data.title = e.target.value;
                updateNodeDisplay(node.id);
            });

            // Optimizer
            const optimizerSelect = document.getElementById('inspectorOptimizer');
            optimizerSelect.addEventListener('change', (e) => {
                node.data.optimizer = e.target.value;
                // Show/hide MIPRO-specific options
                const miproMode = document.getElementById('miproModeSection');
                const numTrials = document.getElementById('numTrialsSection');
                if (e.target.value === 'MIPROv2') {
                    if (miproMode) miproMode.style.display = 'block';
                    if (numTrials) numTrials.style.display = 'block';
                } else {
                    if (miproMode) miproMode.style.display = 'none';
                    if (numTrials) numTrials.style.display = 'none';
                }
                updateNodeDisplay(node.id);
            });

            // Program Type
            document.getElementById('inspectorProgramType').addEventListener('change', (e) => {
                node.data.programType = e.target.value;
            });

            // MIPRO Mode
            const modeSelect = document.getElementById('inspectorOptimizationMode');
            if (modeSelect) {
                modeSelect.addEventListener('change', (e) => {
                    node.data.optimizationMode = e.target.value;
                });
            }

            // Metric Type
            const metricSelect = document.getElementById('inspectorMetricType');
            metricSelect.addEventListener('change', (e) => {
                node.data.metricType = e.target.value;
                // Show/hide metric-specific options
                const caseSensitive = document.getElementById('caseSensitiveSection');

                if (['exact_match', 'contains'].includes(e.target.value)) {
                    if (caseSensitive) caseSensitive.style.display = 'block';
                } else {
                    if (caseSensitive) caseSensitive.style.display = 'none';
                }
            });

            // Case Sensitive
            const caseSensitiveCheck = document.getElementById('inspectorMetricCaseSensitive');
            if (caseSensitiveCheck) {
                caseSensitiveCheck.addEventListener('change', (e) => {
                    node.data.metricCaseSensitive = e.target.checked;
                });
            }

            // Advanced Parameters
            document.getElementById('inspectorMaxBootstrappedDemos').addEventListener('input', (e) => {
                node.data.maxBootstrappedDemos = parseInt(e.target.value, 10) || 4;
            });

            document.getElementById('inspectorMaxLabeledDemos').addEventListener('input', (e) => {
                node.data.maxLabeledDemos = parseInt(e.target.value, 10) || 16;
            });

            const numTrialsInput = document.getElementById('inspectorNumTrials');
            if (numTrialsInput) {
                numTrialsInput.addEventListener('input', (e) => {
                    node.data.numTrials = parseInt(e.target.value, 10) || 30;
                });
            }

            const thresholdInput = document.getElementById('inspectorMetricThreshold');
            if (thresholdInput) {
                thresholdInput.addEventListener('input', (e) => {
                    const val = parseFloat(e.target.value);
                    node.data.metricThreshold = isNaN(val) ? null : val;
                });
            }

            // Training Dataset
            document.getElementById('inspectorTrainDataset').addEventListener('input', (e) => {
                try {
                    const parsed = JSON.parse(e.target.value);
                    if (Array.isArray(parsed)) {
                        node.data.trainDataset = parsed;
                        updateNodeDisplay(node.id);
                    }
                } catch (err) {
                    // Invalid JSON, keep old value
                }
            });

            // Validation Dataset
            const valDatasetInput = document.getElementById('inspectorValDataset');
            if (valDatasetInput) {
                valDatasetInput.addEventListener('input', (e) => {
                    try {
                        const parsed = JSON.parse(e.target.value);
                        if (Array.isArray(parsed)) {
                            node.data.valDataset = parsed;
                            updateNodeDisplay(node.id);
                        }
                    } catch (err) {
                        // Invalid JSON, keep old value
                    }
                });
            }

            // Run Optimization Button
            const runButton = document.getElementById('inspectorRunOptimize');
            if (runButton && context && context.runOptimizeNode) {
                runButton.addEventListener('click', async () => {
                    // Validate before running
                    const errors = validateDSPyOptimizeNode(node, context.edges, context.nodes);
                    if (errors.length > 0) {
                        errors.forEach(error => {
                            context.addLog('error', error, node.id);
                        });
                        return;
                    }

                    await context.runOptimizeNode(node.id);
                });
            }

            // Apply to Prompt Button
            const applyButton = document.getElementById('inspectorApplyToPrompt');
            if (applyButton && context) {
                applyButton.addEventListener('click', () => {
                    applyOptimizedPrompt(node, context.edges, context.nodes, context.addLog, context.updateNodeDisplay);
                });
            }
        }
    };
}

// ============================================================================
// CONNECTION VALIDATION
// ============================================================================

/**
 * Validate DSPy optimize node connections
 */
function isValidDSPyOptimizeConnection(sourceNode, sourcePin, targetNode, targetPin, edges) {
    // Allow Prompt.prompt → DSPyOptimize.prompt
    if (sourceNode.type === 'prompt' && sourcePin === 'prompt' &&
        targetNode.type === 'dspy-optimize' && targetPin === 'prompt') {

        // Only allow one prompt connection
        if (edges) {
            for (const edge of edges.values()) {
                if (edge.targetNodeId === targetNode.id && edge.targetPin === 'prompt') {
                    return false;
                }
            }
        }

        return true;
    }

    return false;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Find connected prompt node
 */
function findConnectedPromptNode(dspyOptimizeNodeId, edges, nodes) {
    for (const edge of edges.values()) {
        if (edge.targetNodeId === dspyOptimizeNodeId && edge.targetPin === 'prompt') {
            const sourceNode = nodes.get(edge.sourceNodeId);
            if (sourceNode && sourceNode.type === 'prompt') {
                return sourceNode;
            }
        }
    }
    return null;
}

/**
 * Find model node (for provider/model info)
 */
function findModelNode(nodes) {
    for (const node of nodes.values()) {
        if (node.type === 'model' && node.data.model) {
            return node;
        }
    }
    return null;
}

/**
 * Validate DSPy optimize node and return error messages
 */
function validateDSPyOptimizeNode(dspyOptimizeNode, edges, nodes) {
    const errors = [];

    // Check training dataset
    if (!dspyOptimizeNode.data.trainDataset || dspyOptimizeNode.data.trainDataset.length === 0) {
        errors.push('Training dataset is required (at least 1 example)');
    } else {
        // Validate dataset format
        for (let i = 0; i < Math.min(dspyOptimizeNode.data.trainDataset.length, 5); i++) {
            const example = dspyOptimizeNode.data.trainDataset[i];
            if (!example.input) {
                errors.push(`Training dataset example ${i + 1} missing 'input' field`);
            }
            if (!example.output) {
                errors.push(`Training dataset example ${i + 1} missing 'output' field`);
            }
        }
    }

    // Check model node exists
    const modelNode = findModelNode(nodes);
    if (!modelNode) {
        errors.push('No model node found in workflow');
    }

    return errors;
}

/**
 * Check if DSPy optimize node is ready to run
 */
function isDSPyOptimizeNodeReady(dspyOptimizeNode, edges, nodes) {
    const errors = validateDSPyOptimizeNode(dspyOptimizeNode, edges, nodes);
    return errors.length === 0;
}

/**
 * Apply optimized prompt to connected prompt node
 */
function applyOptimizedPrompt(dspyOptimizeNode, edges, nodes, addLog, updateNodeDisplay) {
    // Check if we have results
    if (!dspyOptimizeNode.data.optimizedSignature || dspyOptimizeNode.data.validationScore === 0) {
        addLog('error', 'No optimization results to apply. Run optimization first.', dspyOptimizeNode.id);
        return;
    }

    // Find connected prompt node
    const promptNode = findConnectedPromptNode(dspyOptimizeNode.id, edges, nodes);
    if (!promptNode) {
        addLog('error', 'No prompt node connected', dspyOptimizeNode.id);
        return;
    }

    // Apply optimized instruction to system prompt
    const instructions = dspyOptimizeNode.data.optimizedSignature;
    let instructionText = '';

    if (instructions && typeof instructions === 'object') {
        // Combine all instructions
        instructionText = Object.values(instructions).join('\n\n');
    }

    if (instructionText) {
        promptNode.data.systemPrompt = instructionText;
        updateNodeDisplay(promptNode.id);
        addLog('info', `Applied optimized instruction to prompt node (score: ${(dspyOptimizeNode.data.validationScore * 100).toFixed(1)}%)`, dspyOptimizeNode.id);
    } else {
        addLog('warning', 'No instruction text found in optimization results', dspyOptimizeNode.id);
    }
}

// ============================================================================
// EXECUTION
// ============================================================================

/**
 * Execute DSPy optimization node
 */
async function executeDSPyOptimizeNode(
    dspyOptimizeNode,
    edges,
    nodes,
    updateNodeDisplay,
    setNodeStatus,
    addLog,
    signal
) {
    // Validate prerequisites
    const errors = validateDSPyOptimizeNode(dspyOptimizeNode, edges, nodes);
    if (errors.length > 0) {
        errors.forEach(error => addLog('error', error, dspyOptimizeNode.id));
        setNodeStatus(dspyOptimizeNode.id, 'error');
        return;
    }

    // Find model node
    const modelNode = findModelNode(nodes);
    if (!modelNode) {
        addLog('error', 'No model node found', dspyOptimizeNode.id);
        setNodeStatus(dspyOptimizeNode.id, 'error');
        return;
    }

    // Set running status
    setNodeStatus(dspyOptimizeNode.id, 'running');
    dspyOptimizeNode.data.optimizationStatus = 'running';
    dspyOptimizeNode.data.optimizationLog = [];
    updateNodeDisplay(dspyOptimizeNode.id);

    addLog('info', 'Starting DSPy optimization...', dspyOptimizeNode.id);

    try {
        // Build configuration for Python worker
        const config = {
            model_config: {
                provider: modelNode.data.provider || 'ollama',
                model: modelNode.data.model,
                api_key: modelNode.data.apiKey || ''
            },
            optimizer: dspyOptimizeNode.data.optimizer,
            optimizer_config: {
                max_bootstrapped_demos: dspyOptimizeNode.data.maxBootstrappedDemos,
                max_labeled_demos: dspyOptimizeNode.data.maxLabeledDemos,
                max_rounds: dspyOptimizeNode.data.maxRounds,
                num_trials: dspyOptimizeNode.data.numTrials,
                minibatch: dspyOptimizeNode.data.minibatch,
                minibatch_size: dspyOptimizeNode.data.minibatchSize,
                mode: dspyOptimizeNode.data.optimizationMode,
                metric_threshold: dspyOptimizeNode.data.metricThreshold
            },
            metric_config: {
                type: dspyOptimizeNode.data.metricType,
                case_sensitive: dspyOptimizeNode.data.metricCaseSensitive
            },
            program_type: dspyOptimizeNode.data.programType,
            train_dataset: dspyOptimizeNode.data.trainDataset,
            val_dataset: dspyOptimizeNode.data.valDataset,
            save_path: path.join(require('electron').remote.app.getPath('userData'), 'dspy_compiled', dspyOptimizeNode.id)
        };

        // Execute optimization with progress callback
        const result = await executeDSPyOptimization(config, (message, data) => {
            addLog('info', `DSPy: ${message}`, dspyOptimizeNode.id);
            dspyOptimizeNode.data.optimizationLog.push(message);
            updateNodeDisplay(dspyOptimizeNode.id);
        }, signal);

        // Update node with results
        dspyOptimizeNode.data.validationScore = result.validation_score;
        dspyOptimizeNode.data.optimizedSignature = result.optimized_signature;
        dspyOptimizeNode.data.optimizedDemos = result.optimized_demos || [];
        dspyOptimizeNode.data.predictors = result.predictors || [];
        dspyOptimizeNode.data.compiledProgramPath = result.compiled_program_path;
        dspyOptimizeNode.data.datasetSizes = result.dataset_sizes || { train: 0, val: 0 };
        dspyOptimizeNode.data.optimizationStatus = 'success';

        setNodeStatus(dspyOptimizeNode.id, 'success');
        updateNodeDisplay(dspyOptimizeNode.id);

        addLog('info', `DSPy optimization complete! Score: ${(result.validation_score * 100).toFixed(1)}%`, dspyOptimizeNode.id);

    } catch (error) {
        dspyOptimizeNode.data.optimizationStatus = 'error';
        setNodeStatus(dspyOptimizeNode.id, 'error');
        updateNodeDisplay(dspyOptimizeNode.id);

        let errorMsg = error.message;

        // Provide helpful error messages
        if (errorMsg.includes('ECONNREFUSED')) {
            errorMsg += ' - Make sure Ollama is running (ollama serve)';
        } else if (errorMsg.includes('DSPy library not found')) {
            errorMsg += ' - Install with: pip install dspy-ai';
        } else if (errorMsg.includes('Python not found')) {
            errorMsg += ' - Install Python 3.8+ and add to PATH';
        }

        addLog('error', `DSPy optimization failed: ${errorMsg}`, dspyOptimizeNode.id);
    }
}

module.exports = {
    createDSPyOptimizeNodeData,
    renderDSPyOptimizeNode,
    renderDSPyOptimizeInspector,
    isValidDSPyOptimizeConnection,
    isDSPyOptimizeNodeReady,
    validateDSPyOptimizeNode,
    executeDSPyOptimizeNode
};
