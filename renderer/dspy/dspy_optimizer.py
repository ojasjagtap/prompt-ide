#!/usr/bin/env python3
"""
DSPy Optimization Worker
Runs actual DSPy optimization and returns results to Node.js

Communication Protocol:
- Input: JSON configuration via stdin
- Output: JSON messages via stdout (line-delimited)

Message Types:
- {'type': 'progress', 'message': '...', 'data': {...}}
- {'type': 'success', 'validation_score': 0.85, ...}
- {'type': 'error', 'message': '...', 'traceback': '...'}
"""

import sys
import json
import os
from typing import List, Dict, Any, Callable, Optional
import traceback

def log_progress(message: str, data: Optional[Dict] = None):
    """Send progress message to Node.js"""
    progress = {'type': 'progress', 'message': message}
    if data:
        progress['data'] = data
    print(json.dumps(progress), flush=True)


def log_error(message: str, tb: Optional[str] = None):
    """Send error message to Node.js"""
    error = {'type': 'error', 'message': message}
    if tb:
        error['traceback'] = tb
    print(json.dumps(error), flush=True)


# ============================================================================
# LANGUAGE MODEL CONFIGURATION
# ============================================================================

def setup_language_model(config: Dict[str, Any]):
    """
    Configure DSPy language model based on config

    Args:
        config: {
            'provider': 'ollama' | 'openai' | 'anthropic',
            'model': 'model-name',
            'api_key': 'optional-api-key',
            'api_base': 'optional-base-url'
        }

    Returns:
        Configured DSPy LM instance
    """
    import dspy

    provider = config.get('provider', 'ollama')
    model_id = config.get('model', 'llama3.2:1b')
    api_key = config.get('api_key', '')
    api_base = config.get('api_base')

    log_progress(f"Configuring {provider} with model {model_id}")

    if provider == 'ollama':
        # Ollama local models
        base_url = api_base or 'http://localhost:11434'
        lm = dspy.LM(
            model=f'ollama_chat/{model_id}',
            api_base=base_url,
            api_key=''
        )

    elif provider == 'openai':
        # OpenAI models
        if not api_key:
            # Try environment variable
            api_key = os.environ.get('OPENAI_API_KEY', '')

        lm = dspy.LM(
            model=f'openai/{model_id}',
            api_key=api_key
        )

    elif provider == 'anthropic':
        # Anthropic Claude models
        if not api_key:
            api_key = os.environ.get('ANTHROPIC_API_KEY', '')

        lm = dspy.LM(
            model=f'anthropic/{model_id}',
            api_key=api_key
        )

    else:
        raise ValueError(f"Unsupported provider: {provider}. Use 'ollama', 'openai', or 'anthropic'.")

    # Configure DSPy to use this model
    dspy.configure(lm=lm)

    log_progress("Language model configured successfully")
    return lm


# ============================================================================
# DATASET PREPARATION
# ============================================================================

def prepare_dataset(dataset_raw: List[Dict[str, Any]], dataset_name: str = "dataset") -> List:
    """
    Convert raw dataset to DSPy Examples

    Args:
        dataset_raw: List of {'input': '...', 'output': '...'}
        dataset_name: Name for logging

    Returns:
        List of dspy.Example objects
    """
    import dspy

    if not dataset_raw or len(dataset_raw) == 0:
        raise ValueError(f"{dataset_name} is empty")

    examples = []

    for i, item in enumerate(dataset_raw):
        if 'input' not in item or 'output' not in item:
            raise ValueError(f"{dataset_name}[{i}] missing 'input' or 'output' field")

        # Create DSPy Example with question -> answer signature
        # .with_inputs() marks which fields are inputs (vs outputs)
        example = dspy.Example(
            question=str(item['input']),
            answer=str(item['output'])
        ).with_inputs('question')

        examples.append(example)

    log_progress(f"Prepared {len(examples)} examples for {dataset_name}")
    return examples


# ============================================================================
# METRIC CREATION
# ============================================================================

def create_metric(metric_config: Dict[str, Any]) -> Callable:
    """
    Create metric function based on configuration

    Args:
        metric_config: {
            'type': 'exact_match' | 'semantic_f1' | 'contains' | 'custom',
            'code': 'python code for custom metric',
            'case_sensitive': bool (optional)
        }

    Returns:
        Metric function: (example, prediction, trace) -> float/bool
    """
    import dspy

    metric_type = metric_config.get('type', 'exact_match')
    log_progress(f"Creating metric: {metric_type}")

    if metric_type == 'exact_match':
        # Simple exact string match metric
        case_sensitive = metric_config.get('case_sensitive', False)

        def exact_match_metric(example, pred, trace=None):
            """Exact match between expected and predicted answer"""
            if not hasattr(pred, 'answer'):
                return False

            expected = str(example.answer)
            predicted = str(pred.answer)

            if not case_sensitive:
                expected = expected.strip().lower()
                predicted = predicted.strip().lower()
            else:
                expected = expected.strip()
                predicted = predicted.strip()

            return expected == predicted

        return exact_match_metric

    elif metric_type == 'contains':
        # Check if expected answer is contained in prediction
        case_sensitive = metric_config.get('case_sensitive', False)

        def contains_metric(example, pred, trace=None):
            """Check if expected answer is contained in prediction"""
            if not hasattr(pred, 'answer'):
                return False

            expected = str(example.answer)
            predicted = str(pred.answer)

            if not case_sensitive:
                expected = expected.strip().lower()
                predicted = predicted.strip().lower()

            return expected in predicted

        return contains_metric

    elif metric_type == 'semantic_f1':
        # Use DSPy's built-in SemanticF1 metric
        # This compares semantic similarity using embeddings
        try:
            from dspy.evaluate import SemanticF1
            return SemanticF1()
        except ImportError:
            log_progress("SemanticF1 not available, falling back to exact match")
            return create_metric({'type': 'exact_match'})

    elif metric_type == 'custom':
        # Execute custom metric code
        custom_code = metric_config.get('code', '')

        if not custom_code or not custom_code.strip():
            raise ValueError("Custom metric requires 'code' field with Python function")

        log_progress("Compiling custom metric code")

        # Create execution environment with dspy available
        exec_globals = {
            'dspy': dspy,
            '__builtins__': __builtins__
        }

        try:
            # Execute the custom code
            exec(custom_code, exec_globals)

            # Look for metric_function in the namespace
            if 'metric_function' not in exec_globals:
                raise ValueError("Custom metric code must define 'metric_function'")

            metric_fn = exec_globals['metric_function']

            # Validate it's callable
            if not callable(metric_fn):
                raise ValueError("metric_function must be a callable function")

            log_progress("Custom metric compiled successfully")
            return metric_fn

        except Exception as e:
            raise ValueError(f"Failed to compile custom metric: {str(e)}")

    else:
        raise ValueError(f"Unknown metric type: {metric_type}. Use 'exact_match', 'contains', 'semantic_f1', or 'custom'.")


# ============================================================================
# DSPY PROGRAM DEFINITION
# ============================================================================

def create_dspy_program(program_type: str = 'predict') -> Any:
    """
    Create DSPy program/module based on type

    Args:
        program_type: 'predict' | 'chain_of_thought' | 'react'

    Returns:
        DSPy Module instance
    """
    import dspy

    log_progress(f"Creating DSPy program: {program_type}")

    if program_type == 'predict':
        # Simple prediction module
        class SimpleQA(dspy.Module):
            def __init__(self):
                super().__init__()
                self.predict = dspy.Predict("question -> answer")

            def forward(self, question):
                return self.predict(question=question)

        return SimpleQA()

    elif program_type == 'chain_of_thought':
        # Chain of thought reasoning
        class ChainOfThoughtQA(dspy.Module):
            def __init__(self):
                super().__init__()
                self.generate_answer = dspy.ChainOfThought("question -> answer")

            def forward(self, question):
                return self.generate_answer(question=question)

        return ChainOfThoughtQA()

    elif program_type == 'react':
        # ReAct (Reasoning + Acting)
        class ReActQA(dspy.Module):
            def __init__(self):
                super().__init__()
                self.generate_answer = dspy.ReAct("question -> answer")

            def forward(self, question):
                return self.generate_answer(question=question)

        return ReActQA()

    else:
        # Default to simple predict
        log_progress(f"Unknown program type '{program_type}', using 'predict'")
        return create_dspy_program('predict')


# ============================================================================
# OPTIMIZERS
# ============================================================================

def run_bootstrap_fewshot(
    program: Any,
    trainset: List,
    metric: Callable,
    config: Dict[str, Any]
) -> Any:
    """
    Run BootstrapFewShot optimization

    Args:
        program: DSPy module to optimize
        trainset: Training examples
        metric: Evaluation metric
        config: Optimizer configuration

    Returns:
        Compiled DSPy program
    """
    import dspy
    from dspy.teleprompt import BootstrapFewShot

    log_progress("Starting BootstrapFewShot optimization")

    max_bootstrapped = config.get('max_bootstrapped_demos', 4)
    max_labeled = config.get('max_labeled_demos', 16)
    metric_threshold = config.get('metric_threshold')
    max_rounds = config.get('max_rounds', 1)

    log_progress(f"Config: max_bootstrapped={max_bootstrapped}, max_labeled={max_labeled}")

    # Create optimizer
    optimizer = BootstrapFewShot(
        metric=metric,
        max_bootstrapped_demos=max_bootstrapped,
        max_labeled_demos=max_labeled,
        max_rounds=max_rounds
    )

    if metric_threshold is not None:
        optimizer.metric_threshold = metric_threshold

    # Compile the program
    log_progress("Compiling program with BootstrapFewShot...")
    compiled_program = optimizer.compile(
        student=program,
        trainset=trainset
    )

    log_progress("BootstrapFewShot optimization complete")
    return compiled_program


def run_mipro(
    program: Any,
    trainset: List,
    valset: List,
    metric: Callable,
    config: Dict[str, Any]
) -> Any:
    """
    Run MIPRO/MIPROv2 optimization

    Args:
        program: DSPy module to optimize
        trainset: Training examples
        valset: Validation examples
        metric: Evaluation metric
        config: Optimizer configuration

    Returns:
        Compiled DSPy program
    """
    import dspy
    from dspy.teleprompt import MIPROv2

    log_progress("Starting MIPROv2 optimization")

    mode = config.get('mode', 'light')
    num_trials = config.get('num_trials', 30)
    max_bootstrapped = config.get('max_bootstrapped_demos', 4)
    max_labeled = config.get('max_labeled_demos', 4)
    minibatch = config.get('minibatch', True)
    minibatch_size = config.get('minibatch_size', 35)
    metric_threshold = config.get('metric_threshold')

    log_progress(f"Config: mode={mode}, trials={num_trials}, minibatch={minibatch}")

    # Create optimizer
    optimizer_kwargs = {
        'metric': metric,
        'auto': mode,
        'max_bootstrapped_demos': max_bootstrapped,
        'max_labeled_demos': max_labeled,
        'verbose': True,
        'track_stats': True
    }

    if metric_threshold is not None:
        optimizer_kwargs['metric_threshold'] = metric_threshold

    optimizer = MIPROv2(**optimizer_kwargs)

    # Compile the program
    log_progress(f"Compiling program with MIPROv2 (this may take several minutes)...")
    compiled_program = optimizer.compile(
        student=program,
        trainset=trainset,
        valset=valset,
        num_trials=num_trials,
        minibatch=minibatch,
        minibatch_size=minibatch_size
    )

    log_progress("MIPROv2 optimization complete")
    return compiled_program


# ============================================================================
# EVALUATION
# ============================================================================

def evaluate_program(
    program: Any,
    devset: List,
    metric: Callable,
    num_threads: int = 1
) -> float:
    """
    Evaluate compiled program on dev set

    Args:
        program: DSPy module to evaluate
        devset: Evaluation examples
        metric: Evaluation metric
        num_threads: Number of threads for parallel evaluation

    Returns:
        Average metric score
    """
    import dspy
    from dspy.evaluate import Evaluate

    log_progress(f"Evaluating program on {len(devset)} examples")

    evaluator = Evaluate(
        devset=devset,
        metric=metric,
        num_threads=num_threads,
        display_progress=False,
        display_table=False
    )

    score = evaluator(program)

    log_progress(f"Evaluation complete: score = {score:.3f}")
    return score


# ============================================================================
# RESULT EXTRACTION
# ============================================================================

def extract_optimized_results(compiled_program: Any) -> Dict[str, Any]:
    """
    Extract optimized signature, instructions, and demos from compiled program

    Args:
        compiled_program: Compiled DSPy module

    Returns:
        Dictionary with optimized components
    """
    log_progress("Extracting optimized components")

    results = {
        'instructions': {},
        'demos': [],
        'predictors': []
    }

    try:
        # Iterate through all predictors in the program
        for name, module in compiled_program.named_predictors():
            predictor_info = {
                'name': name,
                'type': type(module).__name__
            }

            # Extract instructions if available
            if hasattr(module, 'extended_signature'):
                sig = module.extended_signature
                instruction = getattr(sig, 'instructions', '')
                if instruction:
                    results['instructions'][name] = instruction
                    predictor_info['instruction'] = instruction

            # Extract demonstrations if available
            if hasattr(module, 'demos'):
                demo_count = len(module.demos)
                predictor_info['demo_count'] = demo_count

                # Extract up to 10 demos for display
                for i, demo in enumerate(module.demos[:10]):
                    demo_dict = {
                        'predictor': name,
                        'input': str(demo.question) if hasattr(demo, 'question') else '',
                        'output': str(demo.answer) if hasattr(demo, 'answer') else ''
                    }
                    results['demos'].append(demo_dict)

            results['predictors'].append(predictor_info)

        log_progress(f"Extracted {len(results['predictors'])} predictors, {len(results['demos'])} demos")

    except Exception as e:
        log_progress(f"Warning: Could not fully extract results: {str(e)}")

    return results


# ============================================================================
# SAVE COMPILED PROGRAM
# ============================================================================

def save_compiled_program(compiled_program: Any, save_path: str) -> str:
    """
    Save compiled DSPy program to disk

    Args:
        compiled_program: Compiled DSPy module
        save_path: Directory path to save program

    Returns:
        Absolute path where program was saved
    """
    import os

    log_progress(f"Saving compiled program to {save_path}")

    try:
        # Create directory if it doesn't exist
        os.makedirs(save_path, exist_ok=True)

        # Save the program (DSPy handles serialization)
        compiled_program.save(save_path)

        abs_path = os.path.abspath(save_path)
        log_progress(f"Program saved successfully to {abs_path}")

        return abs_path

    except Exception as e:
        log_progress(f"Warning: Failed to save program: {str(e)}")
        return save_path


# ============================================================================
# MAIN OPTIMIZATION WORKFLOW
# ============================================================================

def main():
    """Main optimization workflow"""

    try:
        # Step 1: Read configuration from stdin
        log_progress("Reading configuration from stdin...")
        config_json = sys.stdin.read()

        if not config_json or not config_json.strip():
            raise ValueError("No configuration received on stdin")

        log_progress("Parsing configuration...")
        config = json.loads(config_json)

        log_progress("Configuration loaded successfully")

        # Step 2: Import DSPy (check if installed)
        log_progress("Importing DSPy library...")
        try:
            import dspy
            log_progress(f"DSPy version {dspy.__version__} loaded")
        except ImportError as e:
            raise ImportError(
                "DSPy library not found. Please install it with: pip install dspy-ai"
            )

        # Step 3: Setup language model
        log_progress("Setting up language model...")
        lm = setup_language_model(config['model_config'])

        # Step 4: Prepare datasets
        log_progress("Preparing datasets...")
        trainset = prepare_dataset(config['train_dataset'], 'train_dataset')

        # Handle validation set
        if 'val_dataset' in config and config['val_dataset']:
            valset = prepare_dataset(config['val_dataset'], 'val_dataset')
        else:
            # Auto-split: 80% train, 20% val
            split_idx = int(len(trainset) * 0.8)
            if split_idx < len(trainset):
                valset = trainset[split_idx:]
                trainset = trainset[:split_idx]
                log_progress(f"Auto-split dataset: {len(trainset)} train, {len(valset)} val")
            else:
                # Dataset too small, use all for train and val
                valset = trainset
                log_progress("Dataset too small for split, using same data for train and val")

        # Step 5: Create metric
        log_progress("Creating evaluation metric...")
        metric = create_metric(config['metric_config'])

        # Step 6: Create DSPy program
        program_type = config.get('program_type', 'predict')
        program = create_dspy_program(program_type)
        log_progress(f"DSPy program created: {type(program).__name__}")

        # Step 7: Run optimization
        optimizer_type = config.get('optimizer', 'BootstrapFewShot')
        optimizer_config = config.get('optimizer_config', {})

        log_progress(f"Starting {optimizer_type} optimization...")

        if optimizer_type == 'BootstrapFewShot':
            compiled_program = run_bootstrap_fewshot(
                program, trainset, metric, optimizer_config
            )
        elif optimizer_type in ['MIPRO', 'MIPROv2']:
            compiled_program = run_mipro(
                program, trainset, valset, metric, optimizer_config
            )
        else:
            raise ValueError(f"Unknown optimizer: {optimizer_type}")

        # Step 8: Evaluate compiled program
        log_progress("Evaluating optimized program...")
        validation_score = evaluate_program(compiled_program, valset, metric)

        # Step 9: Extract results
        log_progress("Extracting optimization results...")
        extracted_results = extract_optimized_results(compiled_program)

        # Step 10: Save compiled program
        save_path = config.get('save_path', './dspy_compiled_program')
        saved_path = save_compiled_program(compiled_program, save_path)

        # Step 11: Return success result
        log_progress("Optimization complete!")

        success_result = {
            'type': 'success',
            'validation_score': float(validation_score),
            'optimized_signature': extracted_results['instructions'],
            'optimized_demos': extracted_results['demos'],
            'predictors': extracted_results['predictors'],
            'compiled_program_path': saved_path,
            'dataset_sizes': {
                'train': len(trainset),
                'val': len(valset)
            },
            'optimizer': optimizer_type,
            'program_type': program_type
        }

        print(json.dumps(success_result), flush=True)
        sys.exit(0)

    except Exception as e:
        # Catch all exceptions and return error
        error_msg = str(e)
        error_trace = traceback.format_exc()

        log_error(error_msg, error_trace)
        sys.exit(1)


if __name__ == '__main__':
    main()
