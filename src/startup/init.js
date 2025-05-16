import { logger } from '../infrastructure/logger.js';
import { setupInterruptState, getInterruptStatesSummary } from '../infrastructure/setupInterruptState.js';
import { fileURLToPath } from 'url';

const log = logger('init.js');

/**
 * Initialize the system
 * Sets up necessary components before starting the application
 */
export async function initialize() {
  try {
    log.info('Initializing system...');
    
    // Setup interrupt state directory structure
    await setupInterruptState();
    
    // Display information about interrupt state chains
    await displayInterruptStateInfo();
    
    // Add additional initialization steps here
    
    log.info('System initialization complete');
  } catch (error) {
    log.error('System initialization failed:', error);
    throw error;
  }
}

/**
 * Displays information about interrupt state chains
 */
async function displayInterruptStateInfo() {
  try {
    log.info('Interrupt state chains summary:');
    
    const summary = await getInterruptStatesSummary();
    
    for (const [generator, info] of Object.entries(summary)) {
      if (info.error) {
        log.warn(`  ${generator}: ERROR - ${info.error}`);
        continue;
      }
      
      log.info(`  ${generator}:`);
      log.info(`    Current state: ${info.currentStateFile || 'None'} (${info.isCurrentStateFull ? 'FULL' : 'PARTIAL'})`);
      log.info(`    Last updated: ${info.lastUpdated || 'Never'}`);
      log.info(`    State files: ${info.stateFilesCount} total (${info.fullStatesCount} full, ${info.partialStatesCount} partial)`);
    }
  } catch (error) {
    log.error('Error displaying interrupt state info:', error);
  }
}

// If this script is run directly, initialize the system
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initialize().catch(console.error);
} 