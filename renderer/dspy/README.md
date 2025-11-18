# DSPy Python Bridge

This directory contains the Python bridge components for DSPy optimization integration.

## Architecture

```
Node.js (Electron Renderer)
        ↓
dspy-worker.js (Bridge)
        ↓
Python Subprocess
        ↓
dspy_optimizer.py (DSPy Integration)
        ↓
DSPy Library
```

## Components

### 1. `dspy-worker.js` (Node.js Bridge)
Located in `renderer/dspy-worker.js`

**Functions:**
- `executeDSPyOptimization(config, onProgress, signal)` - Main function to run DSPy optimization
- `checkDSPyEnvironment()` - Check if Python and DSPy are installed
- `installDSPy(onProgress)` - Install DSPy via pip
- `validateDSPyConfig(config)` - Validate configuration before sending to Python

**Communication Protocol:**
- **Input**: JSON config via stdin
- **Output**: JSON messages via stdout (line-delimited)

**Message Types:**
```javascript
// Progress update
{ type: 'progress', message: 'Starting optimization...', data: {...} }

// Success result
{ type: 'success', validation_score: 0.85, optimized_signature: {...}, ... }

// Error
{ type: 'error', message: 'Error description', traceback: '...' }
```

### 2. `dspy_optimizer.py` (Python Worker)
**Status**: To be implemented

This script will:
- Read configuration from stdin
- Configure DSPy language models
- Prepare datasets
- Run optimization (BootstrapFewShot, MIPRO, etc.)
- Stream progress updates
- Return results

### 3. `requirements.txt`
Python dependencies:
```
dspy-ai>=2.6.0
cloudpickle>=2.0.0
```

Install with:
```bash
pip install -r requirements.txt
```

## Configuration Object

The bridge expects a configuration object with the following structure:

```javascript
{
  // Language model configuration
  model_config: {
    provider: 'ollama' | 'openai',
    model: 'llama3.2:1b',
    api_key: '' // For OpenAI
  },

  // Optimizer selection
  optimizer: 'BootstrapFewShot' | 'MIPRO' | 'MIPROv2',

  // Optimizer-specific parameters
  optimizer_config: {
    max_bootstrapped_demos: 4,
    max_labeled_demos: 16,
    num_trials: 30,        // For MIPRO
    minibatch: true,       // For MIPRO
    minibatch_size: 35,    // For MIPRO
    mode: 'light',         // For MIPRO: 'light' | 'medium' | 'heavy'
    metric_threshold: null // Optional
  },

  // Metric configuration
  metric_config: {
    type: 'exact_match' | 'semantic_f1' | 'custom',
    code: '' // Python code for custom metric
  },

  // Training data
  train_dataset: [
    { input: 'question', output: 'answer' },
    ...
  ],

  // Validation data (optional, will split from train if not provided)
  val_dataset: [
    { input: 'question', output: 'answer' },
    ...
  ],

  // Where to save compiled program
  save_path: './path/to/save'
}
```

## Testing

Run the test suite to verify the bridge:

```bash
node renderer/test-dspy-bridge.js
```

This will:
1. Check Python environment
2. Validate configuration handling
3. Test bridge communication with test_bridge.py

## Usage Example

```javascript
const { executeDSPyOptimization } = require('./dspy-worker');

const config = {
  model_config: {
    provider: 'ollama',
    model: 'llama3.2:1b'
  },
  optimizer: 'BootstrapFewShot',
  optimizer_config: {
    max_bootstrapped_demos: 4,
    max_labeled_demos: 16
  },
  metric_config: {
    type: 'exact_match'
  },
  train_dataset: [
    { input: 'What is 2+2?', output: '4' },
    { input: 'What is 3+3?', output: '6' }
  ]
};

try {
  const result = await executeDSPyOptimization(
    config,
    (message, data) => {
      console.log('Progress:', message);
    },
    signal // Optional AbortSignal for cancellation
  );

  console.log('Optimization complete!');
  console.log('Score:', result.validation_score);
  console.log('Optimized signature:', result.optimized_signature);
} catch (error) {
  console.error('Optimization failed:', error);
}
```

## Error Handling

The bridge handles:
- Python not installed
- DSPy not installed
- Invalid configuration
- Python process crashes
- Cancellation via AbortSignal
- Malformed JSON from Python
- Timeout scenarios

## Next Steps

1. **Install DSPy**: `pip install dspy-ai`
2. **Implement `dspy_optimizer.py`**: Full DSPy optimization script
3. **Create Node UI**: `dspy-optimize-script.js` for the node interface
4. **Integrate with main app**: Add to script.js and index.html

## Security Considerations

- Python subprocess runs with same permissions as Electron app
- No shell=true used (prevents injection attacks)
- Configuration validated before sending to Python
- stderr captured separately from stdout
- Process properly cleaned up on error or cancellation

## Compatibility

- **Node.js**: Requires child_process module (built-in)
- **Python**: Requires Python 3.8+
- **Platforms**: Windows, macOS, Linux
- **DSPy**: Version 2.6.0 or higher (for save/load support)
