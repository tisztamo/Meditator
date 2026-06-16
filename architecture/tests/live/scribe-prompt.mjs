// Isolated test of the scribe's librarian call — real LLM, opt-in only.
import { complete } from "../../../src/modelAccess/llm.js";
import fs from "node:fs/promises";

const memory = await fs.readFile("state/memory.md", "utf8");
const recent = (memory.match(/## Recent\n([\s\S]*?)\n## /) || [, ""])[1];
const tail = (memory.match(/## Tail\n([\s\S]*?)\n<!-- end -->/) || [, ""])[1];
const thoughts = `${recent}\n${tail}`.trim();
console.log(`thoughts: ${thoughts.length} chars`);

const result = await complete({
    model: "qwen/qwen3.5-9b",
    maxTokens: 900,
    temperature: 0.3,
    prompt: `You are the librarian of a thinking mind. Distill durable knowledge from its recent thoughts into a markdown knowledge base. Durable means: ideas, conclusions, questions and themes worth keeping — not the moment-to-moment narration.

Current knowledge tree (paths relative to the KB root):
(empty)

The mind's recent thoughts (first person):
<thoughts>
${thoughts.slice(-3500)}
</thoughts>

Respond ONLY with operations, at most 4:
OP: WRITE <relative/path.md>
<full new file content, markdown>
END
OP: APPEND <relative/path.md>
<content to append>
END
OP: NONE

Rules: group related ideas into topic files (e.g. attention/interruption.md); evolve existing files via APPEND rather than duplicating; keep index.md a short map of the tree (WRITE it when the tree changes); plain thoughtful markdown, the mind's own first person voice is fine.`,
});

console.log("=== RAW MODEL OUTPUT ===");
console.log(result.text);

const { parseOps } = await import("../../../src/mindComponents/mKb.js");
console.log("=== PARSED OPS ===");
for (const op of parseOps(result.text, 4)) {
    console.log(`${op.kind} ${op.file} (${op.content.length} chars)`);
}
