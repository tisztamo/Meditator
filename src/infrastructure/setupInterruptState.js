import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { createStateManager } from './interruptState.js';

const log = logger('setupInterruptState.js');
const BASE_DIR = path.join(process.cwd(), 'interrupt-state');

/**
 * Core generator types as described in architecture docs
 */
const CORE_GENERATORS = [
  'token-monitor',
  'time-based'
];

/**
 * Sets up the interrupt state directory structure
 */
export async function setupInterruptState() {
  try {
    log.info('Setting up interrupt state directory structure...');
    
    // Create base directory
    await fs.mkdir(BASE_DIR, { recursive: true });
    log.debug('Created base interrupt-state directory');
    
    // Create directories for core generators
    for (const generator of CORE_GENERATORS) {
      const generatorDir = path.join(BASE_DIR, generator);
      await fs.mkdir(generatorDir, { recursive: true });
      
      // Set up the generator using the state manager
      await setupGeneratorInitialState(generator);
    }
    
    log.info('Interrupt state directory structure setup complete');
  } catch (error) {
    log.error('Error setting up interrupt state directory structure:', error);
    throw error;
  }
}

/**
 * Sets up initial state for a generator
 * @param {string} generatorType - The type of generator to set up
 */
async function setupGeneratorInitialState(generatorType) {
  try {
    // Create state manager
    const stateManager = createStateManager(generatorType);
    
    // Check if initial state already exists
    const meta = await stateManager.loadMeta();
    if (meta.currentStateFile) {
      log.debug(`Initial state already exists for ${generatorType}, skipping`);
      return;
    }
    
    // Create initial state
    const initialState = `# ${generatorType} State
    
Created: ${new Date().toISOString()}
Status: Initialized

No interrupts have been triggered yet.
`;
    
    // Set up metadata
    const metadata = {
      generatorType: generatorType,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      partialStateCount: 0,
      configuration: {
        initialized: true
      }
    };
    
    // Save as a full state
    await stateManager.update(initialState, metadata, true);
    
    log.debug(`Created initial full state for ${generatorType}`);
  } catch (error) {
    log.error(`Error setting up initial state for ${generatorType}:`, error);
  }
}

/**
 * Helper function to initialize rules for token monitor
 * @param {string} monitorName - Name of the token monitor
 * @param {Array} rules - Array of rule objects
 */
export async function setupTokenMonitorRules(monitorName, rules) {
  try {
    const stateManager = createStateManager(`token-monitor-${monitorName}`);
    
    // Load existing metadata
    const meta = await stateManager.loadMeta();
    
    // Add or update rules
    meta.rules = rules;
    
    // Save the updated metadata
    await stateManager.saveMeta(meta);
    
    log.info(`Rules for token monitor "${monitorName}" setup complete`);
  } catch (error) {
    log.error(`Error setting up rules for token monitor "${monitorName}":`, error);
    throw error;
  }
}

/**
 * Helper function to get a summary of all interrupt generators and their states
 * @returns {Promise<Object>} Summary of generators and states
 */
export async function getInterruptStatesSummary() {
  try {
    const generators = await listGenerators();
    const summary = {};
    
    for (const generator of generators) {
      try {
        const stateManager = createStateManager(generator);
        const meta = await stateManager.loadMeta();
        const stateFiles = await stateManager.listStateFiles();
        
        summary[generator] = {
          currentStateFile: meta.currentStateFile,
          isCurrentStateFull: meta.isCurrentStateFull,
          lastUpdated: meta.lastUpdated,
          stateFilesCount: stateFiles.length,
          fullStatesCount: stateFiles.filter(file => file.isFullState).length,
          partialStatesCount: stateFiles.filter(file => !file.isFullState).length
        };
      } catch (error) {
        log.error(`Error getting summary for generator ${generator}:`, error);
        summary[generator] = { error: error.message };
      }
    }
    
    return summary;
  } catch (error) {
    log.error('Error getting interrupt states summary:', error);
    throw error;
  }
}

/**
 * Lists all generators with state storage
 * @returns {Promise<string[]>} Array of generator names
 */
export async function listGenerators() {
  try {
    await fs.mkdir(BASE_DIR, { recursive: true });
    
    const entries = await fs.readdir(BASE_DIR, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch (error) {
    log.error('Failed to list generators:', error);
    throw error;
  }
}

// If this script is run directly, set up the state directory
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  setupInterruptState().catch(console.error);
} 