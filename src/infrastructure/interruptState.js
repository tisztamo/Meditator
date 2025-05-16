import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';
import crypto from 'crypto';

const log = logger('interruptState.js');
const BASE_DIR = path.join(process.cwd(), 'interrupt-state');

/**
 * Manages state storage for interrupt generators
 * Implements the state management system described in architecture docs
 * Supports partial and full state saving with proper history tracking
 */
export class InterruptStateManager {
  /**
   * Initialize the state manager for a specific generator
   * @param {string} generatorName - Name of the interrupt generator
   */
  constructor(generatorName) {
    this.generatorName = generatorName;
    this.stateDir = path.join(BASE_DIR, generatorName);
    this.metaPath = path.join(this.stateDir, 'state.meta.md');
    this.currentStateFile = null;
  }

  /**
   * Ensures the state directory exists
   * @private
   */
  async _ensureDirectory() {
    try {
      await fs.mkdir(this.stateDir, { recursive: true });
      log.debug(`Ensured state directory exists for ${this.generatorName}`);
    } catch (error) {
      log.error(`Failed to create state directory for ${this.generatorName}:`, error);
      throw error;
    }
  }

  /**
   * Generates a hash for a content string
   * @param {string} content - Content to hash
   * @returns {string} MD5 hash
   * @private
   */
  _generateHash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Generates a filename for a state based on timestamp and content hash
   * @param {string} content - State content
   * @param {boolean} isFullState - Whether this is a full state
   * @returns {string} Filename
   * @private
   */
  _generateStateFilename(content, isFullState) {
    const timestamp = Date.now();
    const hash = this._generateHash(content);
    const type = isFullState ? 'full' : 'partial';
    return `state_${timestamp}_${type}_${hash}.md`;
  }

  /**
   * Loads the current metadata
   * @returns {Promise<Object>} The current metadata as an object
   */
  async loadMeta() {
    try {
      await this._ensureDirectory();
      try {
        const content = await fs.readFile(this.metaPath, 'utf8');
        log.debug(`Loaded metadata for ${this.generatorName}`);
        // Parse the metadata markdown format into an object
        const meta = this._parseMeta(content);
        
        // Set current state file from metadata
        if (meta.currentStateFile) {
          this.currentStateFile = meta.currentStateFile;
        }
        
        return meta;
      } catch (error) {
        if (error.code === 'ENOENT') {
          log.debug(`No existing metadata for ${this.generatorName}, returning empty object`);
          return {};
        }
        throw error;
      }
    } catch (error) {
      log.error(`Failed to load metadata for ${this.generatorName}:`, error);
      throw error;
    }
  }

  /**
   * Loads a specific state file
   * @param {string} filename - The filename of the state to load
   * @returns {Promise<string>} The state content
   * @private
   */
  async _loadStateFile(filename) {
    try {
      const filePath = path.join(this.stateDir, filename);
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      log.error(`Failed to load state file ${filename}:`, error);
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Saves a new state file
   * @param {string} content - The state content
   * @param {boolean} isFullState - Whether this is a full state
   * @param {string} previousStateFile - The previous state file in the chain
   * @returns {Promise<string>} The filename of the saved state
   * @private
   */
  async _saveStateFile(content, isFullState, previousStateFile) {
    try {
      const filename = this._generateStateFilename(content, isFullState);
      const filePath = path.join(this.stateDir, filename);
      
      // Add metadata about the state chain to the content
      let enhancedContent = content;
      if (previousStateFile) {
        enhancedContent += `\n\n<!-- Previous State: ${previousStateFile} -->`;
      }
      enhancedContent += `\n<!-- State Type: ${isFullState ? 'full' : 'partial'} -->`;
      enhancedContent += `\n<!-- Created: ${new Date().toISOString()} -->`;
      
      await fs.writeFile(filePath, enhancedContent);
      log.debug(`Saved ${isFullState ? 'full' : 'partial'} state to ${filename}`);
      return filename;
    } catch (error) {
      log.error(`Failed to save state file:`, error);
      throw error;
    }
  }

  /**
   * Extracts state chain information from state content
   * @param {string} content - State content
   * @returns {Object} State chain info
   * @private
   */
  _extractStateInfo(content) {
    const info = {
      previousState: null,
      isFullState: false,
      createdAt: null
    };
    
    // Extract previous state
    const previousMatch = content.match(/<!-- Previous State: (.+?) -->/);
    if (previousMatch) {
      info.previousState = previousMatch[1];
    }
    
    // Extract state type
    const typeMatch = content.match(/<!-- State Type: (.+?) -->/);
    if (typeMatch) {
      info.isFullState = typeMatch[1] === 'full';
    }
    
    // Extract creation time
    const createdMatch = content.match(/<!-- Created: (.+?) -->/);
    if (createdMatch) {
      info.createdAt = new Date(createdMatch[1]);
    }
    
    return info;
  }

  /**
   * Loads the current state with proper merging of partial states
   * @returns {Promise<string>} The merged state content
   */
  async loadState() {
    try {
      await this._ensureDirectory();
      
      // Load metadata to get current state file
      const meta = await this.loadMeta();
      if (!meta.currentStateFile) {
        log.debug(`No current state file for ${this.generatorName}, returning empty state`);
        return '';
      }
      
      // Load the current state
      const currentState = await this._loadStateFile(meta.currentStateFile);
      if (!currentState) {
        log.error(`Current state file ${meta.currentStateFile} not found`);
        return '';
      }
      
      // Extract state info
      const stateInfo = this._extractStateInfo(currentState);
      
      // If it's a full state, return it directly
      if (stateInfo.isFullState) {
        log.debug(`Loaded full state for ${this.generatorName}`);
        return this._cleanStateContent(currentState);
      }
      
      // Otherwise, we need to traverse the chain to find a full state and merge
      log.debug(`Current state is partial, traversing state chain for ${this.generatorName}`);
      return await this._loadAndMergeStateChain(meta.currentStateFile);
    } catch (error) {
      log.error(`Failed to load state for ${this.generatorName}:`, error);
      throw error;
    }
  }

  /**
   * Cleans state content by removing metadata comments
   * @param {string} content - State content with metadata
   * @returns {string} Clean content
   * @private
   */
  _cleanStateContent(content) {
    return content.replace(/<!-- Previous State: .+? -->\n*/g, '')
                  .replace(/<!-- State Type: .+? -->\n*/g, '')
                  .replace(/<!-- Created: .+? -->\n*/g, '');
  }

  /**
   * Loads and merges a chain of states until a full state is found
   * @param {string} startStateFile - The starting state file
   * @returns {Promise<string>} The merged state content
   * @private
   */
  async _loadAndMergeStateChain(startStateFile) {
    const stateChain = [];
    let currentFile = startStateFile;
    let foundFullState = false;
    
    // Traverse the chain backward until we find a full state
    while (currentFile && !foundFullState) {
      const stateContent = await this._loadStateFile(currentFile);
      if (!stateContent) {
        log.error(`State file ${currentFile} not found in chain`);
        break;
      }
      
      const stateInfo = this._extractStateInfo(stateContent);
      stateChain.push({
        content: this._cleanStateContent(stateContent),
        isFullState: stateInfo.isFullState,
        createdAt: stateInfo.createdAt
      });
      
      if (stateInfo.isFullState) {
        foundFullState = true;
      }
      
      currentFile = stateInfo.previousState;
    }
    
    if (!foundFullState) {
      log.warn(`No full state found in chain for ${this.generatorName}, using available partial states`);
    }
    
    // Merge states from oldest (full) to newest (partial)
    // Reverse the array to get chronological order
    stateChain.reverse();
    
    // Start with the oldest state (should be full)
    let mergedState = stateChain.length > 0 ? stateChain[0].content : '';
    
    // Merge with subsequent partial states
    for (let i = 1; i < stateChain.length; i++) {
      mergedState = this._mergeStates(mergedState, stateChain[i].content);
    }
    
    return mergedState;
  }

  /**
   * Merges two states, with the newer state having lower priority
   * Uses a simple section-based merging strategy
   * @param {string} baseState - The base state (higher priority)
   * @param {string} newState - The newer state (lower priority)
   * @returns {string} The merged state
   * @private
   */
  _mergeStates(baseState, newState) {
    // Simple section-based merge
    // Identify sections by markdown headers
    const baseSections = this._parseSections(baseState);
    const newSections = this._parseSections(newState);
    
    // Start with the base state
    const mergedSections = {...baseSections};
    
    // Add new sections that don't exist in the base state
    for (const [header, content] of Object.entries(newSections)) {
      if (!mergedSections[header]) {
        mergedSections[header] = content;
      }
    }
    
    // Reconstruct the merged state
    return Object.entries(mergedSections)
      .map(([header, content]) => `${header}\n${content}`)
      .join('\n\n');
  }

  /**
   * Parses a state into sections based on markdown headers
   * @param {string} state - State content
   * @returns {Object} Map of section headers to content
   * @private
   */
  _parseSections(state) {
    const sections = {};
    let currentHeader = null;
    let currentContent = [];
    
    const lines = state.split('\n');
    for (const line of lines) {
      const headerMatch = line.match(/^(#+)\s+(.+)$/);
      if (headerMatch) {
        // Save previous section if it exists
        if (currentHeader) {
          sections[currentHeader] = currentContent.join('\n');
        }
        
        // Start new section
        currentHeader = line;
        currentContent = [];
      } else if (currentHeader) {
        currentContent.push(line);
      }
    }
    
    // Save the last section
    if (currentHeader) {
      sections[currentHeader] = currentContent.join('\n');
    }
    
    return sections;
  }

  /**
   * Saves metadata
   * @param {Object} meta - The metadata to save
   * @returns {Promise<void>}
   */
  async saveMeta(meta) {
    try {
      await this._ensureDirectory();
      const content = this._formatMeta(meta);
      await fs.writeFile(this.metaPath, content);
      log.debug(`Saved metadata for ${this.generatorName}`);
    } catch (error) {
      log.error(`Failed to save metadata for ${this.generatorName}:`, error);
      throw error;
    }
  }

  /**
   * Saves a new state
   * @param {string} state - The state content to save
   * @param {boolean} isFullState - Whether this is a full state, defaults to false (partial)
   * @returns {Promise<string>} The filename of the saved state
   */
  async saveState(state, isFullState = false) {
    try {
      await this._ensureDirectory();
      
      // Get metadata to determine previous state
      const meta = await this.loadMeta();
      const previousStateFile = meta.currentStateFile;
      
      // Save the new state file
      const newStateFile = await this._saveStateFile(state, isFullState, previousStateFile);
      
      // Update metadata with new current state
      meta.currentStateFile = newStateFile;
      meta.lastUpdated = new Date().toISOString();
      meta.isCurrentStateFull = isFullState;
      
      // If we don't have a record of state files, create it
      if (!meta.stateFiles) {
        meta.stateFiles = [];
      }
      
      // Add this state to the file list
      meta.stateFiles.unshift({
        filename: newStateFile,
        timestamp: new Date().toISOString(),
        isFullState: isFullState
      });
      
      // Limit the number of state files in metadata to avoid it getting too large
      if (meta.stateFiles.length > 20) {
        meta.stateFiles = meta.stateFiles.slice(0, 20);
      }
      
      // Save updated metadata
      await this.saveMeta(meta);
      
      // Update current state file property
      this.currentStateFile = newStateFile;
      
      log.debug(`Saved ${isFullState ? 'full' : 'partial'} state for ${this.generatorName}`);
      return newStateFile;
    } catch (error) {
      log.error(`Failed to save state for ${this.generatorName}:`, error);
      throw error;
    }
  }

  /**
   * Updates the state and metadata in a single operation
   * @param {string} state - The state content to save
   * @param {Object} meta - The metadata to save
   * @param {boolean} isFullState - Whether this is a full state, defaults to false (partial)
   * @returns {Promise<void>}
   */
  async update(state, meta, isFullState = false) {
    try {
      const newStateFile = await this.saveState(state, isFullState);
      
      // Update metadata with additional fields
      meta.currentStateFile = newStateFile;
      meta.lastUpdated = new Date().toISOString();
      meta.isCurrentStateFull = isFullState;
      
      await this.saveMeta(meta);
    } catch (error) {
      log.error(`Failed to update state and metadata for ${this.generatorName}:`, error);
      throw error;
    }
  }

  /**
   * Formats metadata object as markdown
   * @param {Object} meta - Metadata object
   * @returns {string} Formatted markdown
   * @private
   */
  _formatMeta(meta) {
    let content = '# Generator Metadata\n\n';
    
    for (const [key, value] of Object.entries(meta)) {
      if (key === 'stateFiles') {
        content += `## ${key}\n\n`;
        for (const file of value) {
          content += `- **${file.filename}**\n`;
          content += `  - timestamp: ${file.timestamp}\n`;
          content += `  - isFullState: ${file.isFullState}\n`;
        }
        content += '\n';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        content += `## ${key}\n\n`;
        for (const [subKey, subValue] of Object.entries(value)) {
          content += `- **${subKey}**: ${subValue}\n`;
        }
        content += '\n';
      } else {
        content += `- **${key}**: ${value}\n`;
      }
    }
    
    return content;
  }

  /**
   * Parses metadata markdown into an object
   * @param {string} content - Markdown content
   * @returns {Object} Parsed metadata
   * @private
   */
  _parseMeta(content) {
    const meta = {};
    let currentSection = null;
    let currentFile = null;
    
    const lines = content.split('\n');
    for (const line of lines) {
      const sectionMatch = line.match(/^## (.+)$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim();
        if (currentSection === 'stateFiles') {
          meta[currentSection] = [];
        } else {
          meta[currentSection] = {};
        }
        continue;
      }
      
      const fileMatch = line.match(/^- \*\*(.+)\*\*$/);
      if (fileMatch && currentSection === 'stateFiles') {
        currentFile = { filename: fileMatch[1].trim() };
        meta[currentSection].push(currentFile);
        continue;
      }
      
      const fileAttributeMatch = line.match(/^\s+- (.+): (.+)$/);
      if (fileAttributeMatch && currentFile) {
        const [_, attrKey, attrValue] = fileAttributeMatch;
        currentFile[attrKey.trim()] = attrValue.trim() === 'true' ? true : 
                                      attrValue.trim() === 'false' ? false : 
                                      attrValue.trim();
        continue;
      }
      
      const keyValueMatch = line.match(/^- \*\*(.+)\*\*: (.+)$/);
      if (keyValueMatch) {
        const [_, key, value] = keyValueMatch;
        if (currentSection) {
          meta[currentSection][key.trim()] = value.trim() === 'true' ? true : 
                                             value.trim() === 'false' ? false : 
                                             value.trim();
        } else {
          meta[key.trim()] = value.trim() === 'true' ? true : 
                             value.trim() === 'false' ? false : 
                             value.trim();
        }
      }
    }
    
    return meta;
  }

  /**
   * List all state files for this generator
   * @returns {Promise<Array>} Array of state file info objects
   */
  async listStateFiles() {
    try {
      const meta = await this.loadMeta();
      return meta.stateFiles || [];
    } catch (error) {
      log.error(`Failed to list state files for ${this.generatorName}:`, error);
      throw error;
    }
  }

  /**
   * Gets the full state history chain
   * @returns {Promise<Array>} Array of state content objects in chronological order
   */
  async getStateHistory() {
    try {
      const meta = await this.loadMeta();
      if (!meta.currentStateFile) {
        return [];
      }
      
      // Start from current state and follow the chain backward
      const stateChain = [];
      let currentFile = meta.currentStateFile;
      
      while (currentFile) {
        const stateContent = await this._loadStateFile(currentFile);
        if (!stateContent) {
          log.error(`State file ${currentFile} not found in history chain`);
          break;
        }
        
        const stateInfo = this._extractStateInfo(stateContent);
        stateChain.push({
          filename: currentFile,
          content: this._cleanStateContent(stateContent),
          isFullState: stateInfo.isFullState,
          createdAt: stateInfo.createdAt,
          previousFile: stateInfo.previousState
        });
        
        currentFile = stateInfo.previousState;
      }
      
      // Reverse to get chronological order
      return stateChain.reverse();
    } catch (error) {
      log.error(`Failed to get state history for ${this.generatorName}:`, error);
      throw error;
    }
  }
}

/**
 * Creates a state manager for a specific generator
 * @param {string} generatorName - Name of the interrupt generator
 * @returns {InterruptStateManager} The state manager instance
 */
export function createStateManager(generatorName) {
  return new InterruptStateManager(generatorName);
}

/**
 * Lists all generators with state storage
 * @returns {Promise<string[]>} Array of generator names
 */
export async function listGenerators() {
  try {
    try {
      await fs.mkdir(BASE_DIR, { recursive: true });
    } catch (error) {
      log.error('Failed to ensure base directory exists:', error);
      throw error;
    }
    
    const entries = await fs.readdir(BASE_DIR, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch (error) {
    log.error('Failed to list generators:', error);
    throw error;
  }
} 