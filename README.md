# Prompt IDE

A visual node-based development environment for building, testing, and optimizing LLM prompts. Create complex prompt workflows with an intuitive drag-and-drop interface.

## Features

### Visual Flow Programming
- **Node-Based Interface**: Build prompt workflows visually by connecting nodes
- **Infinite Canvas**: Pan and zoom across your workspace with an intuitive grid-based canvas
- **Drag-and-Drop**: Easily add and connect nodes to create complex prompt chains

### Node Types

#### Prompt Nodes
Input nodes for defining your prompts and system messages.

#### Model Nodes
Execute prompts using various LLM providers:
- **OpenAI**: GPT-4, GPT-3.5-turbo, and other OpenAI models
- **Ollama**: Local LLM execution with any Ollama-supported model

#### Tool Nodes
Create custom tools that your LLMs can call:
- Define tool schemas with JSON
- Implement tool logic in JavaScript
- Automatic tool registration and calling

#### Evolutionary Optimization Nodes
Automatically improve your prompts using evolutionary algorithms:
- Generate prompt variations through mutation and crossover
- Test against multiple models
- **Hyperparameter tuning**: Automatically finds the best temperature setting
- Iteratively evolve better prompts
- Configurable population size and generations
- Scoring with BLEU and Levenshtein metrics

### Real-Time Execution
- **Run Engine**: Execute your prompt flows with a single click
- **Live Logs**: Monitor execution in real-time with detailed logging
- **Status Indicators**: Track running, idle, and error states
- **Cancellation**: Stop long-running operations at any time

### Inspector Panel
Configure node settings with a dynamic inspector:
- Model selection and parameters (temperature, max tokens, etc.)
- Tool definitions and code editing
- Optimization algorithm parameters
- View optimized results with score percentage and best temperature
- Real-time validation

### Settings Management
- **API Keys**: Securely store provider API keys locally
- **Provider Status**: See which providers are configured and active
- **Local-First**: All data stays on your machine

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- For local models: [Ollama](https://ollama.ai/) installed and running

### Installation

1. Clone the repository:
```bash
git clone https://github.com/ojasjagtap/prompt-ide.git
cd prompt-goat-sandbox
```

2. Install dependencies:
```bash
npm install
```

3. Start the application:
```bash
npm start
```

### Quick Start Guide

1. **Configure Providers**
   - Click the "Settings" button in the top bar
   - Add your OpenAI API key (optional)
   - Ollama is enabled by default at `localhost:11434`

2. **Create Your First Flow**
   - Drag a "Prompt" node from the left panel onto the canvas
   - Add a "Model" node
   - Connect the Prompt output to the Model input by dragging between pins

3. **Configure Nodes**
   - Click a node to open its inspector
   - For Prompt nodes: Enter your prompt text
   - For Model nodes: Select a model and adjust parameters

4. **Run Your Flow**
   - Click the "Run" button in the top bar
   - Watch the logs panel for execution details
   - View results in the inspector

## Node Connections

Nodes can be connected by dragging from an output pin to an input pin. Valid connections:

- **Prompt → Model**: Feed a prompt into an LLM
- **Tool → Model**: Register tools with a model for function calling
- **Model → Evolutionary Optimization**: Provide a model for prompt optimization
- **Prompt → Evolutionary Optimization**: Supply the initial prompt to optimize

## Advanced Features

### Tool Calling
Create custom tools that LLMs can invoke:

1. Add a Tool node to your canvas
2. Define the tool schema in JSON format
3. Implement the tool logic in JavaScript
4. Connect the tool to your Model node

### Evolutionary Prompt Optimization
Automatically improve your prompts with hyperparameter tuning:

1. Create a prompt and model flow
2. Add an Evolutionary Optimization node
3. Connect your prompt and model to the optimizer
4. Configure population size and generations
5. Define the expected output for scoring
6. Run to evolve better prompt variations

The algorithm will:
- Generate variations of your prompt through mutation and crossover
- Test each variation with multiple temperature settings (0.3, 0.5, 0.7, 0.9, 1.1)
- Find the optimal temperature for each prompt candidate
- Score outputs using BLEU and Levenshtein distance metrics
- Select the best performers (prompt + temperature combination)
- Create new variations through crossover and mutation
- Repeat for the specified number of generations
- Output the best prompt AND its optimal temperature parameter

## Logs Panel

The integrated logs panel shows:
- Node execution events
- Model API calls and responses
- Tool invocations
- Errors and warnings

Filter logs by:
- **All**: Show everything
- **Errors**: Only show errors
- **Current Run**: Only show logs from the latest execution

## Keyboard Shortcuts

- **Mouse Wheel**: Zoom in/out on canvas
- **Middle Mouse / Ctrl+Drag**: Pan canvas
- **Click Node**: Select and show in inspector
- **Click Edge**: Select connection
- **Delete**: Remove selected node or edge

## Development

### Architecture

- **Electron**: Cross-platform desktop application
- **Canvas-based UI**: Custom rendering for nodes and connections
- **Web Workers**: Isolated execution environment for tools
- **Modular Adapters**: Pluggable support for different LLM providers

### Adding New Providers

1. Create a new adapter class in `model-adapters.js` extending `ModelAdapter`
2. Implement `prepareRequest`, `parseChunk`, and `continueWithToolResult`
3. Register the adapter in the model service
4. Add UI for configuration in the settings modal

## Troubleshooting

### Ollama Connection Issues
- Ensure Ollama is running: `ollama serve`
- Check it's accessible at `http://localhost:11434`
- Verify models are installed: `ollama list`

### OpenAI API Errors
- Verify your API key is correct
- Check you have available credits
- Ensure you have access to the selected model

### Tool Execution Errors
- Validate your tool schema is valid JSON
- Check tool code for syntax errors
- Review logs for detailed error messages
