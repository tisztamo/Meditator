import { configureDebug } from '../infrastructure/logger';


export function initializeDebugMode() {
    const debugArg = process.argv.find(arg => arg.startsWith('--debug'));
    let debugMode = false;
    if (debugArg) {
        debugMode = debugArg.includes('=') ? debugArg.split('=')[1] : 'all';
    }
    configureDebug(debugMode);
}