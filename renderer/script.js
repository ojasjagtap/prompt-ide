/**
 * Renderer Process Script
 * 
 * This file contains the client-side JavaScript that runs in the renderer process.
 * It handles UI interactions and communicates with the main process when needed.
 */

console.log("Renderer process loaded");

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    const promptInput = document.getElementById('promptInput');
    const testButton = document.getElementById('testButton');
    
    // Handle test button click
    testButton.addEventListener('click', function() {
        // Clear the textbox
        promptInput.value = '';
        console.log('Textbox cleared');
    });
});

