/**
 * DSPy Python Bridge Worker
 * Manages Python subprocess for DSPy optimization
 * Handles bidirectional communication between Node.js and Python
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Execute DSPy optimization in Python subprocess
 * @param {Object} config - Configuration object for DSPy optimization
 * @param {Function} onProgress - Callback for progress updates (message, data)
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<Object>} - Optimization results
 */
async function executeDSPyOptimization(config, onProgress, signal = null) {
    return new Promise((resolve, reject) => {
        // Path to Python script
        const scriptPath = path.join(__dirname, 'dspy', 'dspy_optimizer.py');

        // Verify Python script exists
        if (!fs.existsSync(scriptPath)) {
            reject(new Error(`DSPy optimizer script not found at: ${scriptPath}`));
            return;
        }

        // Determine Python command
        // Use Python 3.11 on Windows where DSPy is installed, otherwise try python3
        const pythonCmd = process.platform === 'win32'
            ? 'C:\\Users\\ojasj\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
            : 'python3';

        // Spawn Python process
        let pythonProcess;
        try {
            pythonProcess = spawn(pythonCmd, [scriptPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env }
            });
        } catch (spawnError) {
            reject(new Error(`Failed to spawn Python process: ${spawnError.message}`));
            return;
        }

        let outputBuffer = '';
        let errorBuffer = '';
        let hasResolved = false;

        // Handle abort signal
        if (signal) {
            signal.addEventListener('abort', () => {
                if (!hasResolved && pythonProcess && !pythonProcess.killed) {
                    pythonProcess.kill('SIGTERM');
                    hasResolved = true;
                    reject(new Error('DSPy optimization cancelled by user'));
                }
            });
        }

        // Send configuration to Python via stdin
        try {
            const configJson = JSON.stringify(config);
            pythonProcess.stdin.write(configJson);
            pythonProcess.stdin.end();
        } catch (writeError) {
            pythonProcess.kill();
            reject(new Error(`Failed to send config to Python: ${writeError.message}`));
            return;
        }

        // Handle stdout (progress and results)
        pythonProcess.stdout.on('data', (data) => {
            const text = data.toString();
            outputBuffer += text;

            // Process complete JSON messages (line by line)
            const lines = text.split('\n');

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                try {
                    const message = JSON.parse(trimmed);

                    if (message.type === 'progress') {
                        // Progress update from Python
                        if (onProgress && typeof onProgress === 'function') {
                            onProgress(message.message, message.data || null);
                        }
                    } else if (message.type === 'success') {
                        // Optimization completed successfully
                        if (!hasResolved) {
                            hasResolved = true;
                            resolve(message);
                        }
                    } else if (message.type === 'error') {
                        // Error from Python
                        if (!hasResolved) {
                            hasResolved = true;
                            reject(new Error(message.message + (message.traceback ? '\n' + message.traceback : '')));
                        }
                    }
                } catch (parseError) {
                    // Not JSON, might be raw output or partial message
                    // Silently continue, don't spam errors
                }
            }
        });

        // Handle stderr
        pythonProcess.stderr.on('data', (data) => {
            errorBuffer += data.toString();
            // Optionally log stderr for debugging
            // console.error('[DSPy Python stderr]:', data.toString());
        });

        // Handle process exit
        pythonProcess.on('close', (code) => {
            if (!hasResolved) {
                if (code !== 0) {
                    hasResolved = true;

                    // Try to parse error from output buffer first
                    const lines = outputBuffer.split('\n');
                    for (const line of lines) {
                        try {
                            const msg = JSON.parse(line.trim());
                            if (msg.type === 'error') {
                                reject(new Error(msg.message + (msg.traceback ? '\n' + msg.traceback : '')));
                                return;
                            }
                        } catch {}
                    }

                    // Fallback to generic error
                    reject(new Error(
                        `Python process exited with code ${code}\n` +
                        `stderr: ${errorBuffer}\n` +
                        `stdout: ${outputBuffer}`
                    ));
                } else {
                    // Process exited successfully but no success message received
                    // This shouldn't happen in normal operation
                    hasResolved = true;
                    reject(new Error('Python process completed but no result received'));
                }
            }
        });

        // Handle process errors (e.g., Python not found)
        pythonProcess.on('error', (error) => {
            if (!hasResolved) {
                hasResolved = true;
                reject(new Error(
                    `Failed to start Python process: ${error.message}\n` +
                    `Make sure Python 3 is installed and accessible via '${pythonCmd}' command.`
                ));
            }
        });
    });
}

/**
 * Check if Python is available and DSPy is installed
 * @returns {Promise<Object>} - Status object with python_available, dspy_installed, version info
 */
async function checkDSPyEnvironment() {
    return new Promise((resolve) => {
        const pythonCmd = process.platform === 'win32'
            ? 'C:\\Users\\ojasj\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
            : 'python3';

        // Check if Python is available
        const pythonCheck = spawn(pythonCmd, ['--version'], { stdio: 'pipe' });

        let pythonVersion = '';
        let pythonAvailable = false;

        pythonCheck.stdout.on('data', (data) => {
            pythonVersion = data.toString().trim();
            pythonAvailable = true;
        });

        pythonCheck.stderr.on('data', (data) => {
            // Python --version sometimes outputs to stderr
            pythonVersion = data.toString().trim();
            pythonAvailable = true;
        });

        pythonCheck.on('close', (code) => {
            if (!pythonAvailable || code !== 0) {
                resolve({
                    python_available: false,
                    dspy_installed: false,
                    python_version: null,
                    dspy_version: null,
                    error: 'Python not found. Please install Python 3.8 or higher.'
                });
                return;
            }

            // Check if DSPy is installed
            const dspyCheck = spawn(pythonCmd, ['-c', 'import dspy; print(dspy.__version__)'], { stdio: 'pipe' });

            let dspyVersion = '';
            let dspyInstalled = false;

            dspyCheck.stdout.on('data', (data) => {
                dspyVersion = data.toString().trim();
                dspyInstalled = true;
            });

            dspyCheck.on('close', (code) => {
                resolve({
                    python_available: true,
                    dspy_installed: dspyInstalled && code === 0,
                    python_version: pythonVersion,
                    dspy_version: dspyVersion || null,
                    error: dspyInstalled ? null : 'DSPy not installed. Run: pip install dspy-ai'
                });
            });
        });

        pythonCheck.on('error', () => {
            resolve({
                python_available: false,
                dspy_installed: false,
                python_version: null,
                dspy_version: null,
                error: `Python command '${pythonCmd}' not found. Please install Python 3.8 or higher.`
            });
        });
    });
}

/**
 * Install DSPy via pip (requires user confirmation)
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} - Installation result
 */
async function installDSPy(onProgress) {
    return new Promise((resolve, reject) => {
        const pythonCmd = process.platform === 'win32'
            ? 'C:\\Users\\ojasj\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
            : 'python3';

        onProgress('Installing DSPy... This may take a few minutes.');

        const installProcess = spawn(pythonCmd, ['-m', 'pip', 'install', 'dspy-ai'], {
            stdio: 'pipe'
        });

        let output = '';

        installProcess.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            // Report progress
            if (text.includes('Collecting') || text.includes('Installing')) {
                onProgress(text.trim());
            }
        });

        installProcess.stderr.on('data', (data) => {
            output += data.toString();
        });

        installProcess.on('close', (code) => {
            if (code === 0) {
                onProgress('DSPy installed successfully!');
                resolve({ success: true, output });
            } else {
                reject(new Error(`DSPy installation failed with code ${code}\n${output}`));
            }
        });

        installProcess.on('error', (error) => {
            reject(new Error(`Failed to run pip: ${error.message}`));
        });
    });
}

/**
 * Validate DSPy configuration object
 * @param {Object} config - Configuration to validate
 * @returns {Object} - Validation result { valid: boolean, errors: string[] }
 */
function validateDSPyConfig(config) {
    const errors = [];

    // Check required top-level fields
    if (!config.model_config) {
        errors.push('model_config is required');
    } else {
        if (!config.model_config.provider) {
            errors.push('model_config.provider is required');
        }
        if (!config.model_config.model) {
            errors.push('model_config.model is required');
        }
    }

    if (!config.optimizer) {
        errors.push('optimizer is required');
    } else if (!['MIPRO', 'MIPROv2'].includes(config.optimizer)) {
        errors.push('optimizer must be one of: MIPRO, MIPROv2');
    }

    if (!config.optimizer_config) {
        errors.push('optimizer_config is required');
    }

    if (!config.metric_config) {
        errors.push('metric_config is required');
    } else {
        if (!config.metric_config.type) {
            errors.push('metric_config.type is required');
        }
    }

    if (!config.train_dataset || !Array.isArray(config.train_dataset)) {
        errors.push('train_dataset must be an array');
    } else if (config.train_dataset.length === 0) {
        errors.push('train_dataset must contain at least one example');
    }

    // Validate dataset structure
    if (config.train_dataset && Array.isArray(config.train_dataset)) {
        for (let i = 0; i < Math.min(config.train_dataset.length, 5); i++) {
            const example = config.train_dataset[i];
            if (!example.input) {
                errors.push(`train_dataset[${i}].input is required`);
            }
            if (!example.output) {
                errors.push(`train_dataset[${i}].output is required`);
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

module.exports = {
    executeDSPyOptimization,
    checkDSPyEnvironment,
    installDSPy,
    validateDSPyConfig
};
