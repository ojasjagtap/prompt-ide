# DSPy Bridge Quick Start Guide

## Prerequisites

1. **Python 3.8+** installed and accessible via `python` or `python3` command
2. **DSPy library** installed: `pip install dspy-ai`

Check your environment:
```bash
node renderer/test-dspy-bridge.js
```

## Installation

### Step 1: Install Python Dependencies
```bash
cd renderer/dspy
pip install -r requirements.txt
```

### Step 2: Verify Installation
```bash
python -c "import dspy; print(dspy.__version__)"
```

Should output: `2.6.0` or higher

## Using the Bridge

### Basic Example

```javascript
const { executeDSPyOptimization } = require('./dspy-worker');

// Define configuration
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
    { input: 'What is the capital of France?', output: 'Paris' },
    { input: 'What is the capital of Spain?', output: 'Madrid' },
    { input: 'What is the capital of Italy?', output: 'Rome' }
  ],
  save_path: './my_optimized_program'
};

// Run optimization
try {
  const result = await executeDSPyOptimization(
    config,
    (message, data) => {
      console.log('[Progress]', message);
    }
  );

  console.log('✓ Optimization complete!');
  console.log('Validation Score:', result.validation_score);
  console.log('Optimized Signature:', result.optimized_signature);
  console.log('Demos:', result.optimized_demos.length);
} catch (error) {
  console.error('✗ Optimization failed:', error.message);
}
```

### With Cancellation

```javascript
const abortController = new AbortController();

// Start optimization
const optimizationPromise = executeDSPyOptimization(
  config,
  onProgress,
  abortController.signal
);

// Cancel after 10 seconds
setTimeout(() => {
  abortController.abort();
  console.log('Optimization cancelled');
}, 10000);

try {
  const result = await optimizationPromise;
} catch (error) {
  if (error.message.includes('cancelled')) {
    console.log('User cancelled optimization');
  }
}
```

## Configuration Reference

### Model Config

```javascript
model_config: {
  provider: 'ollama',        // 'ollama' | 'openai'
  model: 'llama3.2:1b',      // Model identifier
  api_key: ''                // Required for OpenAI
}
```

### Optimizer Selection

```javascript
// Simple few-shot optimization (10-50 examples)
optimizer: 'BootstrapFewShot'
optimizer_config: {
  max_bootstrapped_demos: 4,
  max_labeled_demos: 16,
  metric_threshold: 0.8      // Optional
}

// Advanced instruction + demo optimization (50-300+ examples)
optimizer: 'MIPROv2'
optimizer_config: {
  mode: 'light',             // 'light' | 'medium' | 'heavy'
  max_bootstrapped_demos: 4,
  max_labeled_demos: 4,
  num_trials: 30,
  minibatch: true,
  minibatch_size: 35
}
```

### Metrics

```javascript
// Exact string match
metric_config: {
  type: 'exact_match'
}

// Semantic similarity (F1 score)
metric_config: {
  type: 'semantic_f1'
}

// Custom metric (Python code)
metric_config: {
  type: 'custom',
  code: `
def metric_function(example, pred, trace=None):
    # Your custom metric logic
    expected = str(example.answer).lower()
    predicted = str(pred.answer).lower()
    return expected in predicted
`
}
```

### Dataset Format

```javascript
train_dataset: [
  {
    input: 'Question or input text',
    output: 'Expected answer or output'
  },
  // ... more examples
]

// Optional validation set (if omitted, auto-split from train)
val_dataset: [
  { input: '...', output: '...' }
]
```

## Helper Functions

### Check Environment

```javascript
const { checkDSPyEnvironment } = require('./dspy-worker');

const env = await checkDSPyEnvironment();
console.log('Python:', env.python_available);
console.log('DSPy:', env.dspy_installed);

if (!env.dspy_installed) {
  console.log('Error:', env.error);
}
```

### Validate Config

```javascript
const { validateDSPyConfig } = require('./dspy-worker');

const validation = validateDSPyConfig(config);
if (!validation.valid) {
  console.error('Config errors:', validation.errors);
}
```

### Install DSPy

```javascript
const { installDSPy } = require('./dspy-worker');

await installDSPy((message) => {
  console.log('[Install]', message);
});
```

## Common Issues

### "Python not found"
- Install Python 3.8+
- Add Python to PATH
- Try `python3` instead of `python`

### "DSPy not installed"
- Run: `pip install dspy-ai`
- Or: Use `installDSPy()` function

### "Process exited with code 1"
- Check Python script exists: `renderer/dspy/dspy_optimizer.py`
- Check dataset format (must have 'input' and 'output' fields)
- Check metric_config is valid

### Optimization takes too long
- Reduce `num_trials` for MIPRO
- Use smaller dataset
- Use `mode: 'light'` instead of 'heavy'
- Implement cancellation with AbortSignal

## Tips

1. **Start small**: Test with 5-10 examples first
2. **Use BootstrapFewShot**: For initial experiments (faster)
3. **Progress callbacks**: Essential for long optimizations
4. **Validation split**: Use 80/20 train/val split
5. **Save results**: Always set `save_path` to persist compiled programs

## Next Steps

1. ✅ Test the bridge: `node renderer/test-dspy-bridge.js`
2. ⏳ Implement `dspy_optimizer.py` (full DSPy integration)
3. ⏳ Create `dspy-optimize-script.js` (node UI)
4. ⏳ Integrate into main app (script.js + index.html)

## Support

- Bridge Documentation: `renderer/dspy/README.md`
- Test Suite: `renderer/test-dspy-bridge.js`
- DSPy Docs: https://dspy.ai
