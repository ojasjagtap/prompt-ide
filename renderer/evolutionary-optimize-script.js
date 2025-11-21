/**
 * Evolutionary Optimize Node Helper
 * Handles Evolutionary Optimize node creation, rendering, validation, and execution
 * Uses evolutionary search with BLEU/Levenshtein metrics and hyperparameter tuning
 */

// ============================================================================
// METRICS
// ============================================================================

/**
 * Calculate n-gram precision for BLEU score
 */
function getNgrams(text, n) {
    const tokens = text.toLowerCase().split(/\s+/);
    const ngrams = [];
    for (let i = 0; i <= tokens.length - n; i++) {
        ngrams.push(tokens.slice(i, i + n).join(' '));
    }
    return ngrams;
}

function ngramPrecision(candidate, reference, n) {
    const candidateNgrams = getNgrams(candidate, n);
    const referenceNgrams = getNgrams(reference, n);

    if (candidateNgrams.length === 0) return 0;

    let matches = 0;
    const refCounts = {};
    referenceNgrams.forEach(ng => {
        refCounts[ng] = (refCounts[ng] || 0) + 1;
    });

    candidateNgrams.forEach(ng => {
        if (refCounts[ng] > 0) {
            matches++;
            refCounts[ng]--;
        }
    });

    return matches / candidateNgrams.length;
}

/**
 * Calculate BLEU score (simplified, using unigrams through 4-grams)
 */
function calculateBLEU(candidate, reference) {
    if (!candidate || !reference) return 0;

    const p1 = ngramPrecision(candidate, reference, 1);
    const p2 = ngramPrecision(candidate, reference, 2);
    const p3 = ngramPrecision(candidate, reference, 3);
    const p4 = ngramPrecision(candidate, reference, 4);

    // Geometric mean of precisions
    const bleu = Math.pow(p1 * p2 * p3 * p4, 0.25);

    // Brevity penalty
    const candLen = candidate.split(/\s+/).length;
    const refLen = reference.split(/\s+/).length;
    const bp = candLen >= refLen ? 1 : Math.exp(1 - refLen / candLen);

    return bp * bleu;
}

/**
 * Calculate Levenshtein edit distance
 */
function levenshteinDistance(a, b) {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Calculate normalized edit distance (1 = identical, 0 = completely different)
 */
function calculateEditSimilarity(candidate, reference) {
    if (!candidate || !reference) return 0;
    const distance = levenshteinDistance(candidate, reference);
    const maxLen = Math.max(candidate.length, reference.length);
    return maxLen === 0 ? 1 : 1 - (distance / maxLen);
}

/**
 * Combined metric: weighted BLEU + edit similarity
 */
function evaluateOutput(candidate, reference) {
    const bleu = calculateBLEU(candidate, reference);
    const editSim = calculateEditSimilarity(candidate, reference);

    // Weighted combination: favor BLEU for content, edit distance for structure
    return 0.6 * bleu + 0.4 * editSim;
}

// ============================================================================
// DATA STRUCTURE
// ============================================================================

/**
 * Initialize evolutionary optimize node data structure
 */
function createEvolutionaryOptimizeNodeData() {
    return {
        title: 'Evolutionary',
        expectedOutput: '',
        numGenerations: 5,          // Evolutionary generations
        populationSize: 6,          // Population pool size
        currentGeneration: 0,
        bestPrompt: '',
        bestScore: 0,
        bestHyperparams: { temperature: 0.7 },
        population: [],             // Current population
        optimizationStatus: 'idle'
    };
}

/**
 * Render evolutionary optimize node HTML
 */
function renderEvolutionaryOptimizeNode(node, edges, nodes) {
    const collapseIconId = node.collapsed ? 'icon-chevron-right' : 'icon-chevron-down';
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
                    <div class="pin pin-input" data-pin="input"></div>
                    <span class="pin-label">response</span>
                </div>
                <div class="pin-spacer"></div>
            </div>
        </div>
        <div class="node-body" style="display: ${node.collapsed ? 'none' : 'block'}">
            <div class="node-description">Evolutionary prompt optimization</div>
            <div class="node-output-viewer">${node.data.bestPrompt}</div>
        </div>
    `;
}

/**
 * Render evolutionary optimize node inspector UI
 */
function renderEvolutionaryOptimizeInspector(node, updateNodeDisplay, edges, nodes, state) {
    // Button is disabled when any operation is running
    const buttonDisabled = state.isRunning || state.isOptimizing || state.isRunningModelNode;

    // Check if we have optimized results to apply
    const hasOptimizedResults = node.data.bestPrompt && node.data.bestScore > 0;
    const applyButtonDisabled = buttonDisabled || !hasOptimizedResults;

    const html = `
        <div class="inspector-section">
            <label>Title</label>
            <input type="text" id="inspectorTitle" class="inspector-input" value="${node.data.title}">
        </div>
        <div class="inspector-section">
            <label>Expected Output</label>
            <textarea id="inspectorExpectedOutput" class="inspector-textarea" rows="6">${node.data.expectedOutput}</textarea>
        </div>
        <div class="inspector-section">
            <label>Generations</label>
            <input type="number" id="inspectorNumGenerations" class="inspector-input"
                   value="${node.data.numGenerations}" min="1" max="20">
        </div>
        <div class="inspector-section">
            <label>Population Size</label>
            <input type="number" id="inspectorPopulationSize" class="inspector-input"
                   value="${node.data.populationSize}" min="3" max="12">
        </div>
        <div class="inspector-section">
            <label>Best Optimized Prompt</label>
            <textarea id="inspectorBestPrompt" class="inspector-textarea" rows="8" readonly>${node.data.bestPrompt}</textarea>
        </div>
        <div class="inspector-section" style="font-size: 11px; color: #888; margin-top: -8px;">
            Score: ${(node.data.bestScore * 100).toFixed(1)}% | Temp: ${node.data.bestHyperparams?.temperature || 0.7}
        </div>
        <div class="inspector-section">
            <button id="inspectorRunOptimize" class="inspector-button"
                    style="width: 100%; padding: 10px; background: ${buttonDisabled ? '#6c757d' : '#4a9eff'}; color: white; border: none; border-radius: 4px; cursor: ${buttonDisabled ? 'not-allowed' : 'pointer'}; font-size: 14px; opacity: ${buttonDisabled ? '0.6' : '1'};"
                    ${buttonDisabled ? 'disabled' : ''}>
                Run
            </button>
        </div>
        <div class="inspector-section">
            <button id="inspectorApplyToModel" class="inspector-button"
                    style="width: 100%; padding: 10px; background: ${applyButtonDisabled ? '#6c757d' : '#4a9eff'}; color: white; border: none; border-radius: 4px; cursor: ${applyButtonDisabled ? 'not-allowed' : 'pointer'}; font-size: 14px; opacity: ${applyButtonDisabled ? '0.6' : '1'};"
                    ${applyButtonDisabled ? 'disabled' : ''}>
                Apply
            </button>
        </div>
    `;

    // Return both HTML and event listener setup function
    return {
        html,
        setupListeners: (context) => {
            document.getElementById('inspectorTitle').addEventListener('input', (e) => {
                node.data.title = e.target.value;
                updateNodeDisplay(node.id);
            });

            document.getElementById('inspectorExpectedOutput').addEventListener('input', (e) => {
                node.data.expectedOutput = e.target.value;
                // Update node display to reflect validation state
                updateNodeDisplay(node.id);
            });

            document.getElementById('inspectorNumGenerations').addEventListener('input', (e) => {
                node.data.numGenerations = parseInt(e.target.value, 10) || 5;
            });

            document.getElementById('inspectorPopulationSize').addEventListener('input', (e) => {
                node.data.populationSize = parseInt(e.target.value, 10) || 6;
            });

            // Run button in inspector
            const runButton = document.getElementById('inspectorRunOptimize');
            if (runButton && context && context.runOptimizeNode) {
                runButton.addEventListener('click', async () => {
                    // Validate before running
                    const errors = validateEvolutionaryOptimizeNode(node, context.edges, context.nodes);
                    if (errors.length > 0) {
                        // Log each error
                        errors.forEach(error => {
                            context.addLog('error', error, node.id);
                        });
                        return;
                    }

                    await context.runOptimizeNode(node.id);
                });
            }

            // Apply to Model button
            const applyButton = document.getElementById('inspectorApplyToModel');
            if (applyButton && context) {
                applyButton.addEventListener('click', () => {
                    applyOptimizedValuesToModel(node, context.edges, context.nodes, context.addLog, context.updateNodeDisplay);
                });
            }
        }
    };
}

/**
 * Validate evolutionary optimize node connections
 */
function isValidEvolutionaryOptimizeConnection(sourceNode, sourcePin, targetNode, targetPin, edges) {
    // Allow Model.output → Optimize.input (model response to optimize)
    if (sourceNode.type === 'model' && sourcePin === 'output' &&
        targetNode.type === 'evolutionary-optimize' && targetPin === 'input') {

        // Check if optimize node already has a connection to its input pin
        if (edges) {
            for (const edge of edges.values()) {
                if (edge.targetNodeId === targetNode.id && edge.targetPin === 'input') {
                    // Already has a connection to the input pin
                    return false;
                }
            }
        }

        return true;
    }

    return false;
}

// ============================================================================
// EVOLUTIONARY OPERATORS
// ============================================================================

/**
 * Find connected Prompt node for evolutionary optimization
 */
function findConnectedPromptNode(evolutionaryOptimizeNodeId, edges, nodes) {
    for (const node of nodes.values()) {
        if (node.type === 'prompt' && node.data.systemPrompt) {
            return node;
        }
    }
    return null;
}

/**
 * Find the model node connected to the optimize node
 * The model node is connected as: Model.output → Optimize.input
 */
function findConnectedModelNode(optimizeNodeId, edges, nodes) {
    // Find the edge where optimize node is the target
    for (const edge of edges.values()) {
        if (edge.targetNodeId === optimizeNodeId && edge.targetPin === 'input') {
            const sourceNode = nodes.get(edge.sourceNodeId);
            if (sourceNode && sourceNode.type === 'model' && edge.sourcePin === 'output') {
                return sourceNode;
            }
        }
    }
    return null;
}

/**
 * Apply optimized prompt and temperature to the connected model node
 */
function applyOptimizedValuesToModel(optimizeNode, edges, nodes, addLog, updateNodeDisplay) {
    // Check if we have optimized results
    if (!optimizeNode.data.bestPrompt || !optimizeNode.data.bestScore) {
        addLog('error', 'No optimized results to apply. Run optimization first.', optimizeNode.id);
        return;
    }

    // Find the connected model node
    const modelNode = findConnectedModelNode(optimizeNode.id, edges, nodes);
    if (!modelNode) {
        addLog('error', 'No model node connected to this optimize node', optimizeNode.id);
        return;
    }

    // Find the prompt node
    const promptNode = findConnectedPromptNode(optimizeNode.id, edges, nodes);
    if (!promptNode) {
        addLog('error', 'No prompt node found', optimizeNode.id);
        return;
    }

    // Apply the optimized values
    promptNode.data.systemPrompt = optimizeNode.data.bestPrompt;
    modelNode.data.temperature = optimizeNode.data.bestHyperparams?.temperature || 0.7;

    // Update displays
    updateNodeDisplay(promptNode.id);
    updateNodeDisplay(modelNode.id);

    // Log success
    addLog('info', `Applied optimized prompt and temperature (${optimizeNode.data.bestHyperparams?.temperature || 0.7}) to model`, optimizeNode.id);
}

/**
 * Check if Evolutionary Optimize node is ready to run
 * Returns boolean
 */
function isEvolutionaryOptimizeNodeReady(evolutionaryOptimizeNode, edges, nodes) {
    // Check 1: Prompt node with system prompt exists
    let hasPromptNode = false;
    for (const node of nodes.values()) {
        if (node.type === 'prompt' && node.data.systemPrompt?.trim()) {
            hasPromptNode = true;
            break;
        }
    }
    if (!hasPromptNode) return false;

    // Check 2: Expected Output is filled
    if (!evolutionaryOptimizeNode.data.expectedOutput?.trim()) return false;

    // Check 3: Model node exists
    let hasModelNode = false;
    for (const node of nodes.values()) {
        if (node.type === 'model' && node.data.model) {
            hasModelNode = true;
            break;
        }
    }
    if (!hasModelNode) return false;

    // Check 4: If Model is connected to Evolutionary Optimize, it must have output
    for (const edge of edges.values()) {
        if (edge.targetNodeId === evolutionaryOptimizeNode.id && edge.targetPin === 'input') {
            const sourceNode = nodes.get(edge.sourceNodeId);
            if (sourceNode?.type === 'model' && edge.sourcePin === 'output') {
                // Model is connected - check if it has output
                if (!sourceNode.data.output || !sourceNode.data.output.trim()) {
                    return false;
                }
            }
        }
    }

    // All checks passed
    return true;
}

/**
 * Validate Evolutionary Optimize node and return error messages for what's missing
 * Returns array of error messages (empty if ready)
 */
function validateEvolutionaryOptimizeNode(evolutionaryOptimizeNode, edges, nodes) {
    const errors = [];

    // Check 1: Prompt node with system prompt exists
    let hasPromptNode = false;
    for (const node of nodes.values()) {
        if (node.type === 'prompt' && node.data.systemPrompt?.trim()) {
            hasPromptNode = true;
            break;
        }
    }
    if (!hasPromptNode) {
        errors.push('Missing Prompt node with system prompt');
    }

    // Check 2: Expected Output is filled
    if (!evolutionaryOptimizeNode.data.expectedOutput?.trim()) {
        errors.push('Expected Output is required');
    }

    // Check 3: Model node exists
    let hasModelNode = false;
    for (const node of nodes.values()) {
        if (node.type === 'model' && node.data.model) {
            hasModelNode = true;
            break;
        }
    }
    if (!hasModelNode) {
        errors.push('Missing Model node');
    }

    // Check 4: If Model is connected to Evolutionary Optimize, it must have output
    for (const edge of edges.values()) {
        if (edge.targetNodeId === evolutionaryOptimizeNode.id && edge.targetPin === 'input') {
            const sourceNode = nodes.get(edge.sourceNodeId);
            if (sourceNode?.type === 'model' && edge.sourcePin === 'output') {
                // Model is connected - check if it has output
                if (!sourceNode.data.output || !sourceNode.data.output.trim()) {
                    errors.push('Connected Model node has no output');
                }
            }
        }
    }

    return errors;
}

/**
 * Mutate a prompt using LLM (evolutionary mutation)
 * Includes expected output for guided evolution
 */
function buildMutationPrompt(prompt, expectedOutput) {
    // Build the mutation prompt with expected output guidance
    let mutationPrompt = `You are a prompt engineering expert. Create a meaningful variation of the following system prompt.

EXPECTED OUTPUT: ${expectedOutput}

ORIGINAL PROMPT:
${prompt}

Generate ONE improved variation that:
- Optimizes for producing outputs like the expected output shown above
- Uses different phrasing or structure
- Adds clarity or specificity
- Could potentially improve output quality

OUTPUT ONLY the new prompt, without explanations. Start directly with the prompt content.`;

    return mutationPrompt;
}

/**
 * Crossover two prompts (combine elements from parents)
 * Includes expected output for guided evolution
 */
function buildCrossoverPrompt(prompt1, prompt2, expectedOutput) {
    return `You are a prompt engineering expert. Combine the best elements from these two prompts into a single, superior prompt.

EXPECTED OUTPUT: ${expectedOutput}

PROMPT A:
${prompt1}

PROMPT B:
${prompt2}

Create a hybrid prompt that:
- Optimizes for producing outputs like the expected output shown above
- Takes the best aspects from both parents
- Maintains coherence and clarity
- Is more effective than either parent

OUTPUT ONLY the hybrid prompt, without explanations.`;
}

// ============================================================================
// MAIN OPTIMIZATION ALGORITHM
// ============================================================================

/**
 * Test a prompt with hyperparameter tuning and metric-based scoring
 */
async function evaluatePrompt(
    prompt,
    testInput,
    expectedOutput,
    temperature,
    modelId,
    provider,
    callModelStreaming,
    signal
) {
    const testPrompt = `System: ${prompt}\n\nUser: ${testInput}`;
    let output = '';

    await callModelStreaming(
        testPrompt,
        modelId,
        temperature,
        500,
        (chunk) => { output += chunk; },
        signal,
        null,
        provider
    );

    // Score using BLEU + Levenshtein
    const score = evaluateOutput(output, expectedOutput);
    return { score, output };
}

/**
 * Execute evolutionary optimization with hyperparameter tuning
 */
async function executeEvolutionaryOptimizeNode(
    evolutionaryOptimizeNode,
    edges,
    nodes,
    callModelStreaming,
    updateNodeDisplay,
    setNodeStatus,
    addLog,
    signal
) {
    // ========== PRECONDITIONS ==========

    const promptNode = findConnectedPromptNode(evolutionaryOptimizeNode.id, edges, nodes);

    if (!promptNode) {
        addLog('error', `No Prompt node found`, evolutionaryOptimizeNode.id);
        evolutionaryOptimizeNode.data.optimizationStatus = 'error';
        updateNodeDisplay(evolutionaryOptimizeNode.id);
        return;
    }

    if (!promptNode.data.systemPrompt?.trim()) {
        addLog('error', `Prompt node has no system prompt`, evolutionaryOptimizeNode.id);
        evolutionaryOptimizeNode.data.optimizationStatus = 'error';
        updateNodeDisplay(evolutionaryOptimizeNode.id);
        return;
    }

    if (!evolutionaryOptimizeNode.data.expectedOutput?.trim()) {
        addLog('error', `Expected Output is required`, evolutionaryOptimizeNode.id);
        evolutionaryOptimizeNode.data.optimizationStatus = 'error';
        updateNodeDisplay(evolutionaryOptimizeNode.id);
        return;
    }

    // Find model for optimization
    let optimizationModel = null;
    for (const node of nodes.values()) {
        if (node.type === 'model' && node.data.model) {
            optimizationModel = {
                modelId: node.data.model,
                provider: node.data.provider || 'ollama'
            };
            break;
        }
    }

    if (!optimizationModel) {
        addLog('error', `No Model node found`, evolutionaryOptimizeNode.id);
        evolutionaryOptimizeNode.data.optimizationStatus = 'error';
        updateNodeDisplay(evolutionaryOptimizeNode.id);
        return;
    }

    // ========== INITIALIZATION ==========

    setNodeStatus(evolutionaryOptimizeNode.id, 'running');
    evolutionaryOptimizeNode.data.optimizationStatus = 'running';
    evolutionaryOptimizeNode.data.population = [];
    evolutionaryOptimizeNode.data.currentGeneration = 0;
    evolutionaryOptimizeNode.data.bestScore = 0;
    updateNodeDisplay(evolutionaryOptimizeNode.id);

    const basePrompt = promptNode.data.systemPrompt;
    const testInput = promptNode.data.userPrompt || "Generate a response.";
    const expectedOutput = evolutionaryOptimizeNode.data.expectedOutput;
    const popSize = evolutionaryOptimizeNode.data.populationSize;
    const numGens = evolutionaryOptimizeNode.data.numGenerations;

    addLog('info', `Evolutionary Optimize: Starting ${numGens} generations, population ${popSize}`);

    try {
        // Hyperparameter candidates to test
        const tempCandidates = [0.3, 0.5, 0.7, 0.9, 1.1];

        // ========== INITIAL POPULATION ==========

        addLog('info', `Evolutionary Optimize: Creating initial population`);

        const population = [{ prompt: basePrompt, score: 0, temp: 0.7 }];

        // Generate popSize-1 mutations of base prompt
        for (let i = 1; i < popSize; i++) {
            if (signal?.aborted) throw new Error('Cancelled');

            const mutationPrompt = buildMutationPrompt(basePrompt, expectedOutput);
            let mutated = '';

            await callModelStreaming(
                mutationPrompt,
                optimizationModel.modelId,
                0.8,
                800,
                (chunk) => { mutated += chunk; },
                signal,
                null,
                optimizationModel.provider
            );

            population.push({ prompt: mutated.trim(), score: 0, temp: 0.7 });
        }

        // ========== EVOLUTIONARY LOOP ==========

        for (let gen = 0; gen < numGens; gen++) {
            if (signal?.aborted) throw new Error('Cancelled');

            evolutionaryOptimizeNode.data.currentGeneration = gen + 1;
            updateNodeDisplay(evolutionaryOptimizeNode.id);

            addLog('info', `Evolutionary Optimize: Generation ${gen + 1}/${numGens}`);

            // Evaluate each candidate with hyperparameter tuning
            for (const candidate of population) {
                if (signal?.aborted) throw new Error('Cancelled');

                let bestScore = 0;
                let bestTemp = 0.7;

                // Test with multiple temperatures
                for (const temp of tempCandidates) {
                    const { score } = await evaluatePrompt(
                        candidate.prompt,
                        testInput,
                        expectedOutput,
                        temp,
                        optimizationModel.modelId,
                        optimizationModel.provider,
                        callModelStreaming,
                        signal
                    );

                    if (score > bestScore) {
                        bestScore = score;
                        bestTemp = temp;
                    }
                }

                candidate.score = bestScore;
                candidate.temp = bestTemp;
            }

            // Sort by score (descending)
            population.sort((a, b) => b.score - a.score);

            const best = population[0];
            addLog('info', `Evolutionary Optimize: Best score ${(best.score * 100).toFixed(1)}% (temp ${best.temp})`);

            // Update global best
            if (best.score > evolutionaryOptimizeNode.data.bestScore) {
                evolutionaryOptimizeNode.data.bestScore = best.score;
                evolutionaryOptimizeNode.data.bestPrompt = best.prompt;
                evolutionaryOptimizeNode.data.bestHyperparams = { temperature: best.temp };
                updateNodeDisplay(evolutionaryOptimizeNode.id);
            }

            // Stop if we're at the last generation
            if (gen === numGens - 1) break;

            // ========== SELECTION & REPRODUCTION ==========

            // Keep top 50%
            const survivors = population.slice(0, Math.ceil(popSize / 2));

            const nextGen = [...survivors];

            // Fill rest with mutations and crossovers
            while (nextGen.length < popSize) {
                if (signal?.aborted) throw new Error('Cancelled');

                if (Math.random() < 0.7 && survivors.length > 1) {
                    // Crossover (30% of offspring)
                    const parent1 = survivors[Math.floor(Math.random() * survivors.length)];
                    const parent2 = survivors[Math.floor(Math.random() * survivors.length)];

                    const crossoverPrompt = buildCrossoverPrompt(
                        parent1.prompt,
                        parent2.prompt,
                        expectedOutput
                    );

                    let offspring = '';
                    await callModelStreaming(
                        crossoverPrompt,
                        optimizationModel.modelId,
                        0.7,
                        800,
                        (chunk) => { offspring += chunk; },
                        signal,
                        null,
                        optimizationModel.provider
                    );

                    nextGen.push({ prompt: offspring.trim(), score: 0, temp: 0.7 });
                } else {
                    // Mutation (70% of offspring)
                    const parent = survivors[Math.floor(Math.random() * survivors.length)];
                    const mutationPrompt = buildMutationPrompt(parent.prompt, expectedOutput);

                    let mutated = '';
                    await callModelStreaming(
                        mutationPrompt,
                        optimizationModel.modelId,
                        0.8,
                        800,
                        (chunk) => { mutated += chunk; },
                        signal,
                        null,
                        optimizationModel.provider
                    );

                    nextGen.push({ prompt: mutated.trim(), score: 0, temp: 0.7 });
                }
            }

            population.length = 0;
            population.push(...nextGen);
        }

        // ========== FINALIZATION ==========

        evolutionaryOptimizeNode.data.optimizationStatus = 'success';
        setNodeStatus(evolutionaryOptimizeNode.id, 'success');
        updateNodeDisplay(evolutionaryOptimizeNode.id);

        addLog('info', `Evolutionary Optimize: Complete with ${(evolutionaryOptimizeNode.data.bestScore * 100).toFixed(1)}% score (temp ${evolutionaryOptimizeNode.data.bestHyperparams.temperature})`);

    } catch (error) {
        evolutionaryOptimizeNode.data.optimizationStatus = 'error';
        updateNodeDisplay(evolutionaryOptimizeNode.id);
        addLog('error', `Optimization error: ${error.message}`, evolutionaryOptimizeNode.id);
    }
}

module.exports = {
    createEvolutionaryOptimizeNodeData,
    renderEvolutionaryOptimizeNode,
    renderEvolutionaryOptimizeInspector,
    isValidEvolutionaryOptimizeConnection,
    isEvolutionaryOptimizeNodeReady,
    validateEvolutionaryOptimizeNode,
    executeEvolutionaryOptimizeNode
};
