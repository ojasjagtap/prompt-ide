/**
 * Prompt Goat - Flow UI MVP
 * Complete implementation with nodes, wiring, inspector, logs, and run engine
 */

const { listModels } = require('../services/modelService');
const {
    createEvolutionaryOptimizeNodeData,
    renderEvolutionaryOptimizeNode,
    renderEvolutionaryOptimizeInspector,
    isValidEvolutionaryOptimizeConnection,
    executeEvolutionaryOptimizeNode
} = require('./evolutionary-optimize-script');
const {
    createToolNodeData,
    renderToolNode,
    renderToolInspector,
    isValidToolConnection,
    findRegisteredTools,
    findConnectedModels,
    buildToolsCatalog,
    setGetAllToolNodes
} = require('./tool-script');
const { executeToolInWorker } = require('./tool-worker-launcher');

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
    // Viewport transform
    viewport: {
        scale: 1.0,
        tx: 0,
        ty: 0
    },

    // Nodes and edges
    nodes: new Map(), // id -> node data
    edges: new Map(), // id -> edge data
    nodeIdCounter: 1,
    edgeIdCounter: 1,
    maxZIndex: 1, // Track highest z-index for bringing nodes to front

    // Selection
    selectedNodeId: null,
    selectedEdgeId: null,

    // Interaction
    isDraggingNode: false,
    draggedNodeId: null,
    dragOffsetX: 0,
    dragOffsetY: 0,

    isPanning: false,
    panStartX: 0,
    panStartY: 0,

    isWiring: false,
    wiringSourceNodeId: null,
    wiringSourcePin: null,
    wiringPreviewX: 0,
    wiringPreviewY: 0,

    // Run state
    isRunning: false,
    currentRunId: null,
    runAbortController: null,
    optimizationAbortController: null,
    isOptimizing: false,
    modelRunAbortController: null,
    isRunningModelNode: false,

    // Logs
    logs: [],
    logsFilter: 'all',
    logsCollapsed: false,
    logsExpandedHeight: 200, // Store the expanded height

    // Models
    availableModels: []
};

// ============================================================================
// CONSTANTS
// ============================================================================

const TILE_SIZE = 32;
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.0;
const PAN_MARGIN = 1500;
const PIN_SNAP_RADIUS = 20;
const NODE_WIDTH = 240;
const NODE_MIN_HEIGHT = 120;

// ============================================================================
// UTILITIES
// ============================================================================

function generateId(prefix) {
    if (prefix === 'node') {
        return `node-${state.nodeIdCounter++}`;
    }
    return `edge-${state.edgeIdCounter++}`;
}

function screenToWorld(screenX, screenY) {
    const { scale, tx, ty } = state.viewport;
    return {
        x: (screenX - tx) / scale,
        y: (screenY - ty) / scale
    };
}

function worldToScreen(worldX, worldY) {
    const { scale, tx, ty } = state.viewport;
    return {
        x: worldX * scale + tx,
        y: worldY * scale + ty
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function formatTimestamp() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour12: false });
}

// ============================================================================
// LOGGING
// ============================================================================

function addLog(level, message, nodeId = null) {
    const log = {
        timestamp: formatTimestamp(),
        level,
        message,
        runId: state.currentRunId,
        nodeId
    };
    state.logs.push(log);

    // Automatically set node status to error if this is an error log for a specific node
    if (level === 'error' && nodeId) {
        setNodeStatus(nodeId, 'error');
    }

    updateLogsUI();
}

function updateLogsUI() {
    const logsBody = document.getElementById('logsBody');
    const filter = state.logsFilter;

    const filteredLogs = state.logs.filter(log => {
        if (filter === 'errors' && log.level !== 'error') return false;
        if (filter === 'current' && log.runId !== state.currentRunId) return false;
        return true;
    });

    if (filteredLogs.length === 0) {
        logsBody.innerHTML = '<div class="logs-empty">No logs to display</div>';
    } else {
        logsBody.innerHTML = filteredLogs.map((log, index) => {
            const levelClass = `log-level-${log.level}`;
            const hasNode = log.nodeId && state.nodes.has(log.nodeId);
            const clickableClass = hasNode ? 'log-clickable' : '';
            const dataNodeAttr = hasNode ? `data-node-id="${log.nodeId}"` : '';

            // Get node title if available
            let nodeTitle = '';
            if (hasNode) {
                const node = state.nodes.get(log.nodeId);
                nodeTitle = node.data.title ? `[${node.data.title}] ` : '';
            }

            return `
                <div class="log-entry ${levelClass} ${clickableClass}" ${dataNodeAttr} data-log-index="${index}">
                    <span class="log-timestamp">${log.timestamp}</span>
                    <span class="log-level">${log.level}</span>
                    <span class="log-message">${nodeTitle}${log.message}</span>
                </div>
            `;
        }).join('');

        // Add click listeners to clickable log entries
        logsBody.querySelectorAll('.log-clickable').forEach(logEntry => {
            logEntry.addEventListener('click', () => {
                const nodeId = logEntry.dataset.nodeId;
                if (nodeId && state.nodes.has(nodeId)) {
                    // Select the node
                    state.selectedNodeId = nodeId;
                    state.selectedEdgeId = null;

                    // Bring node to front
                    bringNodeToFront(nodeId);

                    // Update displays
                    renderEdges();
                    state.nodes.forEach((_, id) => updateNodeDisplay(id));
                    updateInspector();
                }
            });
        });
    }

    // Always scroll to bottom when new logs arrive
    logsBody.scrollTop = logsBody.scrollHeight;
}

// ============================================================================
// NODE MANAGEMENT
// ============================================================================

function createNode(type, worldX, worldY) {
    const id = generateId('node');
    const node = {
        id,
        type,
        x: worldX,
        y: worldY,
        width: NODE_WIDTH,
        height: NODE_MIN_HEIGHT,
        status: 'idle', // idle | running | success | error
        zIndex: state.maxZIndex++, // Assign and increment z-index
        data: {}
    };

    if (type === 'prompt') {
        node.data = {
            title: 'Prompt',
            systemPrompt: '',
            userPrompt: ''
        };
    } else if (type === 'model') {
        node.data = {
            title: 'Model',
            provider: 'ollama', // default to ollama
            model: state.availableModels[0] || '',
            temperature: 0.7,
            maxTokens: 512,
            output: ''
        };
    } else if (type === 'optimize') {
        node.data = createEvolutionaryOptimizeNodeData();
    } else if (type === 'tool') {
        node.data = createToolNodeData();
    }

    state.nodes.set(id, node);
    renderNode(id);
    updateRunButton();
    return id;
}

function deleteNode(id) {
    // Delete connected edges
    const edgesToDelete = [];
    state.edges.forEach((edge, edgeId) => {
        if (edge.sourceNodeId === id || edge.targetNodeId === id) {
            edgesToDelete.push(edgeId);
        }
    });
    edgesToDelete.forEach(edgeId => deleteEdge(edgeId));

    // Delete node
    state.nodes.delete(id);
    const nodeEl = document.getElementById(id);
    if (nodeEl) nodeEl.remove();

    if (state.selectedNodeId === id) {
        state.selectedNodeId = null;
        updateInspector();
    }

    updateRunButton();
}

function bringNodeToFront(id) {
    const node = state.nodes.get(id);
    if (!node) return;

    // Assign the highest z-index to this node
    node.zIndex = state.maxZIndex++;
}

function renderNode(id) {
    const node = state.nodes.get(id);
    if (!node) return;

    const nodesLayer = document.getElementById('nodesLayer');
    let nodeEl = document.getElementById(id);
    let isNewNode = false;

    if (!nodeEl) {
        nodeEl = document.createElement('div');
        nodeEl.id = id;
        nodeEl.className = 'flow-node';
        nodeEl.dataset.nodeType = node.type;
        nodesLayer.appendChild(nodeEl);
        isNewNode = true;
    }

    // Position and size
    const { x: screenX, y: screenY } = worldToScreen(node.x, node.y);
    nodeEl.style.left = `${screenX}px`;
    nodeEl.style.top = `${screenY}px`;
    nodeEl.style.width = `${node.width}px`;
    nodeEl.style.height = 'auto'; // Let content dictate height
    nodeEl.style.transform = `scale(${state.viewport.scale})`;

    // Apply z-index, initializing if needed
    if (node.zIndex === undefined) {
        node.zIndex = state.maxZIndex++;
    }
    nodeEl.style.zIndex = node.zIndex;

    // Status
    nodeEl.classList.toggle('node-selected', node.id === state.selectedNodeId);
    nodeEl.dataset.status = node.status;

    // Content
    if (node.type === 'prompt') {
        nodeEl.innerHTML = `
            <div class="node-header">
                <div class="header-top">
                    <span class="node-title">${node.data.title}</span>
                    <span class="node-status-badge">${node.status}</span>
                </div>
                <div class="header-bottom">
                    <div class="pin-spacer"></div>
                    <div class="pin-container pin-output-container">
                        <span class="pin-label">prompt</span>
                        <div class="pin pin-output" data-pin="prompt"></div>
                    </div>
                </div>
            </div>
            <div class="node-body">
                <div class="node-description">System context and instructions for the model</div>
                <div class="node-output-viewer">${node.data.systemPrompt || ''}</div>
                <div class="node-description" style="margin-top: 10px;">User input that will be sent to the model</div>
                <div class="node-output-viewer">${node.data.userPrompt || ''}</div>
            </div>
        `;
    } else if (node.type === 'model') {
        nodeEl.innerHTML = `
            <div class="node-header">
                <div class="header-top">
                    <span class="node-title">${node.data.title}</span>
                    <span class="node-status-badge">${node.status}</span>
                </div>
                <div class="header-bottom">
                    <div class="pin-container pin-input-container">
                        <div class="pin pin-input" data-pin="prompt"></div>
                        <span class="pin-label">prompt</span>
                    </div>
                    <div class="pin-spacer"></div>
                    <div class="pin-container pin-output-container">
                        <span class="pin-label">response</span>
                        <div class="pin pin-output" data-pin="output"></div>
                    </div>
                </div>
                <div class="header-bottom">
                    <div class="pin-container pin-input-container">
                        <div class="pin pin-input" data-pin="tools"></div>
                        <span class="pin-label">tools</span>
                    </div>
                    <div class="pin-spacer"></div>
                </div>
            </div>
            <div class="node-body">
                <div class="node-description">Generates text using the selected language model</div>
                <div class="node-settings">
                    <div class="setting-row">
                        <span class="setting-label">Model</span>
                        <span class="setting-value">${node.data.model || 'None'}</span>
                    </div>
                    <div class="setting-row">
                        <span class="setting-label">Temperature</span>
                        <span class="setting-value">${node.data.temperature}</span>
                    </div>
                    <div class="setting-row">
                        <span class="setting-label">Max Tokens</span>
                        <span class="setting-value">${node.data.maxTokens}</span>
                    </div>
                </div>
                <div class="node-output-viewer">${node.data.output}</div>
            </div>
        `;
    } else if (node.type === 'optimize') {
        nodeEl.innerHTML = renderEvolutionaryOptimizeNode(node, state.edges, state.nodes);
    } else if (node.type === 'tool') {
        const connectedModels = findConnectedModels(node.id, state.edges, state.nodes);
        nodeEl.innerHTML = renderToolNode(node, connectedModels);
    }

    // Add event listeners only for new nodes
    if (isNewNode) {
        nodeEl.addEventListener('mousedown', onNodeMouseDown);
        nodeEl.addEventListener('click', onNodeClick);
    }

    // Pin listeners - need to re-add these since innerHTML replaces content
    const pins = nodeEl.querySelectorAll('.pin');
    pins.forEach(pin => {
        pin.addEventListener('mousedown', onPinMouseDown);
    });

    // Measure and store the actual rendered height
    // We need to temporarily reset transform to get accurate measurements
    const currentTransform = nodeEl.style.transform;
    nodeEl.style.transform = 'scale(1)';
    const actualHeight = nodeEl.offsetHeight;
    nodeEl.style.transform = currentTransform;
    node.height = actualHeight;
}

function updateNodeDisplay(id) {
    renderNode(id);
    updateEdges();
}

function setNodeStatus(id, status) {
    const node = state.nodes.get(id);
    if (!node) return;
    node.status = status;
    updateNodeDisplay(id);
}

// ============================================================================
// EDGE MANAGEMENT
// ============================================================================

function createEdge(sourceNodeId, sourcePin, targetNodeId, targetPin) {
    // Validate
    if (!isValidConnection(sourceNodeId, sourcePin, targetNodeId, targetPin)) {
        return null;
    }

    // Check for duplicates
    for (const edge of state.edges.values()) {
        if (edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId) {
            return null;
        }
    }

    const id = generateId('edge');
    const edge = {
        id,
        sourceNodeId,
        sourcePin,
        targetNodeId,
        targetPin
    };

    state.edges.set(id, edge);

    // Log tool registration
    const sourceNode = state.nodes.get(sourceNodeId);
    const targetNode = state.nodes.get(targetNodeId);
    // if (sourceNode?.type === 'tool' && targetNode?.type === 'model' && targetPin === 'tools') {
    //     addLog('info', `tool_registered: ${sourceNode.data.name} → ${targetNode.data.title} (${sourceNodeId} → ${targetNodeId})`);
    // }

    renderEdges();
    updateRunButton();
    return id;
}

function deleteEdge(id) {
    const edge = state.edges.get(id);

    // Log tool unregistration
    // if (edge) {
    //     const sourceNode = state.nodes.get(edge.sourceNodeId);
    //     const targetNode = state.nodes.get(edge.targetNodeId);
    //     if (sourceNode?.type === 'tool' && targetNode?.type === 'model' && edge.targetPin === 'tools') {
    //         addLog('info', `tool_unregistered: ${sourceNode.data.name} → ${targetNode.data.title} (${edge.sourceNodeId} → ${edge.targetNodeId})`);
    //     }
    // }

    state.edges.delete(id);
    if (state.selectedEdgeId === id) {
        state.selectedEdgeId = null;
    }
    renderEdges();
    updateRunButton();
}

function isValidConnection(sourceNodeId, sourcePin, targetNodeId, targetPin) {
    const sourceNode = state.nodes.get(sourceNodeId);
    const targetNode = state.nodes.get(targetNodeId);

    if (!sourceNode || !targetNode) return false;
    if (sourceNode.id === targetNode.id) return false;

    // Allow: Prompt.prompt (output) -> Model.prompt (input)
    if (sourceNode.type === 'prompt' && sourcePin === 'prompt' &&
        targetNode.type === 'model' && targetPin === 'prompt') {
        return true;
    }

    // Check evolutionary optimize connections
    if (isValidEvolutionaryOptimizeConnection(sourceNode, sourcePin, targetNode, targetPin, state.edges)) {
        return true;
    }

    // Check tool connections
    if (isValidToolConnection(sourceNode, sourcePin, targetNode, targetPin)) {
        return true;
    }

    // Reject invalid connections with log
    // addLog('error', 'Incompatible connection attempted');
    return false;
}

function getPinWorldPosition(nodeId, pinName) {
    const node = state.nodes.get(nodeId);
    if (!node) return null;

    const nodeEl = document.getElementById(nodeId);
    if (!nodeEl) return null;

    const pinEl = nodeEl.querySelector(`[data-pin="${pinName}"]`);
    if (!pinEl) return null;

    const pinRect = pinEl.getBoundingClientRect();
    const containerRect = document.getElementById('canvasContainer').getBoundingClientRect();

    const screenX = pinRect.left - containerRect.left + pinRect.width / 2;
    const screenY = pinRect.top - containerRect.top + pinRect.height / 2;

    return screenToWorld(screenX, screenY);
}

function renderEdges() {
    const svg = document.getElementById('edgesSvg');
    svg.innerHTML = '';

    state.edges.forEach((edge, id) => {
        const sourcePos = getPinWorldPosition(edge.sourceNodeId, edge.sourcePin);
        const targetPos = getPinWorldPosition(edge.targetNodeId, edge.targetPin);

        if (!sourcePos || !targetPos) return;

        const sourceSc = worldToScreen(sourcePos.x, sourcePos.y);
        const targetSc = worldToScreen(targetPos.x, targetPos.y);

        const path = createCurvePath(sourceSc.x, sourceSc.y, targetSc.x, targetSc.y);
        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', path);
        pathEl.setAttribute('class', 'edge');
        pathEl.setAttribute('data-edge-id', id);
        pathEl.setAttribute('stroke', '#888');
        pathEl.setAttribute('stroke-width', '2');
        pathEl.setAttribute('fill', 'none');

        if (id === state.selectedEdgeId) {
            pathEl.setAttribute('stroke', '#f80');
            pathEl.setAttribute('stroke-width', '3');
        }

        pathEl.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            state.selectedEdgeId = id;
            state.selectedNodeId = null;
            renderEdges();
            updateInspector();
        });

        svg.appendChild(pathEl);
    });

    // Render wiring preview
    if (state.isWiring && state.wiringSourceNodeId) {
        const sourcePos = getPinWorldPosition(state.wiringSourceNodeId, state.wiringSourcePin);
        if (sourcePos) {
            const sourceSc = worldToScreen(sourcePos.x, sourcePos.y);
            const targetSc = { x: state.wiringPreviewX, y: state.wiringPreviewY };

            // Check if hovering over a compatible pin
            const hoveredPin = getHoveredPin(targetSc.x, targetSc.y);
            let isCompatible = false;
            if (hoveredPin) {
                isCompatible = isValidConnection(
                    state.wiringSourceNodeId,
                    state.wiringSourcePin,
                    hoveredPin.nodeId,
                    hoveredPin.pinName
                );
            }

            const path = createCurvePath(sourceSc.x, sourceSc.y, targetSc.x, targetSc.y);
            const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathEl.setAttribute('d', path);
            pathEl.setAttribute('class', 'edge-preview');
            pathEl.setAttribute('stroke', isCompatible ? '#4af' : '#4af');
            pathEl.setAttribute('stroke-width', '2');
            pathEl.setAttribute('stroke-dasharray', isCompatible ? '0' : '5,5');
            pathEl.setAttribute('fill', 'none');
            svg.appendChild(pathEl);
        }
    }
}

function createCurvePath(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1);
    const controlOffset = Math.min(dx * 0.5, 100);
    const cx1 = x1 + controlOffset;
    const cx2 = x2 - controlOffset;
    return `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
}

function updateEdges() {
    renderEdges();
}

function getHoveredPin(screenX, screenY) {
    const pins = document.querySelectorAll('.pin');
    const containerRect = document.getElementById('canvasContainer').getBoundingClientRect();

    for (const pinEl of pins) {
        const rect = pinEl.getBoundingClientRect();
        const pinScreenX = rect.left - containerRect.left + rect.width / 2;
        const pinScreenY = rect.top - containerRect.top + rect.height / 2;

        const dist = Math.sqrt((screenX - pinScreenX) ** 2 + (screenY - pinScreenY) ** 2);
        if (dist < PIN_SNAP_RADIUS) {
            const nodeEl = pinEl.closest('.flow-node');
            return {
                nodeId: nodeEl.id,
                pinName: pinEl.dataset.pin,
                element: pinEl
            };
        }
    }
    return null;
}

// ============================================================================
// INSPECTOR
// ============================================================================

function updateInspector() {
    const inspectorContent = document.getElementById('inspectorContent');

    if (!state.selectedNodeId) {
        inspectorContent.innerHTML = '<div class="no-selection">No node selected</div>';
        return;
    }

    const node = state.nodes.get(state.selectedNodeId);
    if (!node) {
        inspectorContent.innerHTML = '<div class="no-selection">No node selected</div>';
        return;
    }

    if (node.type === 'prompt') {
        inspectorContent.innerHTML = `
            <div class="inspector-section">
                <label>Title</label>
                <input type="text" id="inspectorTitle" class="inspector-input" value="${node.data.title}">
            </div>
            <div class="inspector-section">
                <label>System Prompt</label>
                <textarea id="inspectorSystemPrompt" class="inspector-textarea" rows="8">${node.data.systemPrompt}</textarea>
            </div>
            <div class="inspector-section">
                <label>User Prompt</label>
                <textarea id="inspectorUserPrompt" class="inspector-textarea" rows="8">${node.data.userPrompt}</textarea>
            </div>
        `;

        document.getElementById('inspectorTitle').addEventListener('input', (e) => {
            node.data.title = e.target.value;
            updateNodeDisplay(node.id);
        });

        document.getElementById('inspectorSystemPrompt').addEventListener('input', (e) => {
            node.data.systemPrompt = e.target.value;
            updateNodeDisplay(node.id);
        });

        document.getElementById('inspectorUserPrompt').addEventListener('input', (e) => {
            node.data.userPrompt = e.target.value;
            updateNodeDisplay(node.id);
        });
    } else if (node.type === 'model') {
        // Ensure node has provider field (for backward compatibility)
        if (!node.data.provider) {
            node.data.provider = 'ollama';
        }

        // Get available providers (show all - API key check happens at runtime)
        const providers = providerRegistry.getProviders();
        const providerOptions = providers
            .map(p => `<option value="${p.id}" ${p.id === node.data.provider ? 'selected' : ''}>${p.name}</option>`)
            .join('');

        // Get models for current provider
        let modelOptions = '';
        let modelsLoading = false;

        // Function to load models for provider
        const loadProviderModels = async (providerId) => {
            try {
                const models = await providerRegistry.listModels(providerId);
                return models.map(m =>
                    `<option value="${m.id}" ${m.id === node.data.model ? 'selected' : ''}>${m.name}</option>`
                ).join('');
            } catch (error) {
                console.error(`Failed to load models for ${providerId}:`, error);
                return '<option value="">Error loading models</option>';
            }
        };

        // Determine if run button should be disabled
        const buttonDisabled = state.isRunning || state.isOptimizing || state.isRunningModelNode;

        inspectorContent.innerHTML = `
            <div class="inspector-section">
                <label>Title</label>
                <input type="text" id="inspectorTitle" class="inspector-input" value="${node.data.title}">
            </div>
            <div class="inspector-section">
                <label>Provider</label>
                <select id="inspectorProvider" class="inspector-input">
                    ${providerOptions}
                </select>
            </div>
            <div class="inspector-section">
                <label>Model</label>
                <select id="inspectorModel" class="inspector-input">
                    <option value="">Loading...</option>
                </select>
            </div>
            <div class="inspector-section">
                <label>Temperature</label>
                <input type="number" id="inspectorTemperature" class="inspector-input" value="${node.data.temperature}" step="0.1" min="0" max="2">
            </div>
            <div class="inspector-section">
                <label>Max Tokens</label>
                <input type="number" id="inspectorMaxTokens" class="inspector-input" value="${node.data.maxTokens}" min="1">
            </div>
            <div class="inspector-section">
                <label>Output</label>
                <textarea id="inspectorOutput" class="inspector-textarea" rows="10" readonly>${node.data.output}</textarea>
            </div>
            <div class="inspector-section">
                <button id="inspectorRunModel" class="inspector-button"
                        style="width: 100%; padding: 10px; background: ${buttonDisabled ? '#6c757d' : '#4a9eff'}; color: white; border: none; border-radius: 4px; cursor: ${buttonDisabled ? 'not-allowed' : 'pointer'}; font-size: 14px; opacity: ${buttonDisabled ? '0.6' : '1'};"
                        ${buttonDisabled ? 'disabled' : ''}>
                    Run
                </button>
            </div>
        `;

        // Load initial models
        (async () => {
            const modelSelect = document.getElementById('inspectorModel');
            const options = await loadProviderModels(node.data.provider);
            modelSelect.innerHTML = options || '<option value="">No models available</option>';
        })();

        document.getElementById('inspectorTitle').addEventListener('input', (e) => {
            node.data.title = e.target.value;
            updateNodeDisplay(node.id);
        });

        document.getElementById('inspectorProvider').addEventListener('change', async (e) => {
            const newProvider = e.target.value;
            node.data.provider = newProvider;
            node.data.model = ''; // Reset model when provider changes

            // Load models for new provider
            const modelSelect = document.getElementById('inspectorModel');
            modelSelect.innerHTML = '<option value="">Loading...</option>';
            const options = await loadProviderModels(newProvider);
            modelSelect.innerHTML = options || '<option value="">No models available</option>';

            // Select first model if available
            if (modelSelect.options.length > 0 && modelSelect.options[0].value) {
                node.data.model = modelSelect.options[0].value;
            }

            updateNodeDisplay(node.id);
        });

        document.getElementById('inspectorModel').addEventListener('change', (e) => {
            node.data.model = e.target.value;
            updateNodeDisplay(node.id);
        });

        document.getElementById('inspectorTemperature').addEventListener('input', (e) => {
            node.data.temperature = parseFloat(e.target.value);
            updateNodeDisplay(node.id);
        });

        document.getElementById('inspectorMaxTokens').addEventListener('input', (e) => {
            node.data.maxTokens = parseInt(e.target.value);
            updateNodeDisplay(node.id);
        });

        // Run button
        document.getElementById('inspectorRunModel').addEventListener('click', async () => {
            await runModelNode(node.id);
        });
    } else if (node.type === 'optimize') {
        const inspector = renderEvolutionaryOptimizeInspector(node, updateNodeDisplay, state.edges, state.nodes, state);
        inspectorContent.innerHTML = inspector.html;
        inspector.setupListeners({
            edges: state.edges,
            nodes: state.nodes,
            callModelStreaming,
            setNodeStatus,
            addLog,
            runOptimizeNode
        });
    } else if (node.type === 'tool') {
        const inspector = renderToolInspector(node, updateNodeDisplay, addLog);
        inspectorContent.innerHTML = inspector.html;
        inspector.setupListeners();
    }
}

// ============================================================================
// GRID RENDERING
// ============================================================================

function renderGrid() {
    const canvas = document.getElementById('gridCanvas');
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('canvasContainer');

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    const { scale, tx, ty } = state.viewport;
    const worldTileSize = TILE_SIZE;
    const screenTileSize = worldTileSize * scale;

    const offsetX = tx % screenTileSize;
    const offsetY = ty % screenTileSize;

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    // Vertical lines
    for (let x = offsetX; x < width; x += screenTileSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    // Horizontal lines
    for (let y = offsetY; y < height; y += screenTileSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
}

// ============================================================================
// ZOOM AND PAN
// ============================================================================

function handleZoom(deltaY, clientX, clientY) {
    const container = document.getElementById('canvasContainer');
    const rect = container.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const worldBefore = screenToWorld(mouseX, mouseY);

    const zoomFactor = deltaY < 0 ? 1.1 : 0.9;
    const newScale = clamp(state.viewport.scale * zoomFactor, MIN_SCALE, MAX_SCALE);

    state.viewport.scale = newScale;

    const worldAfter = screenToWorld(mouseX, mouseY);

    state.viewport.tx += (worldAfter.x - worldBefore.x) * state.viewport.scale;
    state.viewport.ty += (worldAfter.y - worldBefore.y) * state.viewport.scale;

    clampPanning();
    renderAll();
}

function clampPanning() {
    if (state.nodes.size === 0) {
        state.viewport.tx = 0;
        state.viewport.ty = 0;
        return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.nodes.forEach(node => {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
    });

    minX -= PAN_MARGIN;
    minY -= PAN_MARGIN;
    maxX += PAN_MARGIN;
    maxY += PAN_MARGIN;

    const container = document.getElementById('canvasContainer');
    const viewWidth = container.clientWidth;
    const viewHeight = container.clientHeight;

    const visibleWorldWidth = viewWidth / state.viewport.scale;
    const visibleWorldHeight = viewHeight / state.viewport.scale;

    const minTx = -(maxX * state.viewport.scale - viewWidth);
    const maxTx = -minX * state.viewport.scale;
    const minTy = -(maxY * state.viewport.scale - viewHeight);
    const maxTy = -minY * state.viewport.scale;

    state.viewport.tx = clamp(state.viewport.tx, minTx, maxTx);
    state.viewport.ty = clamp(state.viewport.ty, minTy, maxTy);
}

function renderAll() {
    renderGrid();
    state.nodes.forEach((node, id) => updateNodeDisplay(id));
    renderEdges();
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function onCanvasMouseDown(e) {
    const container = document.getElementById('canvasContainer');
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking on background
    if (e.target === container || e.target.id === 'gridCanvas') {
        state.selectedNodeId = null;
        state.selectedEdgeId = null;
        state.nodes.forEach((_, id) => updateNodeDisplay(id));
        updateInspector();
        renderEdges();

        if (state.nodes.size > 0) {
            state.isPanning = true;
            state.panStartX = e.clientX;
            state.panStartY = e.clientY;
            container.style.cursor = 'grabbing';
            document.body.classList.add('panning');
        }
    }
}

function onCanvasMouseMove(e) {
    const container = document.getElementById('canvasContainer');
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (state.isPanning) {
        const dx = e.clientX - state.panStartX;
        const dy = e.clientY - state.panStartY;

        state.viewport.tx += dx;
        state.viewport.ty += dy;

        state.panStartX = e.clientX;
        state.panStartY = e.clientY;

        clampPanning();
        renderAll();
    } else if (state.isDraggingNode && state.draggedNodeId) {
        const world = screenToWorld(x, y);
        const node = state.nodes.get(state.draggedNodeId);
        if (node) {
            node.x = world.x - state.dragOffsetX;
            node.y = world.y - state.dragOffsetY;
            updateNodeDisplay(node.id);
            updateEdges();
        }
    } else if (state.isWiring) {
        state.wiringPreviewX = x;
        state.wiringPreviewY = y;
        renderEdges();
    }
}

function onCanvasMouseUp(e) {
    const container = document.getElementById('canvasContainer');
    container.style.cursor = state.nodes.size > 0 ? 'grab' : 'default';

    if (state.isWiring) {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const hoveredPin = getHoveredPin(x, y);
        if (hoveredPin) {
            const valid = isValidConnection(
                state.wiringSourceNodeId,
                state.wiringSourcePin,
                hoveredPin.nodeId,
                hoveredPin.pinName
            );

            if (valid) {
                createEdge(
                    state.wiringSourceNodeId,
                    state.wiringSourcePin,
                    hoveredPin.nodeId,
                    hoveredPin.pinName
                );
            }
        }

        state.isWiring = false;
        state.wiringSourceNodeId = null;
        state.wiringSourcePin = null;
        renderEdges();
    }

    state.isPanning = false;
    state.isDraggingNode = false;
    state.draggedNodeId = null;
    document.body.classList.remove('dragging', 'panning');
}

function onCanvasWheel(e) {
    e.preventDefault();
    handleZoom(e.deltaY, e.clientX, e.clientY);
}

function onNodeMouseDown(e) {
    e.stopPropagation();

    const nodeEl = e.currentTarget;
    const nodeId = nodeEl.id;

    // Check if clicking on a pin
    if (e.target.classList.contains('pin')) {
        return; // Handled by pin handler
    }

    const container = document.getElementById('canvasContainer');
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const world = screenToWorld(x, y);
    const node = state.nodes.get(nodeId);

    // Bring node to front when starting to drag (just update z-index, don't re-render)
    bringNodeToFront(nodeId);
    nodeEl.style.zIndex = node.zIndex;

    state.isDraggingNode = true;
    state.draggedNodeId = nodeId;
    state.dragOffsetX = world.x - node.x;
    state.dragOffsetY = world.y - node.y;
    document.body.classList.add('dragging');
}

function onNodeClick(e) {
    e.stopPropagation();
    const nodeId = e.currentTarget.id;

    // Bring node to front when selected
    bringNodeToFront(nodeId);

    state.selectedNodeId = nodeId;
    state.selectedEdgeId = null;
    renderEdges();
    state.nodes.forEach((_, id) => updateNodeDisplay(id));
    updateInspector();
}

function onPinMouseDown(e) {
    e.stopPropagation();
    e.preventDefault();

    const pinEl = e.target;

    // Prevent wiring from input pins
    if (pinEl.classList.contains('pin-input')) {
        return;
    }

    const nodeEl = pinEl.closest('.flow-node');
    const nodeId = nodeEl.id;
    const pinName = pinEl.dataset.pin;

    state.isWiring = true;
    state.wiringSourceNodeId = nodeId;
    state.wiringSourcePin = pinName;

    const container = document.getElementById('canvasContainer');
    const rect = container.getBoundingClientRect();
    state.wiringPreviewX = e.clientX - rect.left;
    state.wiringPreviewY = e.clientY - rect.top;

    renderEdges();
}

function onCanvasDrop(e) {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('nodeType');
    if (!nodeType) return;

    const container = document.getElementById('canvasContainer');
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const world = screenToWorld(x, y);
    const nodeId = createNode(nodeType, world.x, world.y);

    // Select the newly created node
    state.selectedNodeId = nodeId;
    state.selectedEdgeId = null;
    renderEdges();
    state.nodes.forEach((_, id) => updateNodeDisplay(id));
    updateInspector();
}

function onCanvasDragOver(e) {
    e.preventDefault();
}

function onNodeItemDragStart(e) {
    const nodeType = e.currentTarget.dataset.nodeType;
    e.dataTransfer.setData('nodeType', nodeType);
}

function onKeyDown(e) {
    // Only allow delete when canvas or nodes are focused, not when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (state.selectedNodeId) {
            deleteNode(state.selectedNodeId);
        } else if (state.selectedEdgeId) {
            deleteEdge(state.selectedEdgeId);
        }
    }
}

function showTooltip(message, x, y) {
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = message;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    document.body.appendChild(tooltip);

    setTimeout(() => tooltip.remove(), 2000);
}

// ============================================================================
// RUN ENGINE
// ============================================================================

function updateRunButton() {
    const runButton = document.getElementById('runButton');
    const hasRunnablePath = checkForRunnablePath();
    runButton.disabled = state.isRunning || state.isOptimizing || state.isRunningModelNode || !hasRunnablePath;
}

function checkForRunnablePath() {
    // Check if there's at least one valid path from Prompt to Model
    for (const edge of state.edges.values()) {
        const sourceNode = state.nodes.get(edge.sourceNodeId);
        const targetNode = state.nodes.get(edge.targetNodeId);

        if (sourceNode?.type === 'prompt' && targetNode?.type === 'model') {
            return true;
        }
    }
    return false;
}

async function runFlow() {
    state.isRunning = true;
    state.currentRunId = Date.now().toString();
    state.runAbortController = new AbortController();

    document.getElementById('runButton').disabled = true;
    document.getElementById('cancelButton').disabled = false;
    document.getElementById('statusChip').textContent = 'Running';
    document.getElementById('statusChip').className = 'status-chip status-running';

    // Disable optimize and model buttons during flow run
    updateOptimizeButtons();
    updateModelButtons();

    addLog('info', 'Flow run started');

    // Reset all node statuses
    state.nodes.forEach((node) => {
        setNodeStatus(node.id, 'idle');
        if (node.type === 'model') {
            node.data.output = '';
            updateNodeDisplay(node.id);
        }
    });

    // Validate: check for empty prompts, missing models, and incomplete optimize nodes
    let hasError = false;
    for (const edge of state.edges.values()) {
        const sourceNode = state.nodes.get(edge.sourceNodeId);
        const targetNode = state.nodes.get(edge.targetNodeId);

        // Validate Prompt nodes
        if (sourceNode?.type === 'prompt') {
            // At least one of system or user prompt must be filled
            const hasSystemPrompt = sourceNode.data.systemPrompt && sourceNode.data.systemPrompt.trim();
            const hasUserPrompt = sourceNode.data.userPrompt && sourceNode.data.userPrompt.trim();

            if (!hasSystemPrompt && !hasUserPrompt) {
                addLog('error', `At least one prompt is required`, sourceNode.id);
                hasError = true;
            }
        }

        // Validate Model nodes
        if (targetNode?.type === 'model') {
            if (!targetNode.data.model || targetNode.data.model.trim() === '') {
                addLog('error', `Model must be selected`, targetNode.id);
                hasError = true;
            }
        }

        // Validate Optimize nodes that will run in the flow
        if (sourceNode?.type === 'model' &&
            targetNode?.type === 'optimize' &&
            edge.sourcePin === 'output' &&
            edge.targetPin === 'input') {

            // Check if Optimize node has required Expected Output
            if (!targetNode.data.expectedOutput || !targetNode.data.expectedOutput.trim()) {
                addLog('error', `Expected Output is required`, targetNode.id);
                hasError = true;
            }

            // Also check if there's a Prompt node in the graph
            let hasPromptNode = false;
            for (const node of state.nodes.values()) {
                if (node.type === 'prompt' && node.data.systemPrompt) {
                    hasPromptNode = true;
                    break;
                }
            }

            if (!hasPromptNode) {
                addLog('error', `Requires a Prompt node with system prompt`, targetNode.id);
                hasError = true;
            }
        }
    }

    if (hasError) {
        state.isRunning = false;
        document.getElementById('runButton').disabled = false;
        document.getElementById('cancelButton').disabled = true;
        document.getElementById('statusChip').textContent = 'Idle';
        document.getElementById('statusChip').className = 'status-chip status-idle';
        updateRunButton();
        updateOptimizeButtons();
        updateModelButtons();
        return;
    }

    // Build execution plan: find all Model nodes and their inputs
    const modelNodesMap = new Map(); // modelNodeId -> { modelNode, userPrompt, systemPrompt }

    for (const edge of state.edges.values()) {
        const targetNode = state.nodes.get(edge.targetNodeId);
        const sourceNode = state.nodes.get(edge.sourceNodeId);

        if (targetNode?.type === 'model') {
            // Initialize model node entry if not exists
            if (!modelNodesMap.has(targetNode.id)) {
                modelNodesMap.set(targetNode.id, {
                    modelNode: targetNode,
                    userPrompt: '',
                    systemPrompt: ''
                });
            }

            const modelData = modelNodesMap.get(targetNode.id);

            // Handle prompt input
            if (edge.targetPin === 'prompt' && sourceNode?.type === 'prompt') {
                modelData.systemPrompt = sourceNode.data.systemPrompt || '';
                modelData.userPrompt = sourceNode.data.userPrompt || '';
            }
        }
    }

    // Build the final execution list
    const modelNodesToRun = [];
    for (const modelData of modelNodesMap.values()) {
        // Combine system and user prompts
        let combinedPrompt = '';
        if (modelData.systemPrompt && modelData.userPrompt) {
            combinedPrompt = `System: ${modelData.systemPrompt}\n\nUser: ${modelData.userPrompt}`;
        } else if (modelData.systemPrompt) {
            combinedPrompt = `System: ${modelData.systemPrompt}`;
        } else if (modelData.userPrompt) {
            combinedPrompt = `User: ${modelData.userPrompt}`;
        }

        if (combinedPrompt) {
            modelNodesToRun.push({
                modelNode: modelData.modelNode,
                promptText: combinedPrompt
            });
        }
    }

    if (modelNodesToRun.length === 0) {
        addLog('error', 'No runnable Prompt → Model path found');
        state.isRunning = false;
        document.getElementById('runButton').disabled = false;
        document.getElementById('cancelButton').disabled = true;
        document.getElementById('statusChip').textContent = 'Idle';
        document.getElementById('statusChip').className = 'status-chip status-idle';
        updateRunButton();
        updateOptimizeButtons();
        updateModelButtons();
        return;
    }

    // Execute sequentially
    for (const { modelNode, promptText } of modelNodesToRun) {
        if (state.runAbortController.signal.aborted) {
            break;
        }

        setNodeStatus(modelNode.id, 'running');
        addLog('info', `Running ${modelNode.data.title}`);

        // Build tools catalog for this model
        const registeredTools = findRegisteredTools(modelNode.id, state.edges, state.nodes);
        const toolsCatalog = buildToolsCatalog(registeredTools);

        const startTime = Date.now();

        try {
            const result = await callModelStreaming(
                promptText,
                modelNode.data.model,
                modelNode.data.temperature,
                modelNode.data.maxTokens,
                (chunk) => {
                    modelNode.data.output += chunk;
                    updateNodeDisplay(modelNode.id);
                    if (state.selectedNodeId === modelNode.id) {
                        const outputEl = document.getElementById('inspectorOutput');
                        if (outputEl) {
                            outputEl.value = modelNode.data.output;
                        }
                    }
                },
                state.runAbortController.signal,
                toolsCatalog.length > 0 ? toolsCatalog : null,
                modelNode.data.provider || 'ollama'
            );

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            setNodeStatus(modelNode.id, 'success');
            addLog('info', `${modelNode.data.title} completed in ${duration}s`);

            // Update connected Optimize nodes to enable their Run buttons
            for (const edge of state.edges.values()) {
                if (edge.sourceNodeId === modelNode.id && edge.sourcePin === 'output') {
                    const targetNode = state.nodes.get(edge.targetNodeId);
                    if (targetNode?.type === 'optimize') {
                        updateNodeDisplay(targetNode.id);
                        // Also update inspector if this Optimize node is selected
                        if (state.selectedNodeId === targetNode.id) {
                            updateInspector();
                        }
                    }
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                updateNodeDisplay(modelNode.id);
                addLog('warn', 'Flow run canceled');
                break;
            } else {
                updateNodeDisplay(modelNode.id);
                addLog('error', `Error: ${error.message}`, modelNode.id);
            }
        }
    }

    // Run Optimize nodes that are connected to Model outputs
    const optimizeNodesToRun = findOptimizeNodesToRun(state.edges, state.nodes);

    for (const optimizeNode of optimizeNodesToRun) {
        if (state.runAbortController.signal.aborted) break;

        addLog('info', `Running ${optimizeNode.data.title}`);

        try {
            await executeEvolutionaryOptimizeNode(
                optimizeNode,
                state.edges,
                state.nodes,
                callModelStreaming,
                updateNodeDisplay,
                setNodeStatus,
                addLog,
                state.runAbortController.signal
            );
        } catch (error) {
            if (error.name === 'AbortError') {
                addLog('warn', 'Optimization canceled');
                break;
            } else {
                addLog('error', `Optimize error: ${error.message}`);
            }
        }

        // Update inspector if this optimize node is selected
        if (state.selectedNodeId === optimizeNode.id) {
            updateInspector();
        }
    }

    if (!state.runAbortController.signal.aborted) {
        addLog('info', 'Flow run completed');
    }

    state.isRunning = false;
    state.runAbortController = null;
    document.getElementById('runButton').disabled = false;
    document.getElementById('cancelButton').disabled = true;
    document.getElementById('statusChip').textContent = 'Idle';
    document.getElementById('statusChip').className = 'status-chip status-idle';
    updateRunButton();

    // Re-enable optimize and model buttons
    updateOptimizeButtons();
    updateModelButtons();
}

function cancelRun() {
    if (state.runAbortController) {
        state.runAbortController.abort();
    }
    if (state.optimizationAbortController) {
        state.optimizationAbortController.abort();
    }
    if (state.modelRunAbortController) {
        state.modelRunAbortController.abort();
    }
}

/**
 * Find Optimize nodes connected to Model outputs
 */
function findOptimizeNodesToRun(edges, nodes) {
    const optimizeNodes = [];

    for (const edge of edges.values()) {
        const sourceNode = nodes.get(edge.sourceNodeId);
        const targetNode = nodes.get(edge.targetNodeId);

        // Find Model → Optimize connections
        if (sourceNode?.type === 'model' &&
            targetNode?.type === 'optimize' &&
            edge.sourcePin === 'output' &&
            edge.targetPin === 'input') {
            optimizeNodes.push(targetNode);
        }
    }

    return optimizeNodes;
}

/**
 * Run a single Optimize node
 */
async function runOptimizeNode(nodeId) {
    const optimizeNode = state.nodes.get(nodeId);
    if (!optimizeNode || optimizeNode.type !== 'optimize') return;

    // Disable run buttons
    state.isOptimizing = true;
    updateOptimizeButtons();
    updateModelButtons();
    updateRunButton();

    // Enable cancel button
    document.getElementById('cancelButton').disabled = false;

    // Create abort controller
    state.optimizationAbortController = new AbortController();

    try {
        await executeEvolutionaryOptimizeNode(
            optimizeNode,
            state.edges,
            state.nodes,
            callModelStreaming,
            updateNodeDisplay,
            setNodeStatus,
            addLog,
            state.optimizationAbortController.signal
        );
    } finally {
        // Re-enable run buttons
        state.isOptimizing = false;
        state.optimizationAbortController = null;
        updateOptimizeButtons();
        updateModelButtons();
        updateRunButton();

        // Disable cancel if nothing is running
        if (!state.isRunning) {
            document.getElementById('cancelButton').disabled = true;
        }

        // Update inspector if this node is selected
        if (state.selectedNodeId === nodeId) {
            updateInspector();
        }
    }
}

/**
 * Run a single Model node independently
 */
async function runModelNode(nodeId) {
    const modelNode = state.nodes.get(nodeId);
    if (!modelNode || modelNode.type !== 'model') return;

    // Find connected Prompt node
    let promptNode = null;
    for (const edge of state.edges.values()) {
        if (edge.targetNodeId === nodeId && edge.targetPin === 'prompt') {
            const sourceNode = state.nodes.get(edge.sourceNodeId);
            if (sourceNode?.type === 'prompt') {
                promptNode = sourceNode;
                break;
            }
        }
    }

    // Validate prompt node
    if (!promptNode) {
        addLog('error', `Not connected to a Prompt node`, modelNode.id);
        return;
    }

    const hasSystemPrompt = promptNode.data.systemPrompt && promptNode.data.systemPrompt.trim();
    const hasUserPrompt = promptNode.data.userPrompt && promptNode.data.userPrompt.trim();

    if (!hasSystemPrompt && !hasUserPrompt) {
        addLog('error', `At least one prompt is required`, promptNode.id);
        return;
    }

    // Validate model selection
    if (!modelNode.data.model || modelNode.data.model.trim() === '') {
        addLog('error', `Model must be selected`, modelNode.id);
        return;
    }

    // Disable run buttons
    state.isRunningModelNode = true;
    updateModelButtons();
    updateOptimizeButtons();
    updateRunButton();

    // Enable cancel button
    document.getElementById('cancelButton').disabled = false;

    // Create abort controller
    state.modelRunAbortController = new AbortController();

    // Reset model output
    modelNode.data.output = '';
    setNodeStatus(modelNode.id, 'running');

    try {
        // Combine prompts
        let combinedPrompt = '';
        if (hasSystemPrompt && hasUserPrompt) {
            combinedPrompt = `System: ${promptNode.data.systemPrompt}\n\nUser: ${promptNode.data.userPrompt}`;
        } else if (hasSystemPrompt) {
            combinedPrompt = `System: ${promptNode.data.systemPrompt}`;
        } else if (hasUserPrompt) {
            combinedPrompt = `User: ${promptNode.data.userPrompt}`;
        }

        addLog('info', `Running ${modelNode.data.title}`);

        // Build tools catalog for this model
        const registeredTools = findRegisteredTools(modelNode.id, state.edges, state.nodes);
        const toolsCatalog = buildToolsCatalog(registeredTools);

        const startTime = Date.now();

        await callModelStreaming(
            combinedPrompt,
            modelNode.data.model,
            modelNode.data.temperature,
            modelNode.data.maxTokens,
            (chunk) => {
                modelNode.data.output += chunk;
                updateNodeDisplay(modelNode.id);
                if (state.selectedNodeId === modelNode.id) {
                    const outputEl = document.getElementById('inspectorOutput');
                    if (outputEl) {
                        outputEl.value = modelNode.data.output;
                    }
                }
            },
            state.modelRunAbortController.signal,
            toolsCatalog.length > 0 ? toolsCatalog : null,
            modelNode.data.provider || 'ollama'
        );

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        setNodeStatus(modelNode.id, 'success');
        addLog('info', `${modelNode.data.title} completed in ${duration}s`);
    } catch (error) {
        if (error.name === 'AbortError') {
            setNodeStatus(modelNode.id, 'error');
            updateNodeDisplay(modelNode.id);
            addLog('warn', `Run canceled`, modelNode.id);
        } else {
            updateNodeDisplay(modelNode.id);
            addLog('error', `Error: ${error.message}`, modelNode.id);
        }
    } finally {
        // Re-enable run buttons
        state.isRunningModelNode = false;
        state.modelRunAbortController = null;
        updateModelButtons();
        updateOptimizeButtons();
        updateRunButton();

        // Disable cancel if nothing is running
        if (!state.isRunning && !state.isOptimizing) {
            document.getElementById('cancelButton').disabled = true;
        }

        // Update inspector if this node is selected
        if (state.selectedNodeId === nodeId) {
            updateInspector();
        }
    }
}

/**
 * Update Optimize node button states
 */
function updateOptimizeButtons() {
    const disabled = state.isRunning || state.isOptimizing || state.isRunningModelNode;

    // Update inspector button if Optimize node is selected
    const inspectorBtn = document.getElementById('inspectorRunOptimize');
    if (inspectorBtn) {
        inspectorBtn.disabled = disabled;
        inspectorBtn.style.background = disabled ? '#6c757d' : '#4a9eff';
        inspectorBtn.style.opacity = disabled ? '0.6' : '1';
        inspectorBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    }
}

/**
 * Update Model node button states
 */
function updateModelButtons() {
    const disabled = state.isRunning || state.isOptimizing || state.isRunningModelNode;

    // Update inspector button if Model node is selected
    const inspectorBtn = document.getElementById('inspectorRunModel');
    if (inspectorBtn) {
        inspectorBtn.disabled = disabled;
        inspectorBtn.style.background = disabled ? '#6c757d' : '#4a9eff';
        inspectorBtn.style.opacity = disabled ? '0.6' : '1';
        inspectorBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    }
}

async function callModelStreaming(prompt, model, temperature, maxTokens, onChunk, signal, toolsCatalog = null, provider = 'ollama') {
    // Get adapter from provider registry
    const adapter = await providerRegistry.getAdapter(provider);

    if (!adapter) {
        throw new Error(`Provider "${provider}" not found or not configured`);
    }

    const settings = { model, temperature, maxTokens };

    // Session state for multi-turn conversations
    const sessionState = { messages: [] };

    // Tool-calling loop
    let iterationCount = 0;
    const maxIterations = 10; // Prevent infinite loops

    while (iterationCount < maxIterations) {
        iterationCount++;

        // Prepare request
        const preparedRequest = adapter.prepareRequest({
            prompt,
            toolsCatalog,
            settings,
            sessionState
        });

        // Build request based on provider
        let url, headers;

        if (provider === 'ollama') {
            url = preparedRequest.useChat
                ? 'http://localhost:11434/api/chat'
                : 'http://localhost:11434/api/generate';
            headers = { 'Content-Type': 'application/json' };
        } else if (provider === 'openai') {
            url = 'https://api.openai.com/v1/chat/completions';
            const apiKey = await providerRegistry.getApiKey('openai');

            if (!apiKey) {
                throw new Error('OpenAI API key not configured');
            }

            headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            };
        } else {
            throw new Error(`Unsupported provider: ${provider}`);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(preparedRequest.body),
            signal
        });

        if (!response.ok) {
            let errorMessage = `${provider} request failed: ${response.status}`;
            try {
                const errorText = await response.text();
                if (errorText) {
                    errorMessage += ` - ${errorText}`;
                }
            } catch (e) {
                // Ignore parsing errors
            }
            addLog('error', `provider_auth_error: ${provider}`);
            throw new Error(errorMessage);
        }

        // Stream response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const chunkState = {};
        let pendingToolCalls = [];
        let accumulatedContent = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);

            try {
                const parsed = adapter.parseChunk(chunk, chunkState);

                if (parsed.textDelta) {
                    accumulatedContent += parsed.textDelta;
                    onChunk(parsed.textDelta);
                }

                if (parsed.toolCalls) {
                    pendingToolCalls.push(...parsed.toolCalls);
                }
            } catch (error) {
                addLog('error', `adapter_parse_error: ${error.message}`);
            }
        }

        // After streaming, save the assistant's message to conversation history
        // This must happen BEFORE we process tool calls
        if (pendingToolCalls.length > 0 || accumulatedContent) {
            // Prepare tool_calls array for the message
            // Include all fields (id, type) for OpenAI compatibility
            const toolCallsForMessage = pendingToolCalls.map(tc => {
                const toolCallMsg = {
                    function: {
                        name: tc.name,
                        arguments: tc.arguments
                    }
                };

                // Include OpenAI-specific fields if present
                if (tc.id) {
                    toolCallMsg.id = tc.id;
                }
                if (tc.type) {
                    toolCallMsg.type = tc.type;
                }

                return toolCallMsg;
            });

            const assistantMessage = {
                role: 'assistant',
                content: accumulatedContent || ''
            };

            // Only add tool_calls if there are any
            if (toolCallsForMessage.length > 0) {
                assistantMessage.tool_calls = toolCallsForMessage;
            }

            sessionState.messages.push(assistantMessage);
        }

        // If no tool calls, we're done
        if (pendingToolCalls.length === 0) {
            break;
        }

        // Log detected tool calls
        addLog('info', `Calling tool${pendingToolCalls.length > 1 ? 's' : ''}: ${pendingToolCalls.map(tc => tc.name).join(', ')}`);

        // Execute tool calls
        let hasToolError = false;

        for (const toolCall of pendingToolCalls) {
            const { name, arguments: args, id, type } = toolCall;

            // Find the tool node
            const toolNode = Array.from(state.nodes.values()).find(
                n => n.type === 'tool' && n.data.name === name
            );

            if (!toolNode) {
                addLog('error', `Tool "${name}" not found`);
                hasToolError = true;
                break;
            }

            // Validate arguments against schema
            const validationError = validateToolArguments(args, toolNode.data.parametersSchema);
            if (validationError) {
                addLog('error', `${name}: ${validationError}`, toolNode.id);
                hasToolError = true;
                break;
            }

            // Execute tool
            const startTime = Date.now();

            try {
                const normalized = await executeToolInWorker({
                    code: toolNode.data.implementation.code,
                    args,
                    addLog,
                    signal
                });

                const duration = ((Date.now() - startTime) / 1000).toFixed(2);

                if (normalized.ok) {
                    if (normalized.kind === 'bytes') {
                        addLog('info', `${name} completed in ${duration}s (${normalized.result.length} bytes)`);
                    } else {
                        addLog('info', `${name} completed in ${duration}s`);
                    }
                } else {
                    addLog('error', `${name}: ${normalized.error.message}`, toolNode.id);
                    hasToolError = true;
                    break;
                }

                // Continue with tool result
                adapter.continueWithToolResult(sessionState, {
                    name,
                    arguments: args,
                    normalized,
                    id,  // For OpenAI compatibility
                    type // For OpenAI compatibility
                });
            } catch (error) {
                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                addLog('error', `${name}: ${error.message} (${duration}s)`, toolNode.id);
                hasToolError = true;
                break;
            }
        }

        // If tool execution failed, stop and mark model as error
        if (hasToolError) {
            throw new Error('Tool execution failed');
        }

        // Continue to next iteration with tool results
    }

    if (iterationCount >= maxIterations) {
        addLog('warn', 'Tool-calling loop exceeded maximum iterations');
    }
}

/**
 * Validate tool arguments against schema
 */
function validateToolArguments(args, schema) {
    if (!schema || !schema.properties) {
        return 'Invalid schema';
    }

    // Check required fields
    if (schema.required && Array.isArray(schema.required)) {
        for (const field of schema.required) {
            if (!(field in args)) {
                return `Missing required field: ${field}`;
            }
        }
    }

    // Check types
    for (const [key, value] of Object.entries(args)) {
        const propSchema = schema.properties[key];
        if (!propSchema) continue;

        const actualType = typeof value;
        const expectedType = propSchema.type;

        if (expectedType === 'string' && actualType !== 'string') {
            return `Field ${key} must be a string`;
        }
        if (expectedType === 'number' && actualType !== 'number') {
            return `Field ${key} must be a number`;
        }
        if (expectedType === 'boolean' && actualType !== 'boolean') {
            return `Field ${key} must be a boolean`;
        }
    }

    return null;
}

// ============================================================================
// MODELS LOADING
// ============================================================================

async function loadModels() {
    try {
        const models = await listModels();
        state.availableModels = models;

        if (models.length === 0) {
            addLog('warn', 'No local models found');
        }
    } catch (err) {
        addLog('error', `Failed to load models: ${err.message}`);
        state.availableModels = [];
    }
}

// ============================================================================
// SETTINGS MODAL
// ============================================================================

const { providerRegistry } = require('../services/providerRegistry');

async function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    modal.style.display = 'flex';

    // Load current OpenAI settings
    const apiKey = await providerRegistry.getApiKey('openai');

    document.getElementById('openaiApiKey').value = apiKey || '';

    // Update status
    await updateOpenAIStatus();
}

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    modal.style.display = 'none';
}

async function updateOpenAIStatus() {
    const statusEl = document.getElementById('openaiStatus');
    const isConfigured = await providerRegistry.isProviderConfigured('openai');

    if (isConfigured) {
        statusEl.textContent = 'Configured';
        statusEl.className = 'provider-status provider-status-active';
    } else {
        statusEl.textContent = 'Not configured';
        statusEl.className = 'provider-status';
    }
}

async function saveOpenAISettings() {
    const apiKey = document.getElementById('openaiApiKey').value.trim();

    if (!apiKey) {
        alert('Please enter an API key');
        return;
    }

    try {
        await providerRegistry.setApiKey('openai', apiKey);
        await updateOpenAIStatus();

        // Try to fetch models to validate the key
        const models = await providerRegistry.listModels('openai');
        addLog('info', `OpenAI configured with ${models.length} models`);

        // Refresh models in state if a model node is using OpenAI
        for (const node of state.nodes.values()) {
            if (node.type === 'model' && node.data.provider === 'openai') {
                updateInspector();
                break;
            }
        }
    } catch (error) {
        addLog('error', `provider_auth_error: openai - ${error.message}`);
        alert(`Failed to validate OpenAI API key: ${error.message}`);
    }
}

async function removeOpenAISettings() {
    if (confirm('Are you sure you want to remove the OpenAI API key?')) {
        await providerRegistry.removeApiKey('openai');
        document.getElementById('openaiApiKey').value = '';
        await updateOpenAIStatus();
        addLog('info', 'OpenAI API key removed');
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async function() {
    // Set up tool node helpers
    setGetAllToolNodes(() => {
        return Array.from(state.nodes.values()).filter(n => n.type === 'tool');
    });

    // Load models
    await loadModels();

    // Canvas event listeners
    const container = document.getElementById('canvasContainer');
    container.addEventListener('mousedown', onCanvasMouseDown);
    container.addEventListener('mousemove', onCanvasMouseMove);
    container.addEventListener('mouseup', onCanvasMouseUp);
    container.addEventListener('wheel', onCanvasWheel);
    container.addEventListener('drop', onCanvasDrop);
    container.addEventListener('dragover', onCanvasDragOver);

    // Set cursor
    container.style.cursor = 'default';

    // Node item drag
    const nodeItems = document.querySelectorAll('.node-item');
    nodeItems.forEach(item => {
        item.addEventListener('dragstart', onNodeItemDragStart);
    });

    // Search
    const nodeSearch = document.getElementById('nodeSearch');
    nodeSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        nodeItems.forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(query) ? 'block' : 'none';
        });
    });

    // Run button
    document.getElementById('runButton').addEventListener('click', runFlow);
    document.getElementById('cancelButton').addEventListener('click', cancelRun);

    // Settings button
    document.getElementById('settingsButton').addEventListener('click', openSettingsModal);
    document.getElementById('closeSettingsButton').addEventListener('click', closeSettingsModal);
    document.getElementById('saveOpenaiButton').addEventListener('click', saveOpenAISettings);
    document.getElementById('removeOpenaiButton').addEventListener('click', removeOpenAISettings);

    // Close modal when clicking outside
    document.getElementById('settingsModal').addEventListener('click', (e) => {
        if (e.target.id === 'settingsModal') {
            closeSettingsModal();
        }
    });

    // Logs filter
    document.getElementById('logsFilter').addEventListener('change', (e) => {
        state.logsFilter = e.target.value;
        updateLogsUI();
    });

    // Collapse/expand logs button
    document.getElementById('collapseLogsButton').addEventListener('click', () => {
        const logsPanel = document.getElementById('logsPanel');
        const collapseButton = document.getElementById('collapseLogsButton');
        state.logsCollapsed = !state.logsCollapsed;

        if (state.logsCollapsed) {
            // Store current height before collapsing
            state.logsExpandedHeight = logsPanel.offsetHeight;
            // Explicitly set height to collapsed state
            logsPanel.style.height = '36px';
            logsPanel.classList.add('collapsed');
            collapseButton.textContent = '+';
            collapseButton.title = 'Expand';
        } else {
            // Restore to previous height
            logsPanel.style.height = `${state.logsExpandedHeight}px`;
            logsPanel.classList.remove('collapsed');
            collapseButton.textContent = '−';
            collapseButton.title = 'Collapse';

            // Scroll to bottom when expanding
            const logsBody = document.getElementById('logsBody');
            logsBody.scrollTop = logsBody.scrollHeight;
        }
    });

    // Keyboard
    document.addEventListener('keydown', onKeyDown);

    // Inspector panel resize
    setupInspectorResize();

    // Logs panel resize
    setupLogsResize();

    // Initial render
    renderGrid();
    updateInspector();
    updateRunButton();
    updateLogsUI();

    // Handle resize
    window.addEventListener('resize', () => {
        renderAll();
    });
});

// ============================================================================
// INSPECTOR RESIZE
// ============================================================================

function setupInspectorResize() {
    const rightPanel = document.getElementById('rightPanel');
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    rightPanel.addEventListener('mousedown', (e) => {
        const rect = rightPanel.getBoundingClientRect();
        const edgeThreshold = 4;

        // Check if mouse is near the left edge
        if (e.clientX >= rect.left && e.clientX <= rect.left + edgeThreshold) {
            isResizing = true;
            startX = e.clientX;
            startWidth = rect.width;
            rightPanel.classList.add('resizing');
            document.body.style.cursor = 'ew-resize';
            e.preventDefault();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const deltaX = startX - e.clientX; // Note: reversed because we're dragging left edge
        const newWidth = startWidth + deltaX;

        // Clamp between min and max width
        const minWidth = 280;
        const maxWidth = 600;
        const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

        rightPanel.style.width = `${clampedWidth}px`;
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            rightPanel.classList.remove('resizing');
            document.body.style.cursor = '';
        }
    });
}

// ============================================================================
// LOGS RESIZE
// ============================================================================

function setupLogsResize() {
    const logsPanel = document.getElementById('logsPanel');
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    logsPanel.addEventListener('mousedown', (e) => {
        // Don't allow resize when collapsed
        if (state.logsCollapsed) return;

        const rect = logsPanel.getBoundingClientRect();
        const edgeThreshold = 4;

        // Check if mouse is near the top edge
        if (e.clientY >= rect.top && e.clientY <= rect.top + edgeThreshold) {
            isResizing = true;
            startY = e.clientY;
            startHeight = logsPanel.offsetHeight;
            logsPanel.classList.add('resizing');
            document.body.style.cursor = 'ns-resize';
            e.preventDefault();
            e.stopPropagation();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const deltaY = startY - e.clientY; // Note: reversed because we're dragging top edge
        const newHeight = startHeight + deltaY;

        // Calculate max height based on inspector header bottom edge
        const inspectorHeader = document.querySelector('.inspector-container .panel-header');
        const logsPanelRect = logsPanel.getBoundingClientRect();
        const inspectorHeaderRect = inspectorHeader.getBoundingClientRect();

        // Max height for logs panel: distance from inspector header bottom to logs panel bottom
        const maxHeight = logsPanelRect.bottom - inspectorHeaderRect.bottom;

        // Clamp between min and max height (min is header height: 36px)
        const minHeight = 36;
        const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

        logsPanel.style.height = `${clampedHeight}px`;
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            logsPanel.classList.remove('resizing');
            document.body.style.cursor = '';
            // Save the resized height so collapse/expand remembers it
            state.logsExpandedHeight = logsPanel.offsetHeight;
        }
    });
}
