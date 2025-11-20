/**
 * Main Process Entry Point
 * 
 * This file handles the Electron main process lifecycle and window management.
 * It creates the main application window and sets up event handlers.
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { secureStorage } = require('./secureStorage');

/**
 * Creates the main application window
 */
function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        icon: path.join(__dirname, '../assets/logo-white.png'),
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

// ============================================================================
// IPC HANDLERS FOR FILE OPERATIONS
// ============================================================================

/**
 * Handle save workflow dialog
 */
ipcMain.handle('dialog:save-file', async (event, defaultPath) => {
    const result = await dialog.showSaveDialog({
        title: 'Save Workflow',
        defaultPath: defaultPath || 'workflow.promptflow',
        filters: [
            { name: 'Prompt Flow Files', extensions: ['promptflow'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!result.canceled && result.filePath) {
        return { success: true, filePath: result.filePath };
    }
    return { success: false };
});

/**
 * Handle open workflow dialog
 */
ipcMain.handle('dialog:open-file', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Open Workflow',
        filters: [
            { name: 'Prompt Flow Files', extensions: ['promptflow'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
        return { success: true, filePath: result.filePaths[0] };
    }
    return { success: false };
});

/**
 * Handle writing file to disk
 */
ipcMain.handle('file:write', async (event, filePath, content) => {
    try {
        await fs.writeFile(filePath, content, 'utf8');
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

/**
 * Handle reading file from disk
 */
ipcMain.handle('file:read', async (event, filePath) => {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return { success: true, content };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

/**
 * Get autosave file path
 */
ipcMain.handle('file:get-autosave-path', async () => {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'autosave.promptflow');
});

/**
 * Check if file exists
 */
ipcMain.handle('file:exists', async (event, filePath) => {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
});

/**
 * Get file stats (for checking modification time)
 */
ipcMain.handle('file:get-stats', async (event, filePath) => {
    try {
        const stats = await fs.stat(filePath);
        return { success: true, mtime: stats.mtime.getTime() };
    } catch (error) {
        return { success: false };
    }
});

/**
 * Delete file
 */
ipcMain.handle('file:delete', async (event, filePath) => {
    try {
        await fs.unlink(filePath);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
