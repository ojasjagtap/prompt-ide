/**
 * Tool Worker Process
 * Runs in a separate OS process for isolation
 * Communicates via stdin/stdout JSON
 */

const process = require('process');

/**
 * Main worker function
 */
async function runWorker() {
    try {
        // Read input from stdin
        const input = await readStdin();
        const request = JSON.parse(input);

        const { code, args } = request;

        // Execute the code in isolation
        const result = await executeToolCode(code, args);

        // Send result to stdout
        process.stdout.write(JSON.stringify(result) + '\n');
        process.exit(0);
    } catch (error) {
        // Send error to stdout
        const errorResult = {
            ok: false,
            error: {
                code: error.code || 'EXECUTION_ERROR',
                message: error.message
            }
        };
        process.stdout.write(JSON.stringify(errorResult) + '\n');
        process.exit(1);
    }
}

/**
 * Read all data from stdin
 */
function readStdin() {
    return new Promise((resolve, reject) => {
        const chunks = [];
        process.stdin.setEncoding('utf-8');

        process.stdin.on('data', (chunk) => {
            chunks.push(chunk);
        });

        process.stdin.on('end', () => {
            resolve(chunks.join(''));
        });

        process.stdin.on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Execute tool code and normalize result
 */
async function executeToolCode(code, args) {
    try {
        // Create a function from the code
        const fn = new Function('args', code);

        // Execute it
        const rawResult = await fn(args);

        // Normalize the result
        return normalizeResult(rawResult);
    } catch (error) {
        throw error;
    }
}

/**
 * Normalize raw result to standard envelope
 */
function normalizeResult(rawResult) {
    // Check if it's a string
    if (typeof rawResult === 'string') {
        return {
            ok: true,
            kind: 'text',
            result: rawResult
        };
    }

    // Check if it's bytes (Buffer or Uint8Array)
    if (Buffer.isBuffer(rawResult) || rawResult instanceof Uint8Array) {
        const base64 = Buffer.from(rawResult).toString('base64');
        return {
            ok: true,
            kind: 'bytes',
            result: base64
        };
    }

    // Otherwise, treat as JSON-serializable value
    return {
        ok: true,
        kind: 'json',
        result: rawResult
    };
}

// Start the worker
runWorker();
