/**
 * Main Process Entry Point
 * 
 * This file handles the Electron main process lifecycle and window management.
 * It creates the main application window and sets up event handlers.
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');

/**
 * Creates the main application window
 */
function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
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
