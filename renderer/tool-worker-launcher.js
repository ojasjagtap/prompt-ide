/**
 * Tool Worker Launcher
 * Manages worker process lifecycle and IPC
 */

const { spawn } = require('child_process');
const path = require('path');

/**
 * Execute a tool in a separate process
 *
 * @param {Object} options
 * @param {string} options.code - Tool implementation code
 * @param {Object} options.args - Tool arguments
 * @param {Function} options.addLog - Logging function
 * @param {AbortSignal} options.signal - Abort signal for cancellation
 * @returns {Promise<Object>} Normalized result
 */
async function executeToolInWorker({ code, args, addLog, signal }) {
    const timeoutMs = 30000; // 30 seconds
    const memoryCapMB = 512;
    const maxOutputBytes = 5_000_000;

    return new Promise((resolve, reject) => {
        // Spawn worker process
        const workerPath = path.join(__dirname, 'tool-worker.js');
        const worker = spawn('node', [
            `--max-old-space-size=${memoryCapMB}`,
            workerPath
        ], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        let timeoutHandle = null;
        let isKilled = false;

        // Set up timeout
        timeoutHandle = setTimeout(() => {
            if (!isKilled) {
                isKilled = true;
                killWorkerProcess(worker);
                addLog('error', 'Tool execution timeout (30s limit)');
                reject(new Error('Tool execution timeout'));
            }
        }, timeoutMs);

        // Handle abort signal
        if (signal) {
            signal.addEventListener('abort', () => {
                if (!isKilled) {
                    isKilled = true;
                    killWorkerProcess(worker);
                    addLog('warn', 'Tool execution canceled');
                    reject(new Error('Tool execution canceled'));
                }
            });
        }

        // Collect stdout
        worker.stdout.on('data', (chunk) => {
            stdout += chunk.toString();

            // Check output size limit
            if (stdout.length > maxOutputBytes) {
                if (!isKilled) {
                    isKilled = true;
                    killWorkerProcess(worker);
                    addLog('error', 'Tool output exceeded 5MB limit');
                    reject(new Error('Tool output too large'));
                }
            }
        });

        // Collect stderr
        worker.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        // Handle process exit
        worker.on('close', (code) => {
            clearTimeout(timeoutHandle);

            if (isKilled) {
                return; // Already handled
            }

            try {
                const result = JSON.parse(stdout);

                // Check if result needs truncation
                if (result.ok && result.result) {
                    const resultStr = typeof result.result === 'string'
                        ? result.result
                        : JSON.stringify(result.result);

                    if (resultStr.length > maxOutputBytes) {
                        addLog('warn', 'Tool output truncated to 5MB');

                        if (typeof result.result === 'string') {
                            result.result = result.result.substring(0, maxOutputBytes);
                        }
                    }
                }

                resolve(result);
            } catch (error) {
                // Failed to parse result
                const errorResult = {
                    ok: false,
                    error: {
                        code: 'PARSE_ERROR',
                        message: `Failed to parse worker output: ${error.message}`
                    }
                };
                resolve(errorResult);
            }
        });

        worker.on('error', (error) => {
            clearTimeout(timeoutHandle);
            if (!isKilled) {
                const errorResult = {
                    ok: false,
                    error: {
                        code: 'WORKER_ERROR',
                        message: error.message
                    }
                };
                resolve(errorResult);
            }
        });

        // Send input to worker
        const input = JSON.stringify({ code, args });
        worker.stdin.write(input);
        worker.stdin.end();
    });
}

/**
 * Kill worker process and its children
 */
function killWorkerProcess(worker) {
    try {
        // Try to kill process group on Unix-like systems
        if (process.platform !== 'win32') {
            process.kill(-worker.pid);
        } else {
            // On Windows, use taskkill to kill process tree
            spawn('taskkill', ['/pid', worker.pid, '/T', '/F']);
        }
    } catch (error) {
        // Fallback to simple kill
        worker.kill('SIGKILL');
    }
}

module.exports = {
    executeToolInWorker
};
