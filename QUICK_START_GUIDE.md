# DSPy Prompt Optimization - Quick Start Guide

Get started with DSPy prompt optimization in 5 minutes!

## Prerequisites (One-Time Setup)

### 1. Install Python & DSPy
```bash
# Check Python (need 3.8+)
python --version

# Install DSPy
pip install dspy-ai

# Verify installation
python -c "import dspy; print(dspy.__version__)"
```

### 2. Start Ollama (for local models)
```bash
ollama serve

# In another terminal, pull a model
ollama pull llama3.2:1b
```

**OR** use OpenAI (configure API key in Settings)

## Your First Optimization (5 minutes)

### Step 1: Launch Prompt IDE
```bash
cd C:\Users\ojasj\Documents\prompt-ide
npm start
```

### Step 2: Add Nodes (30 seconds)

From left sidebar, drag these nodes onto canvas:
1. **Prompt** node
2. **DSPy Optimize** node

### Step 3: Connect Nodes (10 seconds)

Drag from **Prompt's "prompt" pin** → **DSPy Optimize's "prompt" pin**

### Step 4: Configure Prompt (30 seconds)

1. Click **Prompt node**
2. In Inspector (right panel), enter:
   ```
   System Prompt: You are a helpful math tutor.
   ```

### Step 5: Configure DSPy Optimize (2 minutes)

1. Click **DSPy Optimize node**
2. In Inspector, set:
   - **Optimizer**: BootstrapFewShot
   - **Metric Type**: exact_match

3. Scroll to **Training Dataset**, paste this:
```json
[
  {"input": "What is 2+2?", "output": "4"},
  {"input": "What is 3+3?", "output": "6"},
  {"input": "What is 5+5?", "output": "10"},
  {"input": "What is 7+7?", "output": "14"},
  {"input": "What is 9+9?", "output": "18"}
]
```

### Step 6: Run Optimization (5-10 minutes)

1. Click **"Run Optimization"** button in Inspector
2. Watch progress in **Logs** panel (bottom right)
3. Wait for completion (you'll see progress messages)

### Step 7: View Results (30 seconds)

In Inspector, you'll see:
- **Validation Score**: e.g., 85%
- **Optimized Instructions**: The improved prompt
- **Demos**: Generated few-shot examples

### Step 8: Apply to Prompt (10 seconds)

1. Click **"Apply to Prompt Node"** button
2. Select **Prompt node**
3. See optimized instruction in System Prompt!

## What Just Happened?

DSPy:
1. ✅ Analyzed your dataset
2. ✅ Tested different prompt variations
3. ✅ Selected best few-shot examples
4. ✅ Generated optimized instruction
5. ✅ Evaluated on validation set
6. ✅ Returned best prompt (85% accuracy!)

**Instead of manual prompt engineering, DSPy optimized it automatically!**

## Try Different Configurations

### Longer Optimization (Better Results)
```json
Optimizer: MIPROv2
Mode: light
Dataset: Add 10 more examples
Time: 15-20 minutes
Expected Score: 90%+
```

### Custom Metric (More Flexible)
```json
Metric Type: contains
(Checks if answer is contained in response)
```

### Chain of Thought (For Reasoning)
```json
Program Type: chain_of_thought
(Shows step-by-step reasoning)
```

## Common Datasets

### Math Problems
```json
[
  {"input": "Solve: 3x + 5 = 14", "output": "x = 3"},
  {"input": "Solve: 2y - 8 = 6", "output": "y = 7"}
]
```

### Question Answering
```json
[
  {"input": "What is the capital of France?", "output": "Paris"},
  {"input": "What is the capital of Spain?", "output": "Madrid"}
]
```

### Text Classification
```json
[
  {"input": "This movie is amazing!", "output": "positive"},
  {"input": "Terrible waste of time", "output": "negative"}
]
```

### Summarization
```json
[
  {"input": "Long text here...", "output": "Short summary"},
  {"input": "Another long text...", "output": "Another summary"}
]
```

## Tips for Better Results

### 1. Dataset Quality
- ✅ Use 10-20 examples minimum
- ✅ Cover different types of inputs
- ✅ Ensure consistent output format
- ✅ Check for typos

### 2. Metric Selection
- **exact_match**: For precise answers (numbers, names)
- **contains**: For flexible matching
- **semantic_f1**: For semantic similarity
- **custom**: For specific needs

### 3. Optimizer Choice
- **BootstrapFewShot**: Fast, good for 10-50 examples
- **MIPRO**: Thorough, best for 50+ examples

### 4. Iteration
- Start small (5 examples, BootstrapFewShot)
- Check results
- Add more examples
- Try MIPRO for better scores

## Troubleshooting

### "Python not found"
```bash
# Windows
python --version
# If not found, download from python.org

# Mac/Linux
python3 --version
```

### "DSPy not installed"
```bash
pip install dspy-ai
# If permission error:
pip install --user dspy-ai
```

### "Connection refused"
```bash
# Make sure Ollama is running
ollama serve

# Check if model is available
ollama list
```

### "Invalid JSON in dataset"
- Check for missing commas
- Ensure all strings in quotes
- Use JSON validator online

### "Low validation scores"
- Add more examples (20+)
- Try "contains" instead of "exact_match"
- Use MIPRO instead of BootstrapFewShot
- Check output format matches examples

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| New workflow | Ctrl+N |
| Open workflow | Ctrl+O |
| Save workflow | Ctrl+S |
| Delete node | Delete/Backspace |
| Pan canvas | Space + Drag |
| Zoom | Mouse wheel |

## Example Workflows

### 1. Simple Q&A Optimization
```
Prompt → DSPy Optimize
Dataset: 10 Q&A pairs
Optimizer: BootstrapFewShot
Time: 5-10 minutes
```

### 2. Advanced Multi-Stage
```
Prompt → DSPy Optimize → Model
Dataset: 50 examples
Optimizer: MIPRO
Mode: medium
Time: 20-30 minutes
Result: Highly optimized prompt + inference
```

### 3. A/B Testing
```
Create 2 DSPy Optimize nodes
Same dataset, different optimizers
Compare results!
```

## Next Steps

### Learn More
1. Read `DSPY_PROJECT_COMPLETE.md` for full overview
2. Check `renderer/dspy/OPTIMIZER_GUIDE.md` for advanced usage
3. See `INTEGRATION_COMPLETE.md` for technical details

### Explore Features
1. Try different optimizers
2. Create custom metrics
3. Use chain of thought
4. Build dataset library
5. Save optimized prompts

### Share Results
1. Save workflows (Ctrl+S)
2. Export optimized prompts
3. Share with team
4. Document best practices

## Support

### Check Logs
- Logs panel (bottom right) shows detailed progress
- Error messages include helpful hints

### Run Tests
```bash
# Test Python bridge
node renderer/test-dspy-bridge.js

# Test full optimization
node renderer/test-dspy-optimizer.js
```

### Documentation
- All docs in project root
- Comprehensive guides available
- Examples included

## Success Metrics

After your first optimization, you should have:
- ✅ Validation score (e.g., 85%)
- ✅ Optimized instruction
- ✅ Few-shot demonstrations
- ✅ Applied prompt in workflow

**Time invested**: 5 minutes setup + 5-10 minutes optimization
**Result**: Automatically optimized prompt (better than manual!)

---

## Ready to Optimize!

You're all set! Start with the simple example above, then explore advanced features.

**Happy optimizing!** 🚀

### Quick Links
- [Full Documentation](DSPY_PROJECT_COMPLETE.md)
- [Integration Guide](INTEGRATION_COMPLETE.md)
- [Troubleshooting](INTEGRATION_COMPLETE.md#troubleshooting)
- [Advanced Features](renderer/dspy/OPTIMIZER_GUIDE.md)
