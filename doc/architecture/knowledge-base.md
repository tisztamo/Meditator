# Knowledge Base Architecture

## Structure

```text
knowledge/
  topic-1/
    index.md          # Main content
    metadata.md       # Free-form English metadata
    subtopic-a.md
  topic-2/
    index.md
    diagram.png.meta  # Image metadata
```

## Metadata Handling

Metadata files:
- Always same name as parent file/directory + `.md`
- Markdown format for flexible documentation
- Example metadata.md:
  ```markdown
  ## Context Relations
  - Related to [topic-2](../topic-2/index.md)
  - Created: 2023-10-01
  
  ## Custom Fields
  Importance: high
  ```
