# DSPy Integration System Diagram

## Complete Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PROMPT IDE (ELECTRON)                       │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                    RENDERER PROCESS                        │   │
│  │                                                            │   │
│  │  ┌──────────────────────────────────────────────────┐    │   │
│  │  │         DSPy Optimize Node UI                    │    │   │
│  │  │     (dspy-optimize-script.js - TO BUILD)         │    │   │
│  │  │                                                   │    │   │
│  │  │  • Node rendering                                │    │   │
│  │  │  • Inspector UI (dataset editor, config)         │    │   │
│  │  │  • Execute node function                         │    │   │
│  │  │  • Result display                                │    │   │
│  │  └──────────────────┬───────────────────────────────┘    │   │
│  │                     │                                     │   │
│  │                     ↓                                     │   │
│  │  ┌──────────────────────────────────────────────────┐    │   │
│  │  │         DSPy Worker Bridge                       │    │   │
│  │  │         (dspy-worker.js) ✅ BUILT                │    │   │
│  │  │                                                   │    │   │
│  │  │  • executeDSPyOptimization()                     │    │   │
│  │  │  • checkDSPyEnvironment()                        │    │   │
│  │  │  • validateDSPyConfig()                          │    │   │
│  │  │  • Progress streaming                            │    │   │
│  │  │  • Error handling                                │    │   │
│  │  └──────────────────┬───────────────────────────────┘    │   │
│  │                     │                                     │   │
│  └─────────────────────┼─────────────────────────────────────┘   │
│                        │ spawn()                               │
└────────────────────────┼───────────────────────────────────────┘
                         │
                         ↓ stdin (JSON config)
         ┌───────────────────────────────────────┐
         │      PYTHON SUBPROCESS                │
         │                                       │
         │  ┌─────────────────────────────────┐ │
         │  │  dspy_optimizer.py ✅ BUILT     │ │
         │  │                                 │ │
         │  │  • Parse config                 │ │
         │  │  • Setup LM                     │ │
         │  │  • Prepare datasets             │ │
         │  │  • Create metric                │ │
         │  │  • Create DSPy program          │ │
         │  │  • Run optimizer                │ │
         │  │  • Evaluate                     │ │
         │  │  • Extract results              │ │
         │  │  • Save program                 │ │
         │  └────────────┬────────────────────┘ │
         │               │                       │
         └───────────────┼───────────────────────┘
                         │
                         ↓ import
         ┌───────────────────────────────────────┐
         │        DSPy LIBRARY                   │
         │                                       │
         │  • dspy.LM() - Language models        │
         │  • dspy.Example - Data format         │
         │  • dspy.Module - Programs             │
         │  • dspy.Predict - Predictors          │
         │  • dspy.ChainOfThought - Reasoning    │
         │  • BootstrapFewShot - Optimizer       │
         │  • MIPROv2 - Advanced optimizer       │
         │  • dspy.evaluate - Metrics            │
         │  • dspy.configure() - Setup           │
         └───────────────┬───────────────────────┘
                         │
                         ↓ API calls
         ┌───────────────────────────────────────┐
         │     LANGUAGE MODEL PROVIDERS          │
         │                                       │
         │  ┌─────────────────────────────────┐ │
         │  │  Ollama (Local)                 │ │
         │  │  • llama3.2:1b                  │ │
         │  │  • mistral                      │ │
         │  │  • gemma                        │ │
         │  └─────────────────────────────────┘ │
         │                                       │
         │  ┌─────────────────────────────────┐ │
         │  │  OpenAI (Cloud)                 │ │
         │  │  • gpt-4                        │ │
         │  │  • gpt-3.5-turbo                │ │
         │  └─────────────────────────────────┘ │
         │                                       │
         │  ┌─────────────────────────────────┐ │
         │  │  Anthropic (Cloud)              │ │
         │  │  • claude-3-sonnet              │ │
         │  │  • claude-3-opus                │ │
         │  └─────────────────────────────────┘ │
         └───────────────────────────────────────┘
```

## Data Flow

### 1. Optimization Request

```
User clicks "Run" button
    ↓
dspy-optimize-script.js creates config
    ↓
Calls executeDSPyOptimization(config, onProgress, signal)
    ↓
dspy-worker.js spawns Python subprocess
    ↓
Writes config JSON to stdin
```

### 2. Python Processing

```
dspy_optimizer.py reads stdin
    ↓
Parses JSON config
    ↓
setup_language_model() → dspy.configure()
    ↓
prepare_dataset() → dspy.Example objects
    ↓
create_metric() → metric function
    ↓
create_dspy_program() → dspy.Module
    ↓
run_bootstrap_fewshot() / run_mipro()
    ↓
    → DSPy optimizer runs
    → Calls LM multiple times
    → Evaluates with metric
    → Selects best configuration
    ↓
evaluate_program() → validation score
    ↓
extract_optimized_results() → instructions + demos
    ↓
save_compiled_program() → disk
```

### 3. Progress Streaming

```
Throughout execution:
    log_progress("message", data)
        ↓
    JSON printed to stdout
        ↓
    dspy-worker.js parses line-by-line
        ↓
    Calls onProgress callback
        ↓
    Node UI updates (addLog, updateNodeDisplay)
```

### 4. Result Return

```
Python: print(json.dumps({type: 'success', ...}))
    ↓
dspy-worker.js parses result
    ↓
Promise resolves with result object
    ↓
dspy-optimize-script.js receives result
    ↓
Updates node.data with:
    • validation_score
    • optimized_signature
    • optimized_demos
    • compiled_program_path
    ↓
Updates UI display
```

## Component Status

| Component | Status | Lines | Description |
|-----------|--------|-------|-------------|
| dspy-worker.js | ✅ Complete | 370 | Bridge to Python |
| test-dspy-bridge.js | ✅ Complete | 250 | Bridge tests |
| dspy_optimizer.py | ✅ Complete | 678 | Python worker |
| test-dspy-optimizer.js | ✅ Complete | 250 | Optimizer tests |
| requirements.txt | ✅ Complete | 8 | Dependencies |
| **dspy-optimize-script.js** | ⏳ **TODO** | ~800 | **Node UI** |
| Integration (script.js) | ⏳ TODO | ~50 | Import + cases |
| Integration (index.html) | ⏳ TODO | ~5 | Add button |

## File Structure

```
prompt-ide/
├── renderer/
│   ├── dspy-worker.js              ✅ Bridge (370 lines)
│   ├── test-dspy-bridge.js         ✅ Bridge test
│   ├── test-dspy-optimizer.js      ✅ Optimizer test
│   ├── dspy-optimize-script.js     ⏳ Node UI (TO BUILD)
│   ├── script.js                   ⏳ Add cases here
│   ├── index.html                  ⏳ Add button here
│   └── dspy/
│       ├── dspy_optimizer.py       ✅ Worker (678 lines)
│       ├── test_bridge.py          ✅ Test script
│       ├── requirements.txt        ✅ Dependencies
│       ├── README.md               ✅ Bridge docs
│       ├── QUICK_START.md          ✅ Quick reference
│       ├── OPTIMIZER_GUIDE.md      ✅ Worker docs
│       └── SYSTEM_DIAGRAM.md       ✅ This file
├── DSPY_BRIDGE_SUMMARY.md          ✅ Bridge summary
└── DSPY_PYTHON_WORKER_SUMMARY.md   ✅ Worker summary
```

## Message Protocol

### Node.js → Python (stdin)
```javascript
{
  model_config: { provider, model, api_key, api_base },
  optimizer: 'BootstrapFewShot' | 'MIPRO' | 'MIPROv2',
  optimizer_config: { /* optimizer params */ },
  metric_config: { type, case_sensitive, code },
  program_type: 'predict' | 'chain_of_thought' | 'react',
  train_dataset: [{ input, output }],
  val_dataset: [{ input, output }],
  save_path: 'path'
}
```

### Python → Node.js (stdout, line-delimited JSON)

**Progress**:
```json
{"type": "progress", "message": "Starting optimization...", "data": {}}
```

**Success**:
```json
{
  "type": "success",
  "validation_score": 0.85,
  "optimized_signature": {"predict": "instruction"},
  "optimized_demos": [{"predictor": "...", "input": "...", "output": "..."}],
  "predictors": [{"name": "...", "type": "...", "demo_count": 4}],
  "compiled_program_path": "/path",
  "dataset_sizes": {"train": 10, "val": 2},
  "optimizer": "BootstrapFewShot",
  "program_type": "predict"
}
```

**Error**:
```json
{
  "type": "error",
  "message": "Error description",
  "traceback": "Full traceback..."
}
```

## Node Data Structure (for UI)

Based on existing patterns, the node data should be:

```javascript
{
  id: 'node-1',
  type: 'dspy-optimize',
  x: 100, y: 100,
  width: 240,
  height: 180,
  status: 'idle' | 'running' | 'success' | 'error',
  zIndex: 1,
  collapsed: false,
  data: {
    title: 'DSPy Optimize',

    // Configuration
    optimizer: 'BootstrapFewShot',
    optimizationMode: 'light',
    programType: 'predict',

    // Dataset
    trainDataset: [{ input: '...', output: '...' }],
    valDataset: [],
    datasetSource: 'manual',

    // Metric
    metricType: 'exact_match',
    customMetricCode: '',
    metricThreshold: null,

    // Optimizer params
    maxBootstrappedDemos: 4,
    maxLabeledDemos: 16,
    numTrials: 30,
    minibatch: true,
    minibatchSize: 35,

    // Results
    optimizationStatus: 'idle',
    optimizedSignature: '',
    optimizedDemos: [],
    validationScore: 0,
    optimizationLog: [],
    compiledProgramPath: null
  }
}
```

## Node Connections

```
Prompt Node                DSPy Optimize Node
┌────────────┐            ┌────────────────┐
│            │            │                │
│   System   │            │   Optimizer    │
│   Prompt   │            │   Config       │
│            │            │                │
│         out├───────────→│in              │
│            │ "prompt"   │ "prompt"       │
└────────────┘            │                │
                          │             out├───→ (future: apply)
                          │                │
                          └────────────────┘
```

## Next Implementation: dspy-optimize-script.js

Following the pattern from `evolutionary-optimize-script.js`, needs:

1. **createDSPyOptimizeNodeData()** - Initialize node data
2. **renderDSPyOptimizeNode()** - HTML rendering
3. **renderDSPyOptimizeInspector()** - Inspector UI
4. **isValidDSPyOptimizeConnection()** - Connection rules
5. **executeDSPyOptimizeNode()** - Execution logic
6. **Helper functions**:
   - findConnectedPromptNode()
   - validateDSPyOptimizeNode()
   - applyOptimizedPrompt()

Estimated: **~800 lines** (similar to evolutionary-optimize-script.js which is 797 lines)

## Testing Workflow

```
1. Test bridge:
   node renderer/test-dspy-bridge.js
   → Verify Python communication

2. Test optimizer (requires DSPy + Ollama):
   node renderer/test-dspy-optimizer.js
   → Verify full optimization

3. Test node UI (after building):
   npm start
   → Add DSPy Optimize node
   → Configure dataset
   → Click Run
   → Verify results

4. Integration test:
   → Connect Prompt → DSPy Optimize
   → Run optimization
   → Apply results back to Prompt
   → Run Model with optimized prompt
```

## Performance Expectations

| Operation | Time | Notes |
|-----------|------|-------|
| Bridge startup | <100ms | Python spawn |
| Environment check | ~1s | Python + DSPy check |
| Config validation | <10ms | JavaScript side |
| BootstrapFewShot (10 ex) | 5-10 min | With Ollama |
| MIPRO light (50 ex) | 10-20 min | With Ollama |
| Result extraction | <1s | Parse compiled program |
| UI update | <50ms | DOM manipulation |

Total for small optimization: **5-10 minutes** with real-time progress updates.
