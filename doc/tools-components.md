# Meditator Tools Components

This document describes the tools components in the Meditator architecture and how to use them.

## Overview

The Meditator tools system provides a way for the AI to execute operations in the host environment through defined tool interfaces. Two key components make up this system:

1. **m-tools**: A component that manages tool execution and integration with the stream. It detects tool calls in the stream output, handles their execution, and integrates the results back into the conversation.

2. **m-shell**: A tool component that allows executing shell commands in the local environment.

## m-tools Component

### Description

The `m-tools` component serves as the tool manager and provides the following functionality:

- Listens for tool registrations via DOM events
- Provides a tools prompt to the stream
- Detects tool calls in the stream output
- Manages the lifecycle of tool execution

### Attributes

- `prefix`: Optional prefix for tool prompts (defaults to "You have access to the following tools:")

### DOM Events

- `tool-registration`: Listens for tools registering themselves

### Subscriptions

- `../chunk`: Listens to stream chunks to detect tool calls

### Topics Published To

- `tool`: Published when a tool call is detected in the stream
- `tools-prompt`: Published to provide the list of available tools to the stream
- `interrupt-request`: Published to interrupt the stream with tool results

### Tool Interface

Tools register with `m-tools` by dispatching a `tool-registration` custom event with:

- `name`: A string name for the tool
- `description`: Description of what the tool does, including how to use it
- `execute`: A function that takes the raw text after the tool call and returns a Promise with the result

When the `m-tools` component detects a tool call in the stream, it will pass the raw text to the tool's `execute` function. Each tool is responsible for interpreting the text as it sees fit.

### Usage

```html
<m-tools prefix="You have access to the following tools:">
  <!-- Add tool components here -->
  <m-shell></m-shell>
  <!-- Other tool components -->
</m-tools>
```

## m-shell Component

### Description

The `m-shell` component provides shell command execution capabilities as a tool. It:

- Registers itself with the m-tools component via a DOM event
- Executes shell commands in the local environment
- Handles platform-specific shell differences (Windows vs. Unix)

### Attributes

- `shell`: Optional shell to use for command execution (defaults to system shell: PowerShell on Windows, Bash on Unix)
- `cwd`: Optional working directory for commands (defaults to current directory)
- `timeout`: Optional timeout in milliseconds for commands (defaults to 30000)

### Tool Interface

- Tool Name: `shell`
- Tool Description: "Execute shell commands on the system. Provide the command directly after 'Use tool: shell', and it will be executed as is."

The shell component takes the raw text provided after the tool call and executes it directly as a shell command.

### Usage

```html
<m-tools>
  <m-shell cwd="./working-directory" timeout="5000"></m-shell>
</m-tools>
```

### How to Call from Stream

The AI can call the shell tool in the stream by using this format:

```
Use tool: shell
echo Hello, world!
```

The text on the line(s) after "Use tool: shell" will be executed as a shell command.

## Example

Examples of how to configure and use the tools system are provided in the architecture directory:

- `architecture/tools-basic.chml`: Basic configuration
- `architecture/tools-advanced.chml`: Advanced configuration with specific options
- `architecture/tools-integration.chml`: Integration with other components

## Integration with Interrupts

The tools system integrates with the interrupts system to:

1. Generate interrupts when a tool call is detected
2. Generate interrupts when a tool result is available

This allows the stream to be paused during tool execution and resumed with the tool results integrated into the conversation.

## Creating New Tools

To create a new tool component, extend `MBaseComponent` and implement:

1. `toolName`: A string name for your tool
2. `toolDescription`: A description of what your tool does, including how to use it
3. `executeToolCall(text)`: A function that takes raw text and returns a Promise
4. Register with `m-tools` by dispatching a `tool-registration` event

Example:

```javascript
export class MCalculator extends MBaseComponent {
    toolName = "calculator";
    toolDescription = "Performs basic math calculations. Provide a mathematical expression directly after the tool call.";
    
    onConnect() {
        super.onConnect();
        
        // Register as a tool
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
    }
    
    executeToolCall(text) {
        // Evaluate the expression provided in the text
        try {
            // For security, you'd want better validation than this
            const result = eval(text.trim());
            return Promise.resolve({ result });
        } catch (error) {
            return Promise.reject(error);
        }
    }
}

customElements.define("m-calculator", MCalculator);
```

## Security Considerations

The shell component executes commands in the local environment, which poses security risks. Consider these precautions:

1. Limit the working directory to a safe location
2. Set a reasonable timeout to prevent long-running commands
3. Consider implementing command filtering for production use 