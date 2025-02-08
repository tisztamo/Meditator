#!/bin/sh
set -e
goal="Generate enhanced reference KB for Meditator documentation"
echo "Plan:"
echo "1. Create a refined directory structure for a modular, consistent knowledge base."
echo "2. Separate content (Markdown) from metadata (Markdown metadata files)."
echo "3. Include sections on Project Overview, Architecture, Usage, Configuration, Conventions, Contributing, and Support."

# Create the refined reference knowledge base directory structure
mkdir -p doc/reference-kb/project
mkdir -p doc/reference-kb/architecture
mkdir -p doc/reference-kb/usage
mkdir -p doc/reference-kb/configuration
mkdir -p doc/reference-kb/conventions
mkdir -p doc/reference-kb/contributing
mkdir -p doc/reference-kb/support

# Top-level index for the knowledge base
cat > doc/reference-kb/index.md << 'EOF'
# Meditator Reference Knowledge Base

Welcome to the reference knowledge base for Meditator. This repository organizes all foundational documentation into modular sections. Each section (or Topic) is stored as a Markdown file accompanied by metadata that explains its context, relationships, and versioning.

## Table of Contents
- [Project Overview](./project/index.md)
- [Architecture](./architecture/index.md)
- [Usage](./usage/index.md)
- [Configuration](./configuration/index.md)
- [Conventions](./conventions/index.md)
- [Contributing](./contributing/index.md)
- [Support](./support/index.md)

This structure supports extensibility and clarity, ensuring that future contributions adhere to consistent guidelines.
EOF

cat > doc/reference-kb/index.meta.md << 'EOF'
## Reference KB Metadata
- Created: 2025-02-08
- Version: 1.1
- Description: Enhanced and modular reference knowledge base for Meditator.
EOF

# Project Overview
cat > doc/reference-kb/project/index.md << 'EOF'
# Project Overview

Meditator is an AI agent engineered to maintain persistent state via a dynamic knowledge base. It utilizes continuous LLM streaming to simulate an evolving "stream of consciousness" and dynamically adapts based on external triggers.

## Key Features
- **Stateful Knowledge Base**: Persistent, modular storage of knowledge.
- **Streaming LLM Calls**: Real-time text generation.
- **Interrupt & Resume**: Responsive to user input and system events.
- **Multi-Interface Output**: Console and websocket support.
- **Web Application**: Visual interface for monitoring and interaction.
EOF

cat > doc/reference-kb/project/index.meta.md << 'EOF'
## Project Metadata
- Name: Meditator
- Domain: AI agent with persistent context
- Contributors: Open source community
EOF

# Architecture
cat > doc/reference-kb/architecture/index.md << 'EOF'
# Knowledge Base Architecture

This section details the underlying architecture of Meditator's knowledge base, designed for clarity, modularity, and scalability.

## Core Concepts
- **Abstractions**: Directories grouping related Topics, each with an `index.md` (overview) and `index.meta.md` (metadata).
- **Atoms**: Individual Markdown files representing discrete knowledge units, optionally paired with `<atom>.meta.md` for metadata.
- **Topics**: Collective term for both Abstractions and Atoms.

## Design Principles
- **Separation of Concerns**: Content is decoupled from metadata.
- **Hierarchical Organization**: Supports nested topics and clear navigation.
- **Extensibility**: Easy to add or modify Topics without disrupting structure.

## Metadata Handling
Metadata files use Markdown for human readability and flexibility, capturing creation dates, relationships, and custom fields.
EOF

cat > doc/reference-kb/architecture/index.meta.md << 'EOF'
## Architecture Metadata
- Model: Hierarchical (Abstractions and Atoms)
- Purpose: Organize and persist knowledge efficiently.
EOF

# Usage
cat > doc/reference-kb/usage/index.md << 'EOF'
# Installation & Usage

Follow these guidelines to set up and run Meditator:

1. **Installation**
   - Ensure all prerequisites (e.g., Bun, Node.js, Python) are installed.
   - Run: \`bun install\`
2. **Launching the Agent**
   - Use the provided scripts or Docker container to start Meditator.
   - Monitor the live "stream of consciousness" via the console or websocket.
3. **Interacting**
   - Engage with the agent through the web interface or API calls.
   - New prompts interrupt the current stream, triggering a decision pipeline for resumption.
EOF

cat > doc/reference-kb/usage/index.meta.md << 'EOF'
## Usage Metadata
- Instructions: Detailed installation and operational steps.
- Audience: New users and developers.
EOF

# Configuration
cat > doc/reference-kb/configuration/index.md << 'EOF'
# Configuration

Customize your Meditator deployment with these options:

- **LLM Provider**: Set environment variables or API keys to connect to your preferred LLM service.
- **Timeouts & Triggers**: Adjust thresholds for stream interruption and token limits.
- **File Storage**: Configure the directory paths for the knowledge base.
- **Customization**: Modify metadata and naming conventions to suit your project needs.
EOF

cat > doc/reference-kb/configuration/index.meta.md << 'EOF'
## Configuration Metadata
- Details: Environment setup and system parameter tuning.
- Flexibility: Designed for user-specific adjustments.
EOF

# Conventions
cat > doc/reference-kb/conventions/index.md << 'EOF'
# Knowledge Base Conventions

This section outlines the standards and best practices for maintaining a coherent and navigable knowledge base.

## Naming Conventions
- **Directories (Abstractions)**: Use clear, descriptive names.
- **Files (Atoms)**: Name files to reflect their content succinctly.
- **Metadata Files**: Append \`.meta.md\` to associate metadata with corresponding content.

## Structural Guidelines
- Separate content from metadata to ensure clarity.
- Use index files as entry points for directories.
- Maintain consistent Markdown formatting for readability.

## Versioning and Updates
- Document changes and updates in metadata.
- Follow semantic versioning principles for major updates.
EOF

cat > doc/reference-kb/conventions/index.meta.md << 'EOF'
## Conventions Metadata
- Focus: Clarity, consistency, and maintainability.
- Guidelines: To be followed by all contributors.
EOF

# Contributing
cat > doc/reference-kb/contributing/index.md << 'EOF'
# Contributing

We welcome your contributions to enhance Meditator. Please adhere to these guidelines:

- **Fork & Branch**: Create a personal fork and a feature branch.
- **Pull Requests**: Include detailed descriptions and follow coding standards.
- **Issues**: Report bugs and propose improvements via the issue tracker.
- **Documentation**: Update the knowledge base as needed with your contributions.
EOF

cat > doc/reference-kb/contributing/index.meta.md << 'EOF'
## Contributing Metadata
- Approach: Community-driven development.
- Standards: Follow established code and documentation practices.
EOF

# Support
cat > doc/reference-kb/support/index.md << 'EOF'
# Support

For questions, troubleshooting, or further assistance:

- **Issues**: Open an issue in the repository.
- **Contact**: Reach out via provided communication channels.
- **Community**: Engage with other users and contributors for collective support.
EOF

cat > doc/reference-kb/support/index.meta.md << 'EOF'
## Support Metadata
- Resources: Issue tracker and community forums.
- Commitment: Responsive support and continual improvement.
EOF

echo "\033[32mDone: $goal\033[0m"
