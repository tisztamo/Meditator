import { MBaseComponent } from "./mBaseComponent.js";
import { logger } from '../infrastructure/logger.js';
import { InterruptRecord } from '../infrastructure/interruptRecord.js';

const log = logger('mTools.js');

/**
 * Component that manages tool execution and integration with the stream.
 * Collects tool data from children and provides a prompt for available tools.
 * Handles tool calls from the stream and manages the lifecycle of tool execution.
 * 
 * @interface
 * Attributes:
 *   - prefix: Optional prefix for tool prompts (defaults to "You have access to the following tools:")
 * 
 * Subscriptions:
 *   - "../chunk": Listens to stream chunks to detect tool calls
 * 
 * DOM Events:
 *   - "tool-registration": Listens for tools registering themselves
 * 
 * Topics published to:
 *   - "tool": Published when a tool call is detected in the stream
 *   - "tools-prompt": Published to provide the list of available tools to the stream
 *   - "interrupt-request": Published to interrupt the stream with tool results
 */
export class MTools extends MBaseComponent {
    tools = [];
    pendingToolCalls = new Map();
    toolCallDetectionPattern = /^(?:Use|Call|Execute|Invoke|Run) tool: ([a-zA-Z0-9_-]+)\s*\n([\s\S]*?)(?:(?:\n\n)|$)/m;
    
    /**
     * Sets up the component on connection
     */
    onConnect() {
        // Listen to stream chunks to detect tool calls
        this.sub("../chunk", this["../chunk"]);
                
        // Publish available tools prompt
        this.publishToolsPrompt();
        
        log.debug("Tools manager initialized");
    }
    
    /**
     * Handler for tool registration DOM events
     * @param {CustomEvent} e - The tool registration event
     */
    "@tool-registration" = (e) => {
        const toolInfo = e.detail;
        
        if (!toolInfo || !toolInfo.name || !toolInfo.description || !toolInfo.execute) {
            log.warn("Ignoring invalid tool registration", toolInfo);
            return;
        }
        
        const tool = {
            name: toolInfo.name,
            description: toolInfo.description,
            execute: toolInfo.execute,
            component: toolInfo.component || e.target
        };
        
        this.tools.push(tool);
        log.debug(`Registered tool: ${tool.name}`);
        
        // Republish tools prompt with new tool
        this.publishToolsPrompt();
    }
    
    /**
     * Constructs and publishes the tools prompt
     */
    publishToolsPrompt() {
        if (this.tools.length === 0) {
            return;
        }
        
        const prefix = this.attr("prefix") || "You have access to the following tools:";
        
        let toolsPrompt = `${prefix}\n\n`;
        
        this.tools.forEach(tool => {
            toolsPrompt += `Tool: ${tool.name}\n`;
            toolsPrompt += `Description: ${tool.description}\n\n`;
        });
        
        toolsPrompt += `To use a tool, output text in the following format:\n`;
        toolsPrompt += `Use tool: [tool name]\n`;
        toolsPrompt += `[any text here that the tool will process]\n\n`;
        toolsPrompt += `The tool will be executed asynchronously, and the result will be provided back to you.\n`;
        
        this.pub("tools-prompt", toolsPrompt);
    }
    
    /**
     * Detects and handles tool calls in stream chunks
     * @param {string} chunk - The stream chunk to analyze
     */
    "../chunk" = (chunk) => {
        // Accumulate chunks to detect multi-chunk tool calls
        this.lastChunks = (this.lastChunks || '') + chunk;
        
        // Keep only the last 1000 characters to avoid memory issues
        if (this.lastChunks.length > 1000) {
            this.lastChunks = this.lastChunks.slice(-1000);
        }
        
        // Check for tool call pattern
        const match = this.lastChunks.match(this.toolCallDetectionPattern);
        if (match) {
            const toolName = match[1].trim();
            const toolArgs = match[2].trim();
            
            // Clear the accumulated chunks after detecting a call
            this.lastChunks = '';
            
            // Process the tool call
            this.handleToolCall(toolName, toolArgs);
        }
    }
    
    /**
     * Handles a detected tool call
     * @param {string} toolName - The name of the tool to call
     * @param {string} argsText - The arguments for the tool call 
     */
    handleToolCall(toolName, argsText) {
        log.debug(`Detected tool call: ${toolName}`);
        
        // Find the requested tool
        const tool = this.tools.find(t => t.name === toolName);
        if (!tool) {
            log.warn(`Tool not found: ${toolName}`);
            this.generateToolResultInterrupt(toolName, null, `Tool '${toolName}' not found.`);
            return;
        }
        
        // Generate a unique ID for this tool call
        const callId = `${toolName}_${Date.now()}`;
        
        // Publish the tool call event with raw args text
        this.pub("tool", {
            id: callId,
            tool: toolName,
            argsText: argsText,
            timestamp: new Date().toISOString()
        });
        
        // Generate an interrupt to notify about the tool call
        this.generateToolCallInterrupt(toolName, argsText);
        
        // Execute the tool call asynchronously
        this.executeToolCall(callId, tool, argsText);
    }
    
    /**
     * Executes a tool call asynchronously
     * @param {string} callId - Unique ID for this tool call
     * @param {Object} tool - The tool to execute
     * @param {string} argsText - The raw arguments text for the tool
     */
    executeToolCall(callId, tool, argsText) {
        try {
            // Track this pending call
            this.pendingToolCalls.set(callId, {
                tool: tool.name,
                argsText,
                startTime: Date.now()
            });
            
            // Execute the tool, expecting a Promise
            // Pass the raw text to the tool, letting it handle parsing
            Promise.resolve(tool.execute(argsText))
                .then(result => {
                    // Handle successful result
                    this.handleToolResult(callId, tool.name, result);
                })
                .catch(error => {
                    // Handle error
                    this.handleToolError(callId, tool.name, error);
                });
            
        } catch (error) {
            // Handle synchronous errors
            this.handleToolError(callId, tool.name, error);
        }
    }
    
    /**
     * Handles a successful tool execution result
     * @param {string} callId - The unique call ID
     * @param {string} toolName - The name of the tool 
     * @param {any} result - The result from the tool execution
     */
    handleToolResult(callId, toolName, result) {
        log.debug(`Tool ${toolName} completed successfully`);
        
        // Remove from pending calls
        this.pendingToolCalls.delete(callId);
        
        // Generate an interrupt with the tool result
        this.generateToolResultInterrupt(toolName, result);
    }
    
    /**
     * Handles a tool execution error
     * @param {string} callId - The unique call ID
     * @param {string} toolName - The name of the tool
     * @param {Error} error - The error from tool execution 
     */
    handleToolError(callId, toolName, error) {
        log.error(`Tool ${toolName} execution failed:`, error);
        
        // Remove from pending calls
        this.pendingToolCalls.delete(callId);
        
        // Generate an interrupt with the error
        this.generateToolResultInterrupt(
            toolName, 
            null, 
            `Error executing tool ${toolName}: ${error.message || error}`
        );
    }
    
    
    /**
     * Generates an interrupt for a tool call
     * @param {string} toolName - The name of the tool
     * @param {string} argsText - The raw arguments text for the tool
     */
    generateToolCallInterrupt(toolName, argsText) {
        const interrupt = new InterruptRecord({
            source: 'Tool',
            type: 'ToolCall',
            reason: `Tool call detected: ${toolName}`,
            context: {
                toolName,
                argsText,
                timestamp: new Date().toISOString()
            }
        });
        
        this.pub("interrupt-request", interrupt.toMarkdown());
    }
    
    /**
     * Generates an interrupt for a tool result
     * @param {string} toolName - The name of the tool
     * @param {any} result - The result from the tool (null if error)
     * @param {string} error - Error message if execution failed 
     */
    generateToolResultInterrupt(toolName, result, error = null) {
        const interrupt = new InterruptRecord({
            source: 'Tool',
            type: 'ToolResult',
            reason: error 
                ? `Tool execution failed: ${toolName}` 
                : `Tool execution completed: ${toolName}`,
            context: {
                toolName,
                result: result !== null ? this.formatToolResult(result) : null,
                error,
                timestamp: new Date().toISOString()
            }
        });
        
        this.pub("interrupt-request", interrupt.toMarkdown());
    }
    
    /**
     * Formats a tool result for inclusion in an interrupt
     * @param {any} result - The raw result from tool execution
     * @returns {string} Formatted result 
     */
    formatToolResult(result) {
        if (result === null || result === undefined) {
            return "No result provided";
        }
        
        if (typeof result === 'string') {
            return result;
        }
        
        if (typeof result === 'object') {
            try {
                return JSON.stringify(result, null, 2);
            } catch (e) {
                return `[Object that could not be stringified: ${e.message}]`;
            }
        }
        
        return String(result);
    }
} 