/**
 * Simple test server for tool calling verification
 * Serves the same content as test-file.txt on port 3000
 */

const http = require('http');

const content = `This is a test server for tool calling verification.
It contains exactly THREE important pieces of information:
1. The secret code is: BANANA-42
2. The magic number is: 7834
3. The color of the day is: PURPLE

If you can read this, the server reading tool is working correctly!`;

const server = http.createServer((req, res) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

    // CORS headers for browser access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.url === '/test-content' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(content);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Test server running at http://localhost:${PORT}/`);
    console.log(`Access test content at http://localhost:${PORT}/test-content`);
});
