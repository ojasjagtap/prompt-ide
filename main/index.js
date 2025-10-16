/**
 * Main Process Entry Point
 * 
 * This file handles the Electron main process lifecycle and window management.
 * It creates the main application window and sets up event handlers.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { secureStorage } = require('./secureStorage');

/**
 * Creates the main application window
 */
function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Load the renderer HTML file
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// ============================================================================
// IPC HANDLERS FOR SECURE STORAGE
// ============================================================================

/**
 * Handle storing an API key securely
 */
ipcMain.handle('secure-storage:set', async (event, providerId, apiKey) => {
    return await secureStorage.setApiKey(providerId, apiKey);
});

/**
 * Handle retrieving an API key
 */
ipcMain.handle('secure-storage:get', async (event, providerId) => {
    return await secureStorage.getApiKey(providerId);
});

/**
 * Handle removing an API key
 */
ipcMain.handle('secure-storage:remove', async (event, providerId) => {
    return await secureStorage.removeApiKey(providerId);
});

/**
 * Handle checking if an API key exists
 */
ipcMain.handle('secure-storage:has', async (event, providerId) => {
    return await secureStorage.hasApiKey(providerId);
});
