# Knowledge Base Architecture

## Definitions

- **Abstraction**: A directory (or subdirectory) that groups related Topics. Abstractions provide a structured way to organize knowledge hierarchically. Each Abstraction contains an `index.md` file describing its purpose and links to its Topics.

- **Atom**: A normal Markdown file that represents a single, self-contained piece of knowledge. Atoms are the atomic units of information within the knowledge base.

- **Topic**: A collective term referring to both Abstractions and Atoms. Topics are the building blocks of the knowledge base's structure.

## Structure

The knowledge base follows a hierarchical directory structure where Abstractions (directories) organize related Topics, and Atoms (Markdown files) store individual knowledge units. Metadata for each Topic is stored in separate `.meta.md` files.

```text
knowledge/
  abstraction-1/
    index.md          # Title, description, and links to subtopics
    index.meta.md     # Metadata for this Abstraction
    atom-a.md         # Content of the Atom
    atom-a.meta.md    # Metadata for atom-a.md
  abstraction-2/
    index.md
    index.meta.md
    image.png         # Non-Atom file
    image.png.meta.md # Metadata for image.png
```

## Metadata Handling

Metadata for Abstractions and Atoms is stored in separate Markdown files with a `.meta.md` suffix. This approach keeps content and metadata decoupled while maintaining a human-readable format.

### Abstraction Metadata
Each Abstraction (directory) contains an `index.meta.md` file. This file holds metadata about the Abstraction itself, such as its relationships to other Topics, creation date, or custom fields.

**Example `index.meta.md` for an Abstraction:**
```markdown
## Context Relations
- Related to [abstraction-2](../abstraction-2/index.md)
- Created: 2023-10-01

## Custom Fields
Importance: high
```

### Atom Metadata
Every Atom (Markdown file) can have a corresponding `<filename>.meta.md` file. This metadata might include summaries, tags, or connections to other Topics.

**Example `atom-a.meta.md`:**
```markdown
## Summary
This Atom explores the core principles of...

## Associations
- Supports [abstraction-1](../abstraction-1/index.md)
- Reference: [External Resource](https://example.com)
```

### General Guidelines
- Metadata files use standard Markdown formatting for maximum flexibility.
- The structure of metadata can evolve organically based on project needs.
- All metadata files are optional but recommended for enhanced context understanding.

## Index Files

Every Abstraction directory must contain an `index.md` file that serves as the entry point for that Abstraction. The `index.md` should include:

1. **One-line Title**: Clear and concise name of the Abstraction.
2. **Paragraph Description**: Brief overview (2-5 sentences) explaining the Abstraction's purpose and scope.
3. **Topic Links**: List of relevant sub-Abstractions (directories) and Atoms (files) within this Abstraction. Each link should have a short descriptor explaining its relation to the parent Abstraction.

**Example `index.md` for an Abstraction:**
```markdown
# Core Concepts

This Abstraction covers fundamental principles that form the foundation of our system architecture.

## Sub-Abstractions
- [Design Patterns](./design-patterns/): Common solutions to recurring problems
- [Data Structures](./data-structures/): Organization and storage formats

## Atoms
- [Encapsulation](./encapsulation.md): Isolation of component internals
- [Polymorphism](./polymorphism.md): Interface flexibility patterns
```
