# Design Challenge: Beyond Minds — Agents, Norms, and a Generic Architecture Interface

## Context
You are designing for **Meditator**, a system that creates "Minds" — persistent, autonomous AI entities described in declarative `.archml` files (an XML-like domain-specific language). A Mind is composed of pluggable components like `<m-memory>`, `<m-sense>`, `<m-act>`, `<m-note>`, `<m-ear>`, etc., each implemented as a JS module in `src/mindComponents/`.

### Current State
Today, the top-level element is always `<m-mind>`. A Mind is a thinking entity: it has an identity, an origin problem, senses, memory, and acts. The architecture works well for "Minds" — inward-facing thinkers like a mathematician working on a problem.

### The Challenge
The creator envisions that the architecture itself should be more generic. The current interface is really a **general-purpose programming/composition interface** for autonomous entities. It should be able to describe not only Minds, but also:

1. **Agents** — outward-facing, action-oriented entities (as opposed to inward-facing, thought-oriented Minds)
2. **Norms** — behavioral constraints, rules, social contracts, or governance structures that can be applied to Minds/Agents or exist independently

### What We Want From You

Design an evolution of the Meditator architecture that makes it capable of describing all three first-class constructs: **Minds**, **Agents**, and **Norms**.

Think deeply about:

#### 1. The Top-Level Abstraction
- Should `<m-mind>` become something more generic, like `<m-entity>` or `<m-component>`?
- Or should we have parallel top-level types: `<m-mind>`, `<m-agent>`, `<m-norm>`?
- What are the fundamental differences between a Mind and an Agent? (Hint: Mind = inward/thought-oriented; Agent = outward/action-oriented)

#### 2. Norms as First-Class Citizens
- How would a "Norm" be declared in an `.archml` file?
- Can a Norm be composed of the same building blocks (components) as a Mind/Agent?
- How does a Norm "enforce" or "govern"? Is it a constraint layer? A behavioral template? A living entity itself?
- Can Norms reference each other? Can they form hierarchies or networks?

#### 3. The Component System
- How do existing components (`m-memory`, `m-sense`, `m-act`, etc.) adapt?
- Are there new components needed for Agents? For Norms?
- Can components be shared between Minds, Agents, and Norms?

#### 4. Composition and Interaction
- Can a Mind contain an Agent? Can an Agent be governed by a Norm?
- How do these entities communicate? (Currently Minds can interact via `<m-society>` and `<m-ws>`)
- Can a Norm be "applied" to a Mind or Agent like a mixin or decorator?

#### 5. Backwards Compatibility
- Existing `.archml` files should continue to work without modification
- `<m-mind>` should still be valid and behave as it does today

#### 6. Practical Examples
Show at least two concrete `.archml` examples:
- An Agent declaration (something action-oriented, like a system monitor, a curator, or an orchestrator)
- A Norm declaration (a behavioral rule set, a social contract, or an ethical framework)

## Output Format
Write your complete design proposal as a Markdown document. Include:
- A clear narrative explaining your design decisions
- Proposed syntax extensions to the `.archml` DSL
- Component interaction diagrams (use Mermaid or ASCII art)
- Concrete `.archml` examples
- Discussion of trade-offs and alternatives considered

## File to Write
Write your design to: `Meditator/doc/design-agents-norms-codex.md`
