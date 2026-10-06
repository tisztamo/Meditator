// Handle hygiene (message-rule review §6.3, rule M4). A lookup builds an address,
// never a handle: what `part()`, `enclosing()`, `membrane()`, `closestRole()`,
// `closest()` or `querySelector()` return may be asked for its name, its attributes,
// its place in the tree, or be listened on for structural events. It is never
// called, and its JavaScript state is never read: a method call or a property read
// on another component only works while both share one heap.
//
// The scanner follows a looked-up element along three paths: a member access
// chained straight onto the lookup (`part(m, "x")[0].foo()`); a name bound to one
// (`const x = …lookup…`, `this._x = …`, `for (const x of …)`, also through `||`,
// `&&`, `??`, `[0]` and the array methods that keep elements); and the parameter
// of an array callback chained onto one (`part(m, "x").filter(el => …)`). A local
// name stays tracked until its block closes. Comments are skipped.
//
// What may be touched is the ALLOWED list below. A line that has to reach further
// says why with a `handle-ok:` comment on the line itself or the line above, e.g.
// the infrastructure helpers that deliver a reply to its requester's address.
// enclosure.js implements the lookups and is not scanned.
import { test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUILTIN = fileURLToPath(new URL("../../../src/mindComponents", import.meta.url));
const SKIP = new Set([path.join("shared", "enclosure.js")]);

const LOOKUPS = [
  "part", "enclosing", "enclosingOf", "enclosingAllOf", "membrane", "membraneOf",
  "closestRole", "closest", "querySelector", "querySelectorAll", "bidOwnerOf",
];
// Members of a looked-up element (and of the array a lookup returns) that are
// addresses, tree structure or listening, not the other component's behaviour.
const ALLOWED = new Set([
  // attributes and tree structure
  "getAttribute", "hasAttribute", "localName", "tagName", "nodeType", "isConnected",
  "parentElement", "children", "contains", "matches",
  // further lookups from there (their result is tracked in turn)
  ...LOOKUPS,
  // structural events on the membrane
  "addEventListener", "removeEventListener",
  // a plain, non-component child's own text: the rule's one exception
  "textContent",
  // the array a lookup returns
  "length", "filter", "find", "some", "every", "includes", "indexOf", "forEach", "map",
  "flatMap", "reduce", "slice", "at", "join", "push", "unshift", "concat",
]);
// Array methods whose result still holds the looked-up elements.
const KEEPS = new Set(["filter", "find", "slice", "at"]);
// Array methods whose callback parameter is a looked-up element.
const CALLBACKS = new Set(["filter", "find", "some", "every", "forEach", "map", "flatMap"]);

const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, acc);
    else if (e.name.endsWith(".js")) acc.push(fp);
  }
  return acc;
};

// Blank comments and string contents (keeping quotes, newlines and `${…}` code), so
// a selector or a sentence never reads as code. A `handle-ok:` comment is kept.
function blank(source) {
  let out = "";
  let i = 0;
  const n = source.length;
  const stack = []; // template nesting: "`" for a template body, "{" for ${…} code
  while (i < n) {
    const c = source[i];
    const inTemplate = stack[stack.length - 1] === "`";
    if (inTemplate) {
      if (c === "\\") { out += "  "; i += 2; continue; }
      if (c === "`") { stack.pop(); out += c; i++; continue; }
      if (c === "$" && source[i + 1] === "{") { stack.push("{"); out += "${"; i += 2; continue; }
      out += c === "\n" ? "\n" : " "; i++; continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      const end = source.indexOf("\n", i);
      const stop = end < 0 ? n : end;
      const text = source.slice(i, stop);
      out += /handle-ok:/.test(text) ? text : " ".repeat(stop - i);
      i = stop; continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && source[j] !== c && source[j] !== "\n") j += source[j] === "\\" ? 2 : 1;
      out += c + " ".repeat(Math.max(0, j - i - 1)) + (j < n ? source[j] : "");
      i = j + 1; continue;
    }
    if (c === "`") { stack.push("`"); out += c; i++; continue; }
    if (c === "{" && stack.length) { stack.push("{"); out += c; i++; continue; }
    if (c === "}" && stack[stack.length - 1] === "{") { stack.pop(); out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

// Index just past the bracket that closes the one at `open` (same line).
function closeOf(line, open) {
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const want = [pairs[line[open]]];
  for (let i = open + 1; i < line.length; i++) {
    const c = line[i];
    if (pairs[c]) want.push(pairs[c]);
    else if (c === want[want.length - 1]) { want.pop(); if (!want.length) return i + 1; }
  }
  return -1;
}

const LOOKUP_CALL = new RegExp(String.raw`(?<![\w$])(?:(?:this|[\w$]+)(?:\?\.|\.))?(${LOOKUPS.join("|")})\(`, "g");

// Every lookup call on the line: {start, end} of `x.lookup(…)` and what follows it
// up to the first member that is not a kept-array step ([n], .filter(…), …).
function lookupCalls(line) {
  const calls = [];
  for (const m of line.matchAll(LOOKUP_CALL)) {
    let end = closeOf(line, m.index + m[0].length - 1);
    if (end < 0) continue;
    for (;;) {
      const rest = line.slice(end);
      const idx = rest.match(/^\??\.?\[/);
      if (idx) { const e = closeOf(line, end + idx[0].length - 1); if (e < 0) break; end = e; continue; }
      const keep = rest.match(/^\??\.([\w$]+)\(/);
      if (keep && KEEPS.has(keep[1])) { const e = closeOf(line, end + keep[0].length - 1); if (e < 0) break; end = e; continue; }
      break;
    }
    calls.push({ start: m.index, end });
  }
  return calls;
}

// Does `expr` evaluate to a looked-up element (or an array of them)? True when one
// of its top-level `||` / `&&` / `??` operands is a lookup chain and nothing else.
function yieldsHandle(expr) {
  const operands = [];
  let depth = 0, from = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (depth === 0 && /^(\|\||&&|\?\?)/.test(expr.slice(i, i + 2))) {
      operands.push(expr.slice(from, i)); from = i + 2; i++;
    }
  }
  operands.push(expr.slice(from));
  return operands.some(op => {
    const t = op.trim();
    const [call] = lookupCalls(t);
    return call && call.start === 0 && t.slice(call.end).trim() === "";
  });
}

const BINDING = /(?:\b(?:const|let|var)\s+([\w$]+)|(this\.[\w$]+))\s*=(?![=>])\s*(.+?);?\s*$/;
const FOR_OF = /\bfor\s*\(\s*(?:const|let|var)\s+([\w$]+)\s+of\s+(.+)\)\s*\{?\s*$/;

const esc = s => s.replace(/[.$]/g, c => "\\" + c);

function handleReaches(source) {
  const lines = blank(source).split("\n");
  const found = [];
  const tracked = new Map(); // name → block depth it was bound at (Infinity for this.*)
  let depth = 0;
  lines.forEach((line, i) => {
    const ok = /handle-ok:/.test(line) || /handle-ok:/.test(lines[i - 1] || "");
    const code = line.replace(/\/\/.*$/, "");
    const reaches = [];
    const opened = []; // callback parameters whose block continues on later lines

    // An array callback's parameter is a looked-up element when the callback is
    // chained onto a lookup (`from` = where the chain starts, `upTo` = where it may
    // still continue).
    const callbackReaches = (from, upTo) => {
      const chain = code.slice(from);
      for (const cb of chain.matchAll(/\??\.([\w$]+)\(\s*\(?\s*([\w$]+)\s*\)?\s*=>/g)) {
        if (cb.index > upTo - from) break;
        if (!CALLBACKS.has(cb[1])) continue;
        const body = chain.slice(cb.index + cb[0].length);
        // A block body that runs on past this line keeps the parameter tracked.
        if (/^\s*\{/.test(body) && closeOf(body, body.indexOf("{")) < 0) opened.push(cb[2]);
        for (const r of body.matchAll(new RegExp(String.raw`(?<![\w$.])${esc(cb[2])}\??\.([\w$]+)`, "g"))) {
          if (!ALLOWED.has(r[1])) reaches.push(`${cb[2]}.${r[1]}`);
        }
      }
    };

    // A member chained straight onto a lookup.
    for (const call of lookupCalls(code)) {
      const m = code.slice(call.end).match(/^\??\.([\w$]+)/);
      if (m && !ALLOWED.has(m[1])) reaches.push(`.${m[1]}`);
      callbackReaches(call.start, call.end);
    }

    // A name bound to a lookup on an earlier line (or earlier on this one).
    for (const name of tracked.keys()) {
      for (const r of code.matchAll(new RegExp(String.raw`(?<![\w$.])${esc(name)}\??\.([\w$]+)`, "g"))) {
        if (!ALLOWED.has(r[1])) reaches.push(`${name}.${r[1]}`);
        callbackReaches(r.index, r.index + r[0].length);
      }
    }

    const bind = code.match(BINDING);
    if (bind && yieldsHandle(bind[3])) tracked.set(bind[1] || bind[2], bind[2] ? -Infinity : depth);
    else if (bind && tracked.has(bind[1] || bind[2])) tracked.delete(bind[1] || bind[2]);
    const loop = code.match(FOR_OF);
    if (loop && yieldsHandle(loop[2])) tracked.set(loop[1], depth + 1);
    for (const name of opened) tracked.set(name, depth + 1);

    for (const c of code) {
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        for (const [name, d] of tracked) if (d > depth) tracked.delete(name);
      }
    }
    if (reaches.length && !ok) found.push({ line: i + 1, reaches });
  });
  return found;
}

test("the scanner follows a lookup into chains, bindings, loops and callbacks", () => {
  const sample = [
    `const stream = this.querySelector("m-stream")`,
    `const tail = stream?.recentWords(100)`,
    `const n = Number(stream?.getAttribute("burstTokens") || 350)`,
    `if (agent && agent.on) return`,
    `const agent = closestRole(this, "agent")`,
    `if (agent && agent.on) return`,
    `this._region = this.enclosing("faculty") || this.membrane()`,
    `this._region.version++`,
    `part(mind, "search")[0].start()`,
    `for (const child of this.part("aperture")) {`,
    `    child.steer({})`,
    `}`,
    `child.steer({})`,
    `const others = part(mind, "comparator").filter(el => el !== this && el.ready)`,
    `const names = apertureNames(this.membrane())`,
    `names.push("x")`,
    `const has = !!this.querySelector('[name="facts"]')`,
    `mind.addEventListener("x", fn)`,
    `const mind = this.membrane()`,
    `mind.addEventListener("x", fn)`,
    `mind.dispatchEvent(ev) // handle-ok: delivered to the requester's address`,
    `// handle-ok: same, on the line above`,
    `mind.dispatchEvent(ev)`,
    `// mind.dispatchEvent(ev)`,
    `const label = "mind.dispatchEvent(ev)"`,
    `const minds = part(society, "mind")`,
    `const ready = minds.every(mind => {`,
    `    return mind.on`,
    `})`,
    `mind.on`,
  ].join("\n");
  expect(handleReaches(sample)).toEqual([
    { line: 2, reaches: ["stream.recentWords"] },
    { line: 6, reaches: ["agent.on"] },
    { line: 8, reaches: ["this._region.version"] },
    { line: 9, reaches: [".start"] },
    { line: 11, reaches: ["child.steer"] },
    { line: 14, reaches: ["el.ready"] },
    { line: 28, reaches: ["mind.on"] },
  ]);
});

test("built-in components never call or read a looked-up element (M4, §6.3)", () => {
  const offenders = [];
  for (const fp of walk(BUILTIN)) {
    const rel = path.relative(BUILTIN, fp);
    if (SKIP.has(rel)) continue;
    for (const f of handleReaches(fs.readFileSync(fp, "utf8"))) {
      offenders.push(`${rel}:${f.line} ${f.reaches.join(", ")}`);
    }
  }
  expect(offenders).toEqual([]);
});
