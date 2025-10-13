/**
 * Model Adapter Interface
 * Provides swappable adapters for different model providers
 */

/**
 * Base Model Adapter Interface
 */
class ModelAdapter {
    /**
     * Check if this adapter supports tools
     */
    supportsTools() {
        return false;
    }

    /**
     * Prepare request payload
     * @param {Object} options
     * @param {string} options.prompt - User prompt
     * @param {Array} options.toolsCatalog - Available tools
     * @param {Object} options.settings - Model settings (temperature, maxTokens)
     * @param {Object} options.sessionState - Session state for multi-turn
     * @returns {Object} Request payload
     */
    prepareRequest({ prompt, toolsCatalog, settings, sessionState }) {
        throw new Error('Not implemented');
    }

    /**
     * Parse streaming chunk
     * @param {string} chunk - Raw chunk from API
     * @param {Object} chunkState - State to track partial chunks
     * @returns {Object} { textDelta?, toolCalls? }
     */
    parseChunk(chunk, chunkState) {
        throw new Error('Not implemented');
    }

    /**
     * Continue generation with tool result
     * @param {Object} sessionState - Current session state
     * @param {Object} toolResult - Tool result { name, normalized }
     * @returns {Object} Updated session state
     */
    continueWithToolResult(sessionState, toolResult) {
        throw new Error('Not implemented');
    }
}

/**
 * Ollama Adapter with native tool support
 */
class OllamaAdapter extends ModelAdapter {
    supportsTools() {
        return true;
    }

    prepareRequest({ prompt, toolsCatalog, settings, sessionState }) {
        // If tools are present, we MUST use chat format
        const hasTools = toolsCatalog && toolsCatalog.length > 0;

        if (hasTools) {
            // Use chat format for tool calling
            const messages = sessionState.messages && sessionState.messages.length > 0
                ? sessionState.messages
                : [{ role: 'user', content: prompt }];

            const body = {
                model: settings.model,
                messages: messages,
                stream: true,
                options: {
                    temperature: settings.temperature,
                    num_predict: settings.maxTokens
                },
                tools: toolsCatalog.map(tool => ({
                    type: 'function',
                    function: {
                        name: tool.name,
                        description: tool.description,
                        parameters: tool.parametersSchema
                    }
                }))
            };

            return { body, useChat: true };
        } else {
            // Use generate format for non-tool requests
            const body = {
                model: settings.model,
                prompt: prompt,
                stream: true,
                options: {
                    temperature: settings.temperature,
                    num_predict: settings.maxTokens
                }
            };

            return { body, useChat: false };
        }
    }

    parseChunk(chunk, chunkState) {
        const result = { textDelta: null, toolCalls: null };

        try {
            const lines = chunk.split('\n').filter(l => l.trim());

            for (const line of lines) {
                const data = JSON.parse(line);

                // Chat format (with message)
                if (data.message) {
                    // Text response
                    if (data.message.content) {
                        result.textDelta = data.message.content;
                    }

                    // Tool calls (Ollama chat format)
                    if (data.message.tool_calls && Array.isArray(data.message.tool_calls)) {
                        result.toolCalls = data.message.tool_calls.map(tc => ({
                            name: tc.function?.name || tc.name,
                            arguments: typeof tc.function?.arguments === 'string'
                                ? JSON.parse(tc.function.arguments)
                                : (tc.function?.arguments || tc.arguments || {})
                        }));
                    }
                }
                // Generate format (legacy, no tools)
                else if (data.response) {
                    result.textDelta = data.response;
                }
            }
        } catch (error) {
            // Ignore parse errors for partial chunks
        }

        return result;
    }

    continueWithToolResult(sessionState, toolResult) {
        // Update session with tool result
        if (!sessionState.messages) {
            sessionState.messages = [];
        }

        // If we don't have an assistant message with tool_calls yet, add it
        // (This should have been saved during the streaming, but we'll ensure it exists)
        const lastMessage = sessionState.messages[sessionState.messages.length - 1];
        if (!lastMessage || lastMessage.role !== 'assistant') {
            sessionState.messages.push({
                role: 'assistant',
                content: '',
                tool_calls: [{
                    function: {
                        name: toolResult.name,
                        arguments: toolResult.arguments
                    }
                }]
            });
        }

        // Add tool result message (Ollama format)
        sessionState.messages.push({
            role: 'tool',
            content: this.formatToolResultForModel(toolResult.normalized)
        });

        return sessionState;
    }

    formatToolResultForModel(normalized) {
        if (!normalized.ok) {
            return JSON.stringify({
                error: normalized.error
            });
        }

        if (normalized.kind === 'text') {
            return normalized.result;
        } else if (normalized.kind === 'json') {
            return JSON.stringify(normalized.result);
        } else if (normalized.kind === 'bytes') {
            return `[Base64 Data: ${normalized.result.length} chars]`;
        }

        return String(normalized.result);
    }
}

/**
 * Fallback Prompt Adapter
 * Uses prompt injection to simulate tool calling
 */
class FallbackPromptAdapter extends ModelAdapter {
    supportsTools() {
        return true; // Simulated support
    }

    prepareRequest({ prompt, toolsCatalog, settings, sessionState }) {
        let enhancedPrompt = prompt;

        // Inject tool instructions if tools are available
        if (toolsCatalog && toolsCatalog.length > 0) {
            const toolsDescription = this.buildToolsDescription(toolsCatalog);

            enhancedPrompt = `${prompt}

You have access to the following tools:

${toolsDescription}

To use a tool, respond with ONLY a JSON object in this EXACT format:
{
  "tool_call": {
    "name": "tool_name",
    "arguments": { "param": "value" }
  }
}

Do not include any other text. If you don't need to use a tool, respond normally.`;
        }

        const body = {
            model: settings.model,
            prompt: enhancedPrompt,
            stream: true,
            options: {
                temperature: settings.temperature,
                num_predict: settings.maxTokens
            }
        };

        return { body, useChat: false };
    }

    parseChunk(chunk, chunkState) {
        const result = { textDelta: null, toolCalls: null };

        try {
            const lines = chunk.split('\n').filter(l => l.trim());

            for (const line of lines) {
                const data = JSON.parse(line);

                if (data.response) {
                    // Accumulate response to detect tool calls
                    if (!chunkState.accumulated) {
                        chunkState.accumulated = '';
                    }
                    chunkState.accumulated += data.response;

                    // Try to parse as tool call
                    const toolCall = this.extractToolCall(chunkState.accumulated);
                    if (toolCall) {
                        result.toolCalls = [toolCall];
                        chunkState.foundToolCall = true;
                    } else if (!chunkState.foundToolCall) {
                        // Normal text response
                        result.textDelta = data.response;
                    }
                }
            }
        } catch (error) {
            // Ignore parse errors
        }

        return result;
    }

    extractToolCall(text) {
        try {
            // Try to extract JSON from the text
            const jsonMatch = text.match(/\{[\s\S]*"tool_call"[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.tool_call && parsed.tool_call.name) {
                    return {
                        name: parsed.tool_call.name,
                        arguments: parsed.tool_call.arguments || {}
                    };
                }
            }
        } catch (error) {
            // Not a valid tool call
        }
        return null;
    }

    continueWithToolResult(sessionState, toolResult) {
        // Store tool result in session state
        if (!sessionState.toolResults) {
            sessionState.toolResults = [];
        }

        sessionState.toolResults.push({
            name: toolResult.name,
            result: this.formatToolResultForModel(toolResult.normalized)
        });

        return sessionState;
    }

    formatToolResultForModel(normalized) {
        if (!normalized.ok) {
            return `Error: ${normalized.error.message}`;
        }

        if (normalized.kind === 'text') {
            return normalized.result;
        } else if (normalized.kind === 'json') {
            return JSON.stringify(normalized.result, null, 2);
        } else if (normalized.kind === 'bytes') {
            return `[Binary data: ${normalized.result.length} bytes]`;
        }

        return String(normalized.result);
    }

    buildToolsDescription(toolsCatalog) {
        return toolsCatalog.map(tool => {
            const params = Object.entries(tool.parametersSchema.properties || {})
                .map(([name, schema]) => `  - ${name} (${schema.type}): ${schema.description || ''}`)
                .join('\n');

            return `### ${tool.name}
${tool.description}
Parameters:
${params}`;
        }).join('\n\n');
    }
}

/**
 * OpenAI Adapter with native function calling support
 */
class OpenAIAdapter extends ModelAdapter {
    constructor({ apiKey, organization = null }) {
        super();
        this.apiKey = apiKey;
        this.organization = organization;
    }

    supportsTools() {
        return true;
    }

    prepareRequest({ prompt, toolsCatalog, settings, sessionState }) {
        const hasTools = toolsCatalog && toolsCatalog.length > 0;

        // Build messages array
        const messages = sessionState.messages && sessionState.messages.length > 0
            ? sessionState.messages
            : [{ role: 'user', content: prompt }];

        const body = {
            model: settings.model,
            messages: messages,
            temperature: settings.temperature,
            max_tokens: settings.maxTokens,
            stream: true
        };

        // Add tools if present
        if (hasTools) {
            body.tools = toolsCatalog.map(tool => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parametersSchema
                }
            }));
        }

        return { body, useChat: true };
    }

    parseChunk(chunk, chunkState) {
        const result = { textDelta: null, toolCalls: null };

        try {
            const lines = chunk.split('\n').filter(l => l.trim() && l.trim() !== 'data: [DONE]');

            for (const line of lines) {
                // OpenAI streams with "data: " prefix
                const dataMatch = line.match(/^data: (.+)$/);
                if (!dataMatch) continue;

                const data = JSON.parse(dataMatch[1]);
                const choice = data.choices?.[0];
                if (!choice) continue;

                const delta = choice.delta;

                // Text content
                if (delta.content) {
                    result.textDelta = delta.content;
                }

                // Tool calls (OpenAI streams tool calls incrementally)
                if (delta.tool_calls) {
                    if (!chunkState.toolCallsBuilder) {
                        chunkState.toolCallsBuilder = {};
                    }

                    for (const tc of delta.tool_calls) {
                        const index = tc.index;
                        if (!chunkState.toolCallsBuilder[index]) {
                            chunkState.toolCallsBuilder[index] = {
                                name: '',
                                arguments: ''
                            };
                        }

                        const builder = chunkState.toolCallsBuilder[index];

                        if (tc.function?.name) {
                            builder.name = tc.function.name;
                        }

                        if (tc.function?.arguments) {
                            builder.arguments += tc.function.arguments;
                        }
                    }
                }

                // Check for finish reason
                if (choice.finish_reason === 'tool_calls' && chunkState.toolCallsBuilder) {
                    // Finalize tool calls
                    result.toolCalls = Object.values(chunkState.toolCallsBuilder).map(builder => ({
                        name: builder.name,
                        arguments: JSON.parse(builder.arguments)
                    }));
                }
            }
        } catch (error) {
            // Ignore parse errors for partial chunks
        }

        return result;
    }

    continueWithToolResult(sessionState, toolResult) {
        if (!sessionState.messages) {
            sessionState.messages = [];
        }

        // Add assistant message with tool call
        const lastMessage = sessionState.messages[sessionState.messages.length - 1];
        if (!lastMessage || lastMessage.role !== 'assistant') {
            sessionState.messages.push({
                role: 'assistant',
                content: null,
                tool_calls: [{
                    id: `call_${Date.now()}`,
                    type: 'function',
                    function: {
                        name: toolResult.name,
                        arguments: JSON.stringify(toolResult.arguments)
                    }
                }]
            });
        }

        // Add tool result message
        sessionState.messages.push({
            role: 'tool',
            tool_call_id: `call_${Date.now()}`,
            content: this.formatToolResultForModel(toolResult.normalized)
        });

        return sessionState;
    }

    formatToolResultForModel(normalized) {
        if (!normalized.ok) {
            return JSON.stringify({
                error: normalized.error.message || 'Unknown error'
            });
        }

        if (normalized.kind === 'text') {
            return normalized.result;
        } else if (normalized.kind === 'json') {
            return JSON.stringify(normalized.result);
        } else if (normalized.kind === 'bytes') {
            return `[Base64 Data: ${normalized.result.length} chars]`;
        }

        return String(normalized.result);
    }
}

/**
 * Get adapter for a given model
 */
function getAdapterForModel(modelName) {
    // For now, use Ollama adapter for all models
    // In the future, we can detect model capabilities and choose the right adapter
    return new OllamaAdapter();
}

module.exports = {
    ModelAdapter,
    OllamaAdapter,
    OpenAIAdapter,
    FallbackPromptAdapter,
    getAdapterForModel
};
