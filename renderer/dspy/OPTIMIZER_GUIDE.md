# DSPy Optimizer Python Worker Guide

Complete guide to `dspy_optimizer.py` - the Python worker that performs actual DSPy optimization.

## Overview

**File**: `renderer/dspy/dspy_optimizer.py` (600+ lines)

**Purpose**: Standalone Python script that receives configuration via stdin, runs DSPy optimization, and returns results via stdout.

## Architecture

```
Node.js                Python Worker              DSPy Library
--------              ----------------            ------------
Config
  ↓
stdin  ────────────→  Parse Config
                      ↓
                      Setup LM ─────────────────→ dspy.configure()
                      ↓
                      Prepare Dataset
                      ↓
                      Create Metric
                      ↓
                      Create Program ────────────→ dspy.Module
                      ↓
                      Run Optimizer ─────────────→ BootstrapFewShot/MIPRO
                      ↓
                      Evaluate
                      ↓
                      Extract Results
                      ↓
stdout ←──────────────  Return JSON
```

## Components

### 1. Language Model Configuration

**Function**: `setup_language_model(config)`

**Supported Providers**:
- **Ollama**: Local models (llama3.2, mistral, etc.)
- **OpenAI**: GPT models (gpt-4, gpt-3.5-turbo, etc.)
- **Anthropic**: Claude models (claude-3-sonnet, etc.)

**Example**:
```python
config = {
    'provider': 'ollama',
    'model': 'llama3.2:1b',
    'api_base': 'http://localhost:11434'
}
lm = setup_language_model(config)
```

**Environment Variables**:
- `OPENAI_API_KEY` - For OpenAI provider
- `ANTHROPIC_API_KEY` - For Anthropic provider

### 2. Dataset Preparation

**Function**: `prepare_dataset(dataset_raw, dataset_name)`

**Input Format**:
```python
[
    {'input': 'question', 'output': 'answer'},
    {'input': 'question 2', 'output': 'answer 2'},
    ...
]
```

**Output**: List of `dspy.Example` objects with `.with_inputs('question')`

**Features**:
- Validates all examples have 'input' and 'output'
- Converts to DSPy Example format
- Marks 'question' as input field

### 3. Metric Creation

**Function**: `create_metric(metric_config)`

**Available Metrics**:

#### Exact Match
```python
{
    'type': 'exact_match',
    'case_sensitive': False  # optional
}
```
Checks if predicted answer exactly matches expected answer.

#### Contains
```python
{
    'type': 'contains',
    'case_sensitive': False  # optional
}
```
Checks if expected answer is contained in prediction.

#### Semantic F1
```python
{
    'type': 'semantic_f1'
}
```
Uses DSPy's SemanticF1 metric (embedding-based similarity).

#### Custom Metric
```python
{
    'type': 'custom',
    'code': '''
def metric_function(example, pred, trace=None):
    # Your custom logic
    expected = str(example.answer).lower()
    predicted = str(pred.answer).lower()
    return expected == predicted
'''
}
```

**Metric Signature**: `(example, prediction, trace=None) -> float | bool`

### 4. DSPy Program Creation

**Function**: `create_dspy_program(program_type)`

**Available Programs**:

#### Simple Predict
```python
program_type = 'predict'
```
Basic question → answer prediction.

#### Chain of Thought
```python
program_type = 'chain_of_thought'
```
Reasoning before answering (shows intermediate steps).

#### ReAct
```python
program_type = 'react'
```
Reasoning + Acting pattern (for more complex tasks).

### 5. Optimizers

#### BootstrapFewShot

**Function**: `run_bootstrap_fewshot(program, trainset, metric, config)`

**Configuration**:
```python
{
    'max_bootstrapped_demos': 4,      # Auto-generated examples
    'max_labeled_demos': 16,          # Training set examples
    'max_rounds': 1,                  # Optimization rounds
    'metric_threshold': 0.8           # Optional: minimum score
}
```

**Best For**: 10-50 examples, quick optimization (5-10 minutes)

**Process**:
1. Generate diverse examples by running program with temp=1.0
2. Filter examples using metric
3. Select best examples as demonstrations
4. Compile program with selected demos

#### MIPRO/MIPROv2

**Function**: `run_mipro(program, trainset, valset, metric, config)`

**Configuration**:
```python
{
    'mode': 'light',                  # 'light' | 'medium' | 'heavy'
    'num_trials': 30,                 # Bayesian optimization trials
    'max_bootstrapped_demos': 4,
    'max_labeled_demos': 4,
    'minibatch': True,
    'minibatch_size': 35,
    'metric_threshold': None          # Optional
}
```

**Best For**: 50-300+ examples, thorough optimization (20-60 minutes)

**Process**:
1. Bootstrap demonstration candidates
2. Generate instruction candidates (data-aware, demo-aware)
3. Bayesian optimization over instruction + demo combinations
4. Full evaluation every N trials (when minibatch enabled)
5. Return best configuration

**Modes**:
- `light`: Fast, fewer candidates (10-15 mins)
- `medium`: Balanced (20-30 mins)
- `heavy`: Thorough, many candidates (30-60 mins)

### 6. Evaluation

**Function**: `evaluate_program(program, devset, metric, num_threads)`

**Purpose**: Score the compiled program on validation set

**Returns**: Average metric score (0.0 to 1.0)

**Features**:
- Parallel evaluation with `num_threads`
- Silent mode (no progress bars to stdout)
- Returns single aggregate score

### 7. Result Extraction

**Function**: `extract_optimized_results(compiled_program)`

**Extracts**:
- **Instructions**: Optimized prompt instructions per predictor
- **Demonstrations**: Selected few-shot examples
- **Predictor Info**: Metadata about each predictor module

**Output Structure**:
```python
{
    'instructions': {
        'predictor_name': 'optimized instruction text'
    },
    'demos': [
        {
            'predictor': 'name',
            'input': 'question',
            'output': 'answer'
        },
        ...
    ],
    'predictors': [
        {
            'name': 'predict',
            'type': 'Predict',
            'instruction': '...',
            'demo_count': 4
        }
    ]
}
```

### 8. Program Saving

**Function**: `save_compiled_program(compiled_program, save_path)`

**Features**:
- Creates directory if needed
- Uses DSPy's built-in serialization
- Returns absolute path

**Saved Files**:
- Program architecture
- Optimized instructions
- Selected demonstrations
- Model weights (if fine-tuned)

## Complete Configuration Schema

```python
{
    # Language Model
    'model_config': {
        'provider': 'ollama' | 'openai' | 'anthropic',
        'model': 'model-identifier',
        'api_key': 'optional-key',
        'api_base': 'optional-base-url'
    },

    # Optimizer Selection
    'optimizer': 'BootstrapFewShot' | 'MIPRO' | 'MIPROv2',

    # Optimizer Parameters
    'optimizer_config': {
        # BootstrapFewShot
        'max_bootstrapped_demos': 4,
        'max_labeled_demos': 16,
        'max_rounds': 1,

        # MIPRO (additional)
        'mode': 'light' | 'medium' | 'heavy',
        'num_trials': 30,
        'minibatch': True,
        'minibatch_size': 35,

        # Common
        'metric_threshold': None | float
    },

    # Evaluation Metric
    'metric_config': {
        'type': 'exact_match' | 'contains' | 'semantic_f1' | 'custom',
        'case_sensitive': False,  # for exact_match/contains
        'code': 'python code'     # for custom
    },

    # Program Type
    'program_type': 'predict' | 'chain_of_thought' | 'react',

    # Datasets
    'train_dataset': [
        {'input': 'question', 'output': 'answer'},
        ...
    ],
    'val_dataset': [  # Optional, will auto-split if omitted
        {'input': 'question', 'output': 'answer'},
        ...
    ],

    # Output
    'save_path': './path/to/save/compiled/program'
}
```

## Output Messages

### Progress Messages
```json
{
    "type": "progress",
    "message": "Starting optimization...",
    "data": {"optional": "metadata"}
}
```

### Success Result
```json
{
    "type": "success",
    "validation_score": 0.85,
    "optimized_signature": {
        "predictor_name": "instruction text"
    },
    "optimized_demos": [
        {"predictor": "...", "input": "...", "output": "..."}
    ],
    "predictors": [
        {"name": "...", "type": "...", "demo_count": 4}
    ],
    "compiled_program_path": "/absolute/path/to/saved/program",
    "dataset_sizes": {
        "train": 10,
        "val": 2
    },
    "optimizer": "BootstrapFewShot",
    "program_type": "predict"
}
```

### Error Result
```json
{
    "type": "error",
    "message": "Error description",
    "traceback": "Full Python traceback..."
}
```

## Error Handling

The script handles:
- ✅ Missing DSPy library
- ✅ Invalid configuration
- ✅ Empty datasets
- ✅ Missing input/output fields
- ✅ Custom metric compilation errors
- ✅ Language model connection errors
- ✅ Optimization failures
- ✅ Save failures

All errors are caught and returned as JSON error messages.

## Testing

### Unit Test
```bash
# Test with test_bridge.py
echo '{"test": true}' | python renderer/dspy/test_bridge.py
```

### Integration Test
```bash
# Full optimization test
node renderer/test-dspy-optimizer.js
```

## Performance Characteristics

| Optimizer | Dataset Size | Time | Trials | Output |
|-----------|--------------|------|--------|--------|
| BootstrapFewShot | 10-50 | 5-10 min | ~5-10 | Few-shot demos |
| MIPRO (light) | 50-100 | 10-15 min | ~20-30 | Instructions + demos |
| MIPRO (medium) | 100-200 | 20-30 min | ~50-100 | Instructions + demos |
| MIPRO (heavy) | 200-300+ | 30-60 min | ~100-200 | Instructions + demos |

## Best Practices

1. **Start Small**: Test with 5-10 examples first
2. **Use Validation Split**: 80/20 or 70/30 train/val
3. **Choose Right Optimizer**:
   - Few examples (5-20): BootstrapFewShot
   - Medium dataset (20-100): BootstrapFewShot or MIPRO light
   - Large dataset (100+): MIPRO medium/heavy
4. **Metric Selection**:
   - Exact tasks: exact_match
   - Fuzzy matching: contains or semantic_f1
   - Complex: custom metric
5. **Save Results**: Always specify save_path
6. **Monitor Progress**: Use progress callbacks in Node.js

## Dependencies

Required:
- `dspy-ai>=2.6.0`
- `cloudpickle>=2.0.0`

Optional (for better performance):
- `numpy`
- `pandas`

Install:
```bash
pip install -r renderer/dspy/requirements.txt
```

## Debugging

Enable verbose output by checking stderr from Node.js:
```javascript
pythonProcess.stderr.on('data', (data) => {
    console.error('[Python stderr]:', data.toString());
});
```

Common issues:
- **"DSPy not found"**: Install with `pip install dspy-ai`
- **Connection refused**: Start Ollama with `ollama serve`
- **Timeout**: Increase timeout, reduce dataset size, or use lighter mode
- **Low scores**: More/better examples, different metric, or try MIPRO

## Next Steps

1. ✅ Python worker complete
2. → Create node UI (`dspy-optimize-script.js`)
3. → Integrate with main app
4. → Add dataset upload/management
5. → Add progress visualization
