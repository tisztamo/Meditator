import { MBaseComponent } from "./mBaseComponent.js";
import { logger } from '../infrastructure/logger.js';

const log = logger('mShell.js');

/**
 * Component that provides shell command execution capabilities as a tool.
 * 
 * @interface
 * Attributes:
 *   - shell: Optional shell to use for command execution (defaults to system shell)
 *   - cwd: Optional working directory for commands (defaults to current directory)
 *   - timeout: Optional timeout in milliseconds for commands (defaults to 30000)
 * 
 * Exposed as a tool with name "shell" for the mTools component
 */
export class MShell extends MBaseComponent {
    // Tool interface properties
    toolName = "shell";
    toolDescription = "Execute shell commands on the system. Provide the command directly after 'Use tool: shell', and it will be executed as is.";
    
    // Default configuration
    defaultTimeout = 30000; // 30 seconds
    
    /**
     * Sets up the component on connection
     */
    onConnect() {
        super.onConnect();
        
        // Register as a tool by dispatching a custom event
        this.dispatchEvent(new CustomEvent('tool-registration', {
            bubbles: true,
            composed: true,
            detail: {
                name: this.toolName,
                description: this.toolDescription,
                execute: (text) => this.executeToolCall(text),
                component: this
            }
        }));
        
        log.debug("Shell tool initialized");
    }
    
    /**
     * Determines if the current environment is Windows
     * @returns {boolean} True if running on Windows
     */
    isWindows() {
        return process.platform === 'win32';
    }
    
    /**
     * Gets the appropriate default shell for the current platform
     * @returns {string} Path to the default shell
     */
    getDefaultShell() {
        if (this.isWindows()) {
            return 'powershell.exe';
        } else {
            return 'bash';
        }
    }
    
    /**
     * Gets the appropriate shell argument for executing commands
     * @returns {string} The shell argument for command execution
     */
    getShellCommandArg() {
        if (this.isWindows()) {
            return '-Command';
        } else {
            return '-c';
        }
    }
    
    /**
     * Executes a shell command
     * @param {string} argsText - The raw command text to execute
     * @returns {Promise<Object>} The command execution result
     */
    async executeToolCall(argsText) {
        if (!argsText || !argsText.trim()) {
            throw new Error("Missing command to execute");
        }
        
        const command = argsText.trim();
        log.debug(`Executing shell command: ${command}`);
        
        try {
            // Get configuration from attributes
            const shell = this.attr("shell") || this.getDefaultShell();
            const cwd = this.attr("cwd") || process.cwd();
            const timeout = parseInt(this.attr("timeout") || this.defaultTimeout, 10);
            
            // Set up command options
            const options = {
                cwd,
                timeout,
                stderr: "pipe",
                stdout: "pipe"
            };
            
            // Execute the command based on platform
            const commandArg = this.getShellCommandArg();
            const proc = Bun.spawn([shell, commandArg, command], options);
            
            // Get command output
            const [stdout, stderr] = await Promise.all([
                new Response(proc.stdout).text(),
                new Response(proc.stderr).text()
            ]);
            
            // Wait for process to exit
            const exitCode = await proc.exited;
            
            // Return the result
            return {
                stdout: stdout,
                stderr: stderr,
                exitCode: exitCode,
                success: exitCode === 0
            };
        } catch (error) {
            log.error(`Error executing shell command: ${error.message}`);
            throw error;
        }
    }
}

// Register the custom element
customElements.define("m-shell", MShell); 