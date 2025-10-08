/**
 * Prompt Goat - Flow UI MVP
 * Complete implementation with nodes, wiring, inspector, logs, and run engine
 */

const { listModels } = require('../services/modelService');

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

    // Logs
    logs: [],
    logsCollapsed: false,
    logsFilter: 'all',

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

function addLog(level, message) {
    const log = {
        timestamp: formatTimestamp(),
        level,
        message,
        runId: state.currentRunId
    };
    state.logs.push(log);
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

    if (!state.logsCollapsed) {
        logsBody.style.display = 'block';
    }

    logsBody.innerHTML = filteredLogs.map(log => {
        const levelClass = `log-level-${log.level}`;
        return `
            <div class="log-entry ${levelClass}">
                <span class="log-timestamp">${log.timestamp}</span>
                <span class="log-level">${log.level.toUpperCase()}</span>
                <span class="log-message">${log.message}</span>
            </div>
        `;
    }).join('');

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
        data: {}
    };

    if (type === 'prompt') {
        node.data = {
            title: 'Prompt',
            promptText: ''
        };
    } else if (type === 'model') {
        node.data = {
            title: 'Model',
            model: state.availableModels[0] || '',
            temperature: 0.7,
            maxTokens: 512,
            output: ''
        };
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

function renderNode(id) {
    const node = state.nodes.get(id);
    if (!node) return;

    const nodesLayer = document.getElementById('nodesLayer');
    let nodeEl = document.getElementById(id);

    if (!nodeEl) {
        nodeEl = document.createElement('div');
        nodeEl.id = id;
        nodeEl.className = 'flow-node';
        nodeEl.dataset.nodeType = node.type;
        nodesLayer.appendChild(nodeEl);
    }

    // Position and size
    const { x: screenX, y: screenY } = worldToScreen(node.x, node.y);
    nodeEl.style.left = `${screenX}px`;
    nodeEl.style.top = `${screenY}px`;
    nodeEl.style.width = `${node.width}px`;
    nodeEl.style.height = 'auto'; // Let content dictate height
    nodeEl.style.transform = `scale(${state.viewport.scale})`;

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
                        <span class="pin-label">text</span>
                        <div class="pin pin-output" data-pin="text"></div>
                    </div>
                </div>
            </div>
            <div class="node-body">
                <div class="node-prompt-display">${node.data.promptText || '(empty)'}</div>
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
                </div>
            </div>
            <div class="node-body">
                <div class="node-settings">
                    <div class="setting-line">Model: ${node.data.model || 'None'}</div>
                    <div class="setting-line">Temperature: ${node.data.temperature}</div>
                    <div class="setting-line">Max Tokens: ${node.data.maxTokens}</div>
                </div>
                <div class="node-output-viewer">${node.data.output || '(no output)'}</div>
            </div>
        `;
    }

    // Add event listeners
    nodeEl.addEventListener('mousedown', onNodeMouseDown);
    nodeEl.addEventListener('click', onNodeClick);

    // Pin listeners
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
    renderEdges();
    updateRunButton();
    return id;
}

function deleteEdge(id) {
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

    // Only allow: Prompt.text (output) -> Model.prompt (input)
    if (sourceNode.type === 'prompt' && sourcePin === 'text' &&
        targetNode.type === 'model' && targetPin === 'prompt') {
        return true;
    }

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
                <label>Prompt Text</label>
                <textarea id="inspectorPromptText" class="inspector-textarea" rows="10">${node.data.promptText}</textarea>
            </div>
        `;

        document.getElementById('inspectorTitle').addEventListener('input', (e) => {
            node.data.title = e.target.value;
            updateNodeDisplay(node.id);
        });

        document.getElementById('inspectorPromptText').addEventListener('input', (e) => {
            node.data.promptText = e.target.value;
            updateNodeDisplay(node.id);
        });
    } else if (node.type === 'model') {
        const modelOptions = state.availableModels.map(m =>
            `<option value="${m}" ${m === node.data.model ? 'selected' : ''}>${m}</option>`
        ).join('');

        inspectorContent.innerHTML = `
            <div class="inspector-section">
                <label>Title</label>
                <input type="text" id="inspectorTitle" class="inspector-input" value="${node.data.title}">
            </div>
            <div class="inspector-section">
                <label>Model</label>
                <select id="inspectorModel" class="inspector-input">
                    ${modelOptions}
                </select>
                <button id="retryModelsButton" class="retry-button" style="display: ${state.availableModels.length === 0 ? 'block' : 'none'};">Retry</button>
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
                <label>Output (Read-only)</label>
                <textarea id="inspectorOutput" class="inspector-textarea" rows="10" readonly>${node.data.output}</textarea>
            </div>
        `;

        document.getElementById('inspectorTitle').addEventListener('input', (e) => {
            node.data.title = e.target.value;
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

        const retryButton = document.getElementById('retryModelsButton');
        if (retryButton) {
            retryButton.addEventListener('click', async () => {
                await loadModels();
                updateInspector();
            });
        }
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
        updateInspector();
        renderEdges();

        if (state.nodes.size > 0) {
            state.isPanning = true;
            state.panStartX = e.clientX;
            state.panStartY = e.clientY;
            container.style.cursor = 'grabbing';
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
            } else {
                showTooltip('Incompatible pins', e.clientX, e.clientY);
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

    state.isDraggingNode = true;
    state.draggedNodeId = nodeId;
    state.dragOffsetX = world.x - node.x;
    state.dragOffsetY = world.y - node.y;
}

function onNodeClick(e) {
    e.stopPropagation();
    const nodeId = e.currentTarget.id;
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
    createNode(nodeType, world.x, world.y);
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
    runButton.disabled = state.isRunning || !hasRunnablePath;
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

    addLog('info', 'run_started');

    // Reset all node statuses
    state.nodes.forEach((node) => {
        setNodeStatus(node.id, 'idle');
        if (node.type === 'model') {
            node.data.output = '';
            updateNodeDisplay(node.id);
        }
    });

    // Validate: check for empty prompts and missing models
    let hasError = false;
    for (const edge of state.edges.values()) {
        const promptNode = state.nodes.get(edge.sourceNodeId);
        if (promptNode?.type === 'prompt') {
            if (!promptNode.data.promptText.trim()) {
                addLog('error', `Prompt text is required for node ${promptNode.data.title}`);
                setNodeStatus(promptNode.id, 'error');
                hasError = true;
            }
        }

        const modelNode = state.nodes.get(edge.targetNodeId);
        if (modelNode?.type === 'model') {
            if (!modelNode.data.model || modelNode.data.model.trim() === '') {
                addLog('error', `Model must be selected for node ${modelNode.data.title} (${modelNode.id})`);
                setNodeStatus(modelNode.id, 'error');
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
        return;
    }

    // Build execution plan: find all Model nodes with incoming edges
    const modelNodesToRun = [];
    for (const edge of state.edges.values()) {
        const targetNode = state.nodes.get(edge.targetNodeId);
        if (targetNode?.type === 'model') {
            const sourceNode = state.nodes.get(edge.sourceNodeId);
            if (sourceNode?.type === 'prompt') {
                modelNodesToRun.push({
                    modelNode: targetNode,
                    promptText: sourceNode.data.promptText
                });
            }
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
        return;
    }

    // Execute sequentially
    for (const { modelNode, promptText } of modelNodesToRun) {
        if (state.runAbortController.signal.aborted) {
            break;
        }

        setNodeStatus(modelNode.id, 'running');
        addLog('info', `node_started: ${modelNode.data.title} (${modelNode.id})`);

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
                state.runAbortController.signal
            );

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            setNodeStatus(modelNode.id, 'success');
            addLog('info', `node_completed: ${modelNode.data.title} (${modelNode.id}) in ${duration}s`);
        } catch (error) {
            if (error.name === 'AbortError') {
                setNodeStatus(modelNode.id, 'error');
                modelNode.data.output = 'Canceled by user';
                updateNodeDisplay(modelNode.id);
                addLog('warn', 'run_canceled');
                break;
            } else {
                setNodeStatus(modelNode.id, 'error');
                modelNode.data.output = `Error: ${error.message}`;
                updateNodeDisplay(modelNode.id);
                addLog('error', `node_error: ${modelNode.data.title} (${modelNode.id}) - ${error.message}`);
            }
        }
    }

    if (!state.runAbortController.signal.aborted) {
        addLog('info', 'run_completed');
    }

    state.isRunning = false;
    state.runAbortController = null;
    document.getElementById('runButton').disabled = false;
    document.getElementById('cancelButton').disabled = true;
    document.getElementById('statusChip').textContent = 'Idle';
    document.getElementById('statusChip').className = 'status-chip status-idle';
    updateRunButton();
}

function cancelRun() {
    if (state.runAbortController) {
        state.runAbortController.abort();
    }
}

async function callModelStreaming(prompt, model, temperature, maxTokens, onChunk, signal) {
    const url = 'http://localhost:11434/api/generate';
    const body = {
        model,
        prompt,
        stream: true,
        options: {
            temperature,
            num_predict: maxTokens
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
    });

    if (!response.ok) {
        let errorMessage = `Ollama request failed: ${response.status}`;
        try {
            const errorText = await response.text();
            if (errorText) {
                errorMessage += ` - ${errorText}`;
            }
        } catch (e) {
            // Ignore parsing errors
        }
        throw new Error(errorMessage);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.trim());

        for (const line of lines) {
            try {
                const data = JSON.parse(line);
                if (data.response) {
                    onChunk(data.response);
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
    }
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
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async function() {
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

    // Logs collapse
    document.getElementById('logsCollapseButton').addEventListener('click', () => {
        const logsBody = document.getElementById('logsBody');
        const button = document.getElementById('logsCollapseButton');
        state.logsCollapsed = !state.logsCollapsed;

        if (state.logsCollapsed) {
            logsBody.style.display = 'none';
            button.textContent = 'Expand';
        } else {
            logsBody.style.display = 'block';
            button.textContent = 'Collapse';
        }
    });

    // Logs filter
    document.getElementById('logsFilter').addEventListener('change', (e) => {
        state.logsFilter = e.target.value;
        updateLogsUI();
    });

    // Keyboard
    document.addEventListener('keydown', onKeyDown);

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
