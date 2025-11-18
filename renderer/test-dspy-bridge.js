/**
 * Test script for DSPy Python Bridge
 * Run with: node renderer/test-dspy-bridge.js
 */

const {
    checkDSPyEnvironment,
    validateDSPyConfig,
    executeDSPyOptimization
} = require('./dspy-worker');
const { spawn } = require('child_process');
const path = require('path');

console.log('='.repeat(60));
console.log('DSPy Python Bridge Test Suite');
console.log('='.repeat(60));
console.log();

/**
 * Test 1: Check Python and DSPy environment
 */
async function testEnvironmentCheck() {
    console.log('[Test 1] Checking Python and DSPy environment...');
    try {
        const env = await checkDSPyEnvironment();
        console.log('✓ Environment check completed');
        console.log(`  Python Available: ${env.python_available}`);
        console.log(`  Python Version: ${env.python_version || 'N/A'}`);
        console.log(`  DSPy Installed: ${env.dspy_installed}`);
        console.log(`  DSPy Version: ${env.dspy_version || 'N/A'}`);
        if (env.error) {
            console.log(`  ⚠ Warning: ${env.error}`);
        }
        console.log();
        return env.python_available;
    } catch (error) {
        console.error('✗ Environment check failed:', error.message);
        console.log();
        return false;
    }
}

/**
 * Test 2: Validate configuration validation
 */
function testConfigValidation() {
    console.log('[Test 2] Testing configuration validation...');

    // Test valid config
    const validConfig = {
        model_config: {
            provider: 'ollama',
            model: 'llama3.2:1b'
        },
        optimizer: 'BootstrapFewShot',
        optimizer_config: {
            max_bootstrapped_demos: 4
        },
        metric_config: {
            type: 'exact_match'
        },
        train_dataset: [
            { input: 'test', output: 'result' }
        ]
    };

    const validResult = validateDSPyConfig(validConfig);
    if (validResult.valid) {
        console.log('✓ Valid config passed validation');
    } else {
        console.error('✗ Valid config failed:', validResult.errors);
        return false;
    }

    // Test invalid config (missing required fields)
    const invalidConfig = {
        model_config: {
            provider: 'ollama'
            // missing model
        },
        optimizer: 'InvalidOptimizer',
        train_dataset: [] // empty
    };

    const invalidResult = validateDSPyConfig(invalidConfig);
    if (!invalidResult.valid && invalidResult.errors.length > 0) {
        console.log('✓ Invalid config correctly rejected');
        console.log(`  Caught ${invalidResult.errors.length} validation errors`);
    } else {
        console.error('✗ Invalid config should have been rejected');
        return false;
    }

    console.log();
    return true;
}

/**
 * Test 3: Test Python bridge communication
 */
async function testBridgeCommunication() {
    console.log('[Test 3] Testing Python bridge communication...');

    const testConfig = {
        test_mode: true,
        model_config: {
            provider: 'ollama',
            model: 'test-model'
        },
        optimizer: 'BootstrapFewShot',
        optimizer_config: {
            max_bootstrapped_demos: 2
        },
        metric_config: {
            type: 'exact_match'
        },
        train_dataset: [
            { input: 'hello', output: 'world' }
        ]
    };

    try {
        // Use test bridge script
        const scriptPath = path.join(__dirname, 'dspy', 'test_bridge.py');
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

        const result = await new Promise((resolve, reject) => {
            const pythonProcess = spawn(pythonCmd, [scriptPath], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let progressCount = 0;
            let outputBuffer = '';

            pythonProcess.stdin.write(JSON.stringify(testConfig));
            pythonProcess.stdin.end();

            pythonProcess.stdout.on('data', (data) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const message = JSON.parse(line);
                        if (message.type === 'progress') {
                            progressCount++;
                            console.log(`  Progress: ${message.message}`);
                        } else if (message.type === 'success') {
                            resolve({ ...message, progressCount });
                        } else if (message.type === 'error') {
                            reject(new Error(message.message));
                        }
                    } catch {}
                }
            });

            pythonProcess.stderr.on('data', (data) => {
                // Ignore stderr for test
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Process exited with code ${code}`));
                }
            });

            pythonProcess.on('error', (error) => {
                reject(new Error(`Failed to start Python: ${error.message}`));
            });

            // Timeout after 10 seconds
            setTimeout(() => {
                pythonProcess.kill();
                reject(new Error('Test timed out after 10 seconds'));
            }, 10000);
        });

        console.log('✓ Bridge communication successful');
        console.log(`  Received ${result.progressCount} progress updates`);
        console.log(`  Python version: ${result.python_version.split('\n')[0]}`);
        console.log(`  DSPy available: ${result.dspy_available}`);
        console.log();
        return true;
    } catch (error) {
        console.error('✗ Bridge communication failed:', error.message);
        console.log();
        return false;
    }
}

/**
 * Run all tests
 */
async function runTests() {
    let allPassed = true;

    const pythonAvailable = await testEnvironmentCheck();
    if (!pythonAvailable) {
        console.log('⚠ Python not available, skipping bridge communication test');
        console.log('  Please install Python 3.8+ to continue');
        console.log();
    }

    allPassed = testConfigValidation() && allPassed;

    if (pythonAvailable) {
        allPassed = await testBridgeCommunication() && allPassed;
    }

    console.log('='.repeat(60));
    if (allPassed) {
        console.log('✓ All tests passed!');
        console.log();
        console.log('Next steps:');
        console.log('1. Install DSPy: pip install dspy-ai');
        console.log('2. Implement the full dspy_optimizer.py script');
        console.log('3. Create the DSPy node UI (dspy-optimize-script.js)');
    } else {
        console.log('✗ Some tests failed');
    }
    console.log('='.repeat(60));
}

// Run tests
runTests().catch(error => {
    console.error('Test suite error:', error);
    process.exit(1);
});
