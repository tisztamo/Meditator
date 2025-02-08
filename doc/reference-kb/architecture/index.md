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
