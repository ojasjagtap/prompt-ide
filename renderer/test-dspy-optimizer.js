/**
 * Test script for full DSPy optimizer (dspy_optimizer.py)
 * Tests the complete optimization workflow
 *
 * Run with: node renderer/test-dspy-optimizer.js
 */

const {
    executeDSPyOptimization,
    checkDSPyEnvironment,
    validateDSPyConfig
} = require('./dspy-worker');
const path = require('path');

console.log('='.repeat(70));
console.log('DSPy Optimizer Full Integration Test');
console.log('='.repeat(70));
console.log();

/**
 * Test configuration with simple QA examples
 */
const TEST_CONFIG = {
    model_config: {
        provider: 'ollama',
        model: 'llama3.2:1b',
        api_base: 'http://localhost:11434'
    },
    optimizer: 'BootstrapFewShot',
    optimizer_config: {
        max_bootstrapped_demos: 2,
        max_labeled_demos: 4,
        max_rounds: 1
    },
    metric_config: {
        type: 'contains',  // More lenient than exact_match for testing
        case_sensitive: false
    },
    program_type: 'predict',
    train_dataset: [
        { input: 'What is the capital of France?', output: 'Paris' },
        { input: 'What is the capital of Germany?', output: 'Berlin' },
        { input: 'What is the capital of Italy?', output: 'Rome' },
        { input: 'What is the capital of Spain?', output: 'Madrid' },
        { input: 'What is the capital of Japan?', output: 'Tokyo' }
    ],
    val_dataset: [
        { input: 'What is the capital of England?', output: 'London' },
        { input: 'What is the capital of Canada?', output: 'Ottawa' }
    ],
    save_path: path.join(__dirname, 'dspy', 'test_compiled_program')
};

/**
 * Run the full optimization test
 */
async function runOptimizationTest() {
    console.log('[Step 1] Checking environment...');
    const env = await checkDSPyEnvironment();

    console.log(`  Python: ${env.python_available ? '✓' : '✗'} ${env.python_version || ''}`);
    console.log(`  DSPy:   ${env.dspy_installed ? '✓' : '✗'} ${env.dspy_version || ''}`);

    if (!env.python_available) {
        console.error('\n✗ Python not found. Please install Python 3.8+');
        return false;
    }

    if (!env.dspy_installed) {
        console.error('\n✗ DSPy not installed. Please run: pip install dspy-ai');
        console.log('  You can also install with: pip install -r renderer/dspy/requirements.txt');
        return false;
    }

    console.log();

    console.log('[Step 2] Validating configuration...');
    const validation = validateDSPyConfig(TEST_CONFIG);

    if (!validation.valid) {
        console.error('✗ Configuration invalid:');
        validation.errors.forEach(err => console.error(`  - ${err}`));
        return false;
    }

    console.log('  ✓ Configuration valid');
    console.log();

    console.log('[Step 3] Running DSPy optimization...');
    console.log(`  Optimizer: ${TEST_CONFIG.optimizer}`);
    console.log(`  Dataset: ${TEST_CONFIG.train_dataset.length} train, ${TEST_CONFIG.val_dataset.length} val`);
    console.log(`  Model: ${TEST_CONFIG.model_config.provider}/${TEST_CONFIG.model_config.model}`);
    console.log();
    console.log('  Note: This will take a few minutes. Progress updates below:');
    console.log('  ' + '-'.repeat(66));

    try {
        const startTime = Date.now();
        let progressCount = 0;

        const result = await executeDSPyOptimization(
            TEST_CONFIG,
            (message, data) => {
                progressCount++;
                const timestamp = new Date().toLocaleTimeString();
                console.log(`  [${timestamp}] ${message}`);
                if (data) {
                    console.log(`             Data: ${JSON.stringify(data)}`);
                }
            }
        );

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log('  ' + '-'.repeat(66));
        console.log();
        console.log('✓ Optimization completed successfully!');
        console.log();
        console.log('Results:');
        console.log('  Duration:         ', duration + 's');
        console.log('  Progress Updates: ', progressCount);
        console.log('  Validation Score: ', (result.validation_score * 100).toFixed(1) + '%');
        console.log('  Optimizer:        ', result.optimizer);
        console.log('  Program Type:     ', result.program_type);
        console.log('  Predictors:       ', result.predictors.length);
        console.log('  Demos Generated:  ', result.optimized_demos.length);
        console.log('  Saved To:         ', result.compiled_program_path);
        console.log();

        if (result.optimized_signature && Object.keys(result.optimized_signature).length > 0) {
            console.log('Optimized Instructions:');
            for (const [name, instruction] of Object.entries(result.optimized_signature)) {
                console.log(`  ${name}:`);
                console.log(`    ${instruction}`);
            }
            console.log();
        }

        if (result.optimized_demos && result.optimized_demos.length > 0) {
            console.log('Sample Demonstrations:');
            result.optimized_demos.slice(0, 3).forEach((demo, i) => {
                console.log(`  Demo ${i + 1}:`);
                console.log(`    Input:  ${demo.input}`);
                console.log(`    Output: ${demo.output}`);
            });
            if (result.optimized_demos.length > 3) {
                console.log(`  ... and ${result.optimized_demos.length - 3} more`);
            }
            console.log();
        }

        console.log('Dataset Info:');
        console.log('  Training:   ', result.dataset_sizes.train, 'examples');
        console.log('  Validation: ', result.dataset_sizes.val, 'examples');
        console.log();

        return true;

    } catch (error) {
        console.log('  ' + '-'.repeat(66));
        console.log();
        console.error('✗ Optimization failed:');
        console.error('  Error:', error.message);

        if (error.message.includes('ECONNREFUSED')) {
            console.error('\n  Hint: Make sure Ollama is running (ollama serve)');
        }

        console.log();
        return false;
    }
}

/**
 * Test with different configurations
 */
async function runConfigurationTests() {
    console.log('[Additional Tests] Testing different configurations...');
    console.log();

    // Test 1: Exact match metric
    console.log('  Test 1: Exact match metric...');
    const exactMatchConfig = {
        ...TEST_CONFIG,
        metric_config: { type: 'exact_match', case_sensitive: false }
    };
    const v1 = validateDSPyConfig(exactMatchConfig);
    console.log(`    ${v1.valid ? '✓' : '✗'} Validation: ${v1.valid ? 'passed' : 'failed'}`);

    // Test 2: Chain of thought program
    console.log('  Test 2: Chain of thought program...');
    const cotConfig = {
        ...TEST_CONFIG,
        program_type: 'chain_of_thought'
    };
    const v2 = validateDSPyConfig(cotConfig);
    console.log(`    ${v2.valid ? '✓' : '✗'} Validation: ${v2.valid ? 'passed' : 'failed'}`);

    // Test 3: MIPRO optimizer
    console.log('  Test 3: MIPRO optimizer...');
    const miproConfig = {
        ...TEST_CONFIG,
        optimizer: 'MIPROv2',
        optimizer_config: {
            mode: 'light',
            num_trials: 10,
            max_bootstrapped_demos: 2,
            max_labeled_demos: 2,
            minibatch: true,
            minibatch_size: 5
        }
    };
    const v3 = validateDSPyConfig(miproConfig);
    console.log(`    ${v3.valid ? '✓' : '✗'} Validation: ${v3.valid ? 'passed' : 'failed'}`);

    // Test 4: Custom metric
    console.log('  Test 4: Custom metric...');
    const customMetricConfig = {
        ...TEST_CONFIG,
        metric_config: {
            type: 'custom',
            code: `
def metric_function(example, pred, trace=None):
    expected = str(example.answer).lower()
    predicted = str(pred.answer).lower()
    return expected in predicted
`
        }
    };
    const v4 = validateDSPyConfig(customMetricConfig);
    console.log(`    ${v4.valid ? '✓' : '✗'} Validation: ${v4.valid ? 'passed' : 'failed'}`);

    console.log();
}

/**
 * Main test runner
 */
async function main() {
    try {
        // Run configuration tests first (fast)
        await runConfigurationTests();

        // Run full optimization test (slow)
        console.log('='.repeat(70));
        console.log('Starting Full Optimization Test');
        console.log('='.repeat(70));
        console.log();

        const success = await runOptimizationTest();

        console.log('='.repeat(70));
        if (success) {
            console.log('✓ All tests passed!');
            console.log();
            console.log('Next steps:');
            console.log('1. ✓ Python bridge working');
            console.log('2. ✓ DSPy optimizer working');
            console.log('3. → Create DSPy node UI (dspy-optimize-script.js)');
            console.log('4. → Integrate with main app (script.js + index.html)');
        } else {
            console.log('✗ Tests failed');
            console.log();
            console.log('Troubleshooting:');
            console.log('- Make sure Python 3.8+ is installed');
            console.log('- Install DSPy: pip install dspy-ai');
            console.log('- Make sure Ollama is running: ollama serve');
            console.log('- Pull a model: ollama pull llama3.2:1b');
        }
        console.log('='.repeat(70));

    } catch (error) {
        console.error('Test suite error:', error);
        process.exit(1);
    }
}

// Run tests
main();
