/**
 * Tool (Callable) Node Helper
 * Handles Tool node creation, rendering, validation, and registration
 */

/**
 * Default file-reader implementation
 */
const DEFAULT_TOOL_CODE = `// Read UTF-8 text from a local file path
const fs = require('fs');

function readTextFile(args) {
    try {
        const content = fs.readFileSync(args.path, 'utf-8');
        return content; // Return string directly
    } catch (error) {
        throw new Error(\`Failed to read file: \${error.message}\`);
    }
}

// Execute the tool
return readTextFile(args);
`;

/**
 * Initialize tool node data structure
 */
function createToolNodeData() {
    return {
        name: 'read_text_file',
        description: 'Read UTF-8 text from a local file path.',
        parametersSchema: {
            type: 'object',
            properties: {
                path: { type: 'string' }
            },
            required: ['path']
        },
        implementation: {
            type: 'script',
            language: 'javascript',
            code: DEFAULT_TOOL_CODE
        }
    };
}

/**
 * Render tool node HTML
 */
function renderToolNode(node, connectedModels) {
    const connectedCount = connectedModels.length;

    return `
        <div class="node-header">
            <div class="header-top">
                <span class="node-title">${node.data.name}</span>
                <span class="node-status-badge">${node.status}</span>
            </div>
            <div class="header-bottom">
                <span class="node-badge">callable</span>
                <div class="pin-spacer"></div>
                <div class="pin-container pin-output-container">
                    <span class="pin-label">register</span>
                    <div class="pin pin-output" data-pin="register"></div>
                </div>
            </div>
        </div>
        <div class="node-body">
            <div class="node-description">${node.data.description || 'No description'}</div>
            <div class="node-info">Registered to: ${connectedCount} Model${connectedCount !== 1 ? 's' : ''}</div>
        </div>
    `;
}

/**
 * Render tool node inspector UI
 */
function renderToolInspector(node, updateNodeDisplay, addLog) {
    const paramsJson = JSON.stringify(node.data.parametersSchema, null, 2);

    const html = `
        <div class="inspector-section">
            <label>Name</label>
            <input type="text" id="inspectorToolName" class="inspector-input" value="${node.data.name}">
        </div>
        <div class="inspector-section">
            <label>Description</label>
            <textarea id="inspectorToolDescription" class="inspector-textarea" rows="3">${node.data.description}</textarea>
        </div>
        <div class="inspector-section">
            <label>Parameters Schema (JSON)</label>
            <textarea id="inspectorToolParams" class="inspector-textarea" rows="8">${paramsJson}</textarea>
            <div class="inspector-hint">Fixed schema with required "path" string parameter</div>
        </div>
        <div class="inspector-section">
            <label>Implementation (JavaScript)</label>
            <textarea id="inspectorToolCode" class="inspector-textarea code-editor" rows="15">${node.data.implementation.code}</textarea>
        </div>
        <div class="inspector-section">
            <button id="validateToolButton" class="validate-button">Validate</button>
        </div>
    `;

    return {
        html,
        setupListeners: () => {
            document.getElementById('inspectorToolName').addEventListener('input', (e) => {
                node.data.name = e.target.value;
                updateNodeDisplay(node.id);
            });

            document.getElementById('inspectorToolDescription').addEventListener('input', (e) => {
                node.data.description = e.target.value;
                updateNodeDisplay(node.id);
            });

            document.getElementById('inspectorToolParams').addEventListener('input', (e) => {
                try {
                    node.data.parametersSchema = JSON.parse(e.target.value);
                } catch (err) {
                    // Keep the old value if JSON is invalid
                }
            });

            document.getElementById('inspectorToolCode').addEventListener('input', (e) => {
                node.data.implementation.code = e.target.value;
            });

            document.getElementById('validateToolButton').addEventListener('click', () => {
                validateTool(node, addLog, getAllToolNodes);
            });
        }
    };
}

/**
 * Get all tool nodes from state (injected function reference)
 */
let getAllToolNodes = null;

function setGetAllToolNodes(fn) {
    getAllToolNodes = fn;
}

/**
 * Validate tool node
 */
function validateTool(node, addLog, getAllToolNodesFn) {
    const issues = [];

    // Check name is non-empty
    if (!node.data.name || !node.data.name.trim()) {
        issues.push('Tool name cannot be empty');
    }

    // Check name is unique within connected models
    // For simplicity, check uniqueness across all tools
    if (getAllToolNodesFn) {
        const allTools = getAllToolNodesFn();
        const duplicates = allTools.filter(t => t.id !== node.id && t.data.name === node.data.name);
        if (duplicates.length > 0) {
            issues.push(`Tool name "${node.data.name}" is not unique`);
        }
    }

    // Check schema is well-formed
    try {
        const schema = node.data.parametersSchema;
        if (!schema || typeof schema !== 'object') {
            issues.push('Parameters schema must be a valid object');
        } else {
            // Check that path is required and is a string
            if (!schema.properties || !schema.properties.path) {
                issues.push('Schema must include "path" property');
            } else if (schema.properties.path.type !== 'string') {
                issues.push('Schema property "path" must be type "string"');
            }

            if (!schema.required || !Array.isArray(schema.required) || !schema.required.includes('path')) {
                issues.push('Schema must have "path" in required array');
            }
        }
    } catch (err) {
        issues.push(`Schema validation error: ${err.message}`);
    }

    // Check JavaScript syntax
    try {
        new Function('args', node.data.implementation.code);
    } catch (err) {
        issues.push(`JavaScript syntax error: ${err.message}`);
    }

    // Log results
    if (issues.length === 0) {
        addLog('info', `tool_validation: node=${node.data.name} status=ok`);
    } else {
        issues.forEach(issue => {
            addLog('error', `tool_validation_error: ${issue}`);
        });
    }
}

/**
 * Validate tool connection
 */
function isValidToolConnection(sourceNode, sourcePin, targetNode, targetPin) {
    // Allow: Tool.register → Model.tools
    if (sourceNode.type === 'tool' && sourcePin === 'register' &&
        targetNode.type === 'model' && targetPin === 'tools') {
        return true;
    }

    return false;
}

/**
 * Find tools registered to a model
 */
function findRegisteredTools(modelNodeId, edges, nodes) {
    const tools = [];

    for (const edge of edges.values()) {
        if (edge.targetNodeId === modelNodeId && edge.targetPin === 'tools') {
            const toolNode = nodes.get(edge.sourceNodeId);
            if (toolNode && toolNode.type === 'tool') {
                tools.push(toolNode);
            }
        }
    }

    return tools;
}

/**
 * Find models connected to a tool
 */
function findConnectedModels(toolNodeId, edges, nodes) {
    const models = [];

    for (const edge of edges.values()) {
        if (edge.sourceNodeId === toolNodeId && edge.sourcePin === 'register') {
            const modelNode = nodes.get(edge.targetNodeId);
            if (modelNode && modelNode.type === 'model') {
                models.push(modelNode);
            }
        }
    }

    return models;
}

/**
 * Build tools catalog for a model
 */
function buildToolsCatalog(tools) {
    return tools.map(tool => ({
        name: tool.data.name,
        description: tool.data.description,
        parametersSchema: tool.data.parametersSchema
    }));
}

module.exports = {
    createToolNodeData,
    renderToolNode,
    renderToolInspector,
    isValidToolConnection,
    findRegisteredTools,
    findConnectedModels,
    buildToolsCatalog,
    setGetAllToolNodes
};
