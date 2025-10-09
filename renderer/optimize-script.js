/**
 * Optimize Node Helper
 * Handles Optimize node creation, rendering, validation, and execution
 */

/**
 * Initialize optimize node data structure
 */
function createOptimizeNodeData() {
    return {
        title: 'Optimize',
        feedback: '',
        optimizedSystemPrompt: ''
    };
}

/**
 * Render optimize node HTML
 */
function renderOptimizeNode(node) {
    return `
        <div class="node-header">
            <div class="header-top">
                <span class="node-title">${node.data.title}</span>
                <span class="node-status-badge">${node.status}</span>
            </div>
            <div class="header-bottom">
                <div class="pin-container pin-input-container">
                    <div class="pin pin-input" data-pin="input"></div>
                    <span class="pin-label">input</span>
                </div>
                <div class="pin-spacer"></div>
                <div class="pin-container pin-output-container">
                    <span class="pin-label">prompt</span>
                    <div class="pin pin-output" data-pin="prompt"></div>
                </div>
            </div>
        </div>
        <div class="node-body">
            <div class="node-output-viewer">${node.data.optimizedSystemPrompt || 'Run to generate optimized system prompt'}</div>
        </div>
    `;
}

/**
 * Render optimize node inspector UI
 */
function renderOptimizeInspector(node, updateNodeDisplay) {
    const html = `
        <div class="inspector-section">
            <label>Title</label>
            <input type="text" id="inspectorTitle" class="inspector-input" value="${node.data.title}">
        </div>
        <div class="inspector-section">
            <label>Feedback (How to improve?)</label>
            <textarea id="inspectorFeedback" class="inspector-textarea" rows="6">${node.data.feedback}</textarea>
        </div>
        <div class="inspector-section">
            <label>Optimized System Prompt (Read-only)</label>
            <textarea id="inspectorOptimizedSystemPrompt" class="inspector-textarea" rows="10" readonly>${node.data.optimizedSystemPrompt}</textarea>
        </div>
    `;

    // Return both HTML and event listener setup function
    return {
        html,
        setupListeners: () => {
            document.getElementById('inspectorTitle').addEventListener('input', (e) => {
                node.data.title = e.target.value;
                updateNodeDisplay(node.id);
            });

            document.getElementById('inspectorFeedback').addEventListener('input', (e) => {
                node.data.feedback = e.target.value;
            });
        }
    };
}

/**
 * Validate optimize node connections
 */
function isValidOptimizeConnection(sourceNode, sourcePin, targetNode, targetPin) {
    // Allow Model.output → Optimize.input
    if (sourceNode.type === 'model' && sourcePin === 'output' &&
        targetNode.type === 'optimize' && targetPin === 'input') {
        return true;
    }

    // Allow Optimize.prompt → Model.system
    if (sourceNode.type === 'optimize' && sourcePin === 'prompt' &&
        targetNode.type === 'model' && targetPin === 'system') {
        return true;
    }

    return false;
}

/**
 * Build meta-prompt for optimization
 */
function buildOptimizationPrompt(originalSystemPrompt, originalUserInput, modelOutput, feedback) {
    return `Given the following:

Original System Prompt: ${originalSystemPrompt}

Original User Input: ${originalUserInput}

Model Output: ${modelOutput}

User Feedback: ${feedback}

Create an improved version of the system prompt that addresses the user's feedback. 

Output only the optimized system prompt in this exact format:
SYSTEM: [improved system prompt here]

Do not include any other text or explanations.`;
}

/**
 * Find optimize nodes to execute from edges
 */
function findOptimizeNodesToRun(edges, nodes) {
    const optimizeNodesToRun = [];

    for (const edge of edges.values()) {
        const targetNode = nodes.get(edge.targetNodeId);
        if (targetNode?.type === 'optimize') {
            const sourceNode = nodes.get(edge.sourceNodeId);
            if (sourceNode?.type === 'model') {
                // Find the original prompt components for this model
                let originalSystemPrompt = '';
                let originalUserInput = '';

                for (const promptEdge of edges.values()) {
                    if (promptEdge.targetNodeId === sourceNode.id) {
                        const inputNode = nodes.get(promptEdge.sourceNodeId);

                        // Get user input from user → model.user
                        if (inputNode?.type === 'user' && promptEdge.targetPin === 'user') {
                            originalUserInput = inputNode.data.promptText || '';
                        }

                        // Get system prompt from system → model.system
                        if (inputNode?.type === 'system' && promptEdge.targetPin === 'system') {
                            originalSystemPrompt = inputNode.data.promptText || '';
                        }

                        // Get system prompt from optimize → model.system
                        if (inputNode?.type === 'optimize' && promptEdge.targetPin === 'system') {
                            originalSystemPrompt = inputNode.data.optimizedSystemPrompt || '';
                        }
                    }
                }

                optimizeNodesToRun.push({
                    optimizeNode: targetNode,
                    originalSystemPrompt: originalSystemPrompt,
                    originalUserInput: originalUserInput,
                    modelOutput: sourceNode.data.output,
                    modelId: sourceNode.data.model
                });
            }
        }
    }

    return optimizeNodesToRun;
}

/**
 * Execute a single optimize node
 */
async function executeOptimizeNode(
    optimizeNode,
    originalSystemPrompt,
    originalUserInput,
    modelOutput,
    modelId,
    callModelStreaming,
    updateNodeDisplay,
    setNodeStatus,
    addLog,
    signal,
    selectedNodeId
) {
    if (!optimizeNode.data.feedback.trim()) {
        addLog('error', `Feedback is required for Optimize node ${optimizeNode.data.title}`);
        setNodeStatus(optimizeNode.id, 'error');
        return;
    }
    
    setNodeStatus(optimizeNode.id, 'running');
    addLog('info', `node_started: ${optimizeNode.data.title} (${optimizeNode.id})`);
    
    const metaPrompt = buildOptimizationPrompt(originalSystemPrompt, originalUserInput, modelOutput, optimizeNode.data.feedback);
    
    try {
        let fullResponse = '';
        await callModelStreaming(
            metaPrompt,
            modelId,
            0.7,
            100,
            (chunk) => {
                fullResponse += chunk;
                // Parse the response to extract system prompt
                const systemMatch = fullResponse.match(/SYSTEM:\s*([\s\S]*?)$/);
                
                if (systemMatch) {
                    optimizeNode.data.optimizedSystemPrompt = systemMatch[1].trim();
                }
                
                updateNodeDisplay(optimizeNode.id);
                if (selectedNodeId === optimizeNode.id) {
                    const systemEl = document.getElementById('inspectorOptimizedSystemPrompt');
                    if (systemEl) systemEl.value = optimizeNode.data.optimizedSystemPrompt;
                }
            },
            signal
        );
        
        setNodeStatus(optimizeNode.id, 'success');
        addLog('info', `node_completed: ${optimizeNode.data.title} (${optimizeNode.id})`);
    } catch (error) {
        setNodeStatus(optimizeNode.id, 'error');
        optimizeNode.data.optimizedSystemPrompt = `Error: ${error.message}`;
        updateNodeDisplay(optimizeNode.id);
        addLog('error', `node_error: ${optimizeNode.data.title} - ${error.message}`);
    }
}

module.exports = {
    createOptimizeNodeData,
    renderOptimizeNode,
    renderOptimizeInspector,
    isValidOptimizeConnection,
    findOptimizeNodesToRun,
    executeOptimizeNode
};
