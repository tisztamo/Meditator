export const debugConfig = {
    isDebugMode: false
};

// Store original console.debug
const originalConsoleDebug = console.debug.bind(console);

export function initializeDebugMode() {
    const debugMode = process.argv.includes('--debug');
    setDebugMode(debugMode);
}

export function setDebugMode(enabled) {
    debugConfig.isDebugMode = enabled;
    // Replace console.debug with no-op function when debug mode is disabled
    if (!enabled) {
        console.debug = () => {};
    } else {
        // Restore original console.debug when debug mode is enabled
        console.debug = originalConsoleDebug;
    }
}

export function isDebugMode() {
    return debugConfig.isDebugMode;
} 