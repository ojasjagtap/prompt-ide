# DSPy Optimization Node

Visual prompt optimization using Stanford NLP's DSPy library.

## What is DSPy?

**DSPy** (Declarative Self-improving Python) is a framework from Stanford NLP for programmatically optimizing prompts and language model pipelines. Instead of manually tweaking prompts through trial and error, DSPy uses algorithms to automatically find better prompts based on your training data.

### How DSPy Works

1. **You provide examples**: Input/output pairs showing what you want the model to do
2. **DSPy generates variations**: It creates different prompt versions and few-shot examples
3. **It evaluates each**: Tests them against your data using a metric
4. **Returns the best**: Gives you the optimized prompt that performed best

### Key Concepts

- **Signatures**: Define input → output (e.g., "question → answer")
- **Modules**: Building blocks like `Predict` or `ChainOfThought`
- **Optimizers**: Algorithms that find better prompts (BootstrapFewShot, MIPRO)
- **Metrics**: Functions that score how good an output is

### Why Use DSPy?

| Manual Prompting | DSPy Optimization |
|------------------|-------------------|
| Trial and error | Data-driven |
| Time-consuming | Automated |
| Subjective | Measurable |
| Hard to improve | Iterative |

---

## File Structure

```
renderer/
├── dspy-worker.js           # Node.js ↔ Python bridge
├── dspy-optimize-script.js  # Node UI implementation
└── dspy/
    ├── dspy_optimizer.py    # Python worker (runs DSPy)
    └── requirements.txt     # Python dependencies
```

---

## File Descriptions

### `dspy-worker.js` (370 lines)
**Purpose**: Bridge between Node.js (Electron) and Python

**What it does**:
- Spawns Python subprocess
- Sends configuration via stdin (JSON)
- Receives progress updates via stdout
- Handles errors and cancellation

**Key functions**:
```javascript
executeDSPyOptimization(config, onProgress, signal)  // Main optimization
checkDSPyEnvironment()                                // Check Python/DSPy
validateDSPyConfig(config)                            // Validate before run
```

### `dspy-optimize-script.js` (850 lines)
**Purpose**: Node UI for visual editor

**What it does**:
- Creates node data structure
- Renders node HTML on canvas
- Builds inspector UI (configuration panel)
- Handles connections and validation
- Executes optimization via bridge
- Displays results

**Key functions**:
```javascript
createDSPyOptimizeNodeData()          // Initialize node
renderDSPyOptimizeNode()              // Draw on canvas
renderDSPyOptimizeInspector()         // Configuration UI
isValidDSPyOptimizeConnection()       // Connection rules
executeDSPyOptimizeNode()             // Run optimization
```

### `dspy/dspy_optimizer.py` (678 lines)
**Purpose**: Python worker that runs actual DSPy

**What it does**:
- Configures language models (Ollama/OpenAI/Anthropic)
- Prepares datasets (converts to DSPy format)
- Creates metrics (exact_match, contains, custom)
- Runs optimizers (BootstrapFewShot, MIPRO)
- Extracts results (instructions, demos)
- Saves compiled programs

**Workflow**:
```python
1. Read config from stdin
2. Setup language model
3. Prepare dataset
4. Create metric
5. Run optimizer
6. Evaluate results
7. Return via stdout
```

### `dspy/requirements.txt`
**Purpose**: Python dependencies

```
dspy-ai>=2.6.0
cloudpickle>=2.0.0
```

Install with: `pip install -r renderer/dspy/requirements.txt`

---

## Integration Points in script.js

The DSPy node is integrated into the main app via these additions:

### 1. Import (line 24-30)
```javascript
const {
    createDSPyOptimizeNodeData,
    renderDSPyOptimizeNode,
    renderDSPyOptimizeInspector,
    isValidDSPyOptimizeConnection,
    executeDSPyOptimizeNode
} = require('./dspy-optimize-script');
```

### 2. Node Creation (line 263-264)
```javascript
} else if (type === 'dspy-optimize') {
    node.data = createDSPyOptimizeNodeData();
```

### 3. Node Rendering (line 425-426)
```javascript
} else if (node.type === 'dspy-optimize') {
    nodeEl.innerHTML = renderDSPyOptimizeNode(node, state.edges, state.nodes);
```

### 4. Inspector (line 886-895)
```javascript
} else if (node.type === 'dspy-optimize') {
    const inspector = renderDSPyOptimizeInspector(...);
    inspectorContent.innerHTML = inspector.html;
    inspector.setupListeners({...});
```

### 5. Connection Validation (line 565-568)
```javascript
if (isValidDSPyOptimizeConnection(sourceNode, sourcePin, targetNode, targetPin, state.edges)) {
    return true;
}
```

### 6. Execution (line 1685-1695)
```javascript
} else if (optimizeNode.type === 'dspy-optimize') {
    await executeDSPyOptimizeNode(...);
}
```

### 7. HTML Sidebar (index.html line 75-77)
```html
<div class="node-item" data-node-type="dspy-optimize" draggable="true">
    DSPy Optimize
</div>
```

---

## Configuration Options

### Optimizers

| Optimizer | Best For | Time | Description |
|-----------|----------|------|-------------|
| BootstrapFewShot | 5-50 examples | 5-10 min | Generates few-shot demos |
| MIPROv2 | 50-300 examples | 20-60 min | Optimizes instructions + demos |

### Metrics

| Metric | Use Case | Example |
|--------|----------|---------|
| exact_match | Precise answers | "4" = "4" |
| contains | Flexible match | "4" in "The answer is 4" |
| semantic_f1 | Meaning similarity | Similar semantics |

### Program Types

| Type | Description | Use Case |
|------|-------------|----------|
| predict | Direct answer | Simple Q&A |
| chain_of_thought | Shows reasoning | Math, logic |
| react | Reasoning + acting | Complex tasks |

---

## Examples to Try

### Example 1: Math Tutor (5 minutes)

**Setup**:
1. Add Prompt node and DSPy Optimize node
2. Connect Prompt → DSPy Optimize

**Prompt node**:
```
System Prompt: You are a math tutor.
```

**DSPy Optimize settings**:
- Optimizer: BootstrapFewShot
- Metric: exact_match

**Dataset**:
```json
[
  {"input": "What is 2+2?", "output": "4"},
  {"input": "What is 3+3?", "output": "6"},
  {"input": "What is 5+5?", "output": "10"},
  {"input": "What is 7+7?", "output": "14"},
  {"input": "What is 9+9?", "output": "18"},
  {"input": "What is 4+4?", "output": "8"},
  {"input": "What is 6+6?", "output": "12"},
  {"input": "What is 8+8?", "output": "16"}
]
```

**Expected result**: ~80-90% accuracy, optimized instruction, 4 demos

---

### Example 2: Capital Cities (5 minutes)

**Dataset**:
```json
[
  {"input": "What is the capital of France?", "output": "Paris"},
  {"input": "What is the capital of Germany?", "output": "Berlin"},
  {"input": "What is the capital of Italy?", "output": "Rome"},
  {"input": "What is the capital of Spain?", "output": "Madrid"},
  {"input": "What is the capital of Japan?", "output": "Tokyo"},
  {"input": "What is the capital of Brazil?", "output": "Brasilia"},
  {"input": "What is the capital of Canada?", "output": "Ottawa"},
  {"input": "What is the capital of Australia?", "output": "Canberra"}
]
```

**Settings**: BootstrapFewShot, exact_match

---

### Example 3: Sentiment Analysis (5 minutes)

**Dataset**:
```json
[
  {"input": "I love this product!", "output": "positive"},
  {"input": "Terrible experience", "output": "negative"},
  {"input": "It's okay I guess", "output": "neutral"},
  {"input": "Best purchase ever!", "output": "positive"},
  {"input": "Complete waste of money", "output": "negative"},
  {"input": "Does what it's supposed to", "output": "neutral"},
  {"input": "Absolutely fantastic!", "output": "positive"},
  {"input": "Very disappointed", "output": "negative"}
]
```

**Settings**: BootstrapFewShot, exact_match

---

### Example 4: Text Classification with Contains (10 minutes)

**Dataset**:
```json
[
  {"input": "How do I reset my password?", "output": "account"},
  {"input": "My order hasn't arrived", "output": "shipping"},
  {"input": "I want a refund", "output": "billing"},
  {"input": "Can't log into my account", "output": "account"},
  {"input": "Where is my package?", "output": "shipping"},
  {"input": "Charge me incorrectly", "output": "billing"},
  {"input": "Change my email address", "output": "account"},
  {"input": "Tracking number not working", "output": "shipping"},
  {"input": "Cancel my subscription", "output": "billing"},
  {"input": "Two-factor authentication help", "output": "account"}
]
```

**Settings**:
- Optimizer: BootstrapFewShot
- Metric: **contains** (more flexible than exact_match)

---

### Example 5: Chain of Thought Math (15 minutes)

**Dataset**:
```json
[
  {"input": "If I have 5 apples and give away 2, how many do I have?", "output": "3"},
  {"input": "A book costs $12. I have $20. How much change?", "output": "8"},
  {"input": "3 friends share 15 candies equally. How many each?", "output": "5"},
  {"input": "I read 10 pages per day for 7 days. Total pages?", "output": "70"},
  {"input": "A pizza has 8 slices. 3 are eaten. How many left?", "output": "5"},
  {"input": "Buy 4 items at $3 each. Total cost?", "output": "12"}
]
```

**Settings**:
- Optimizer: BootstrapFewShot
- Metric: contains
- **Program Type: chain_of_thought** (shows reasoning)

---

### Example 6: MIPRO Optimization (20 minutes)

For better results with more data, try MIPRO:

**Dataset**: Use 20+ examples from any category above

**Settings**:
- **Optimizer: MIPROv2**
- **Mode: light**
- Metric: exact_match or contains

MIPRO optimizes both instructions AND few-shot examples using Bayesian optimization.

---

## Prerequisites

### Python Setup
```bash
# Check Python version (need 3.8+)
python --version

# Install DSPy
pip install dspy-ai

# Verify
python -c "import dspy; print(dspy.__version__)"
```

### Ollama (for local models)
```bash
# Start Ollama server
ollama serve

# Pull a model
ollama pull llama3.2:1b
```

### Or use OpenAI
Configure API key in app Settings

---

## Troubleshooting

### "Python not found"
Install Python 3.8+ and add to PATH

### "DSPy not installed"
```bash
pip install dspy-ai
```

### "Connection refused"
Start Ollama: `ollama serve`

### Low validation scores
- Add more examples (10+ recommended)
- Try "contains" instead of "exact_match"
- Use MIPRO for better results
- Check output format consistency

### Optimization takes too long
- Use BootstrapFewShot instead of MIPRO
- Reduce dataset size
- Use "light" mode for MIPRO

---

## How It All Works Together

```
User Action                    System Response
-----------                    ---------------

1. Drag DSPy node      →   createDSPyOptimizeNodeData()
   onto canvas              creates node with default config

2. Select node         →   renderDSPyOptimizeInspector()
                            shows configuration UI

3. Edit dataset        →   JSON parsed and stored in
   in inspector             node.data.trainDataset

4. Click "Run"         →   executeDSPyOptimizeNode()
                            builds config, calls bridge

5. Bridge spawns       →   dspy_optimizer.py reads config,
   Python process           runs DSPy optimization

6. Progress streams    →   onProgress callback updates
   back to Node.js          logs panel in real-time

7. Results return      →   node.data updated with
                            score, instructions, demos

8. Click "Apply"       →   applyOptimizedPrompt()
                            copies to connected Prompt node
```

---

## Tips for Best Results

1. **Start small**: 5-10 examples, BootstrapFewShot
2. **Consistent format**: Outputs should follow same pattern
3. **Diverse examples**: Cover different input types
4. **Right metric**: exact_match for precise, contains for flexible
5. **Iterate**: Check results, add examples, re-run

---

## Learn More

- [DSPy Documentation](https://dspy.ai)
- [DSPy GitHub](https://github.com/stanfordnlp/dspy)
- [DSPy Paper](https://arxiv.org/abs/2310.03714)
