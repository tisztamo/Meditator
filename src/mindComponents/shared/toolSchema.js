// toolSchema.js — the CLOSED-MENU guarantee, shared by BOTH tool harnesses
// (agent-loop.md §4, §8). A mind's hand (offered to <m-act>) and an agent's tool
// (offered to <m-agent>) are the SAME capability object, so the validator that
// enforces "the model can only ever call a registered verb with schema-valid
// arguments" belongs to neither harness — it belongs to the contract they share.
// Hoisted verbatim out of mAct.js (agent-loop.md §13, milestone 2) so <m-agent> and
// its tools no longer import from a mind component.

/**
 * A small, dependency-free validator for the slice of JSON Schema a capability's
 * `parameters` actually uses: object shape, `required` keys, `enum`, and primitive
 * `type` (string/number/integer/boolean). Returns null when valid, or a short reason
 * string when not. Deliberately narrow — the menu is closed, so we validate the
 * declared verbs, not arbitrary schemas. Exported for tests.
 */
export function validateAgainstSchema(value, schema) {
    if (!schema || typeof schema !== "object") return null
    if (schema.type === "object" || schema.properties || schema.required) {
        if (value == null || typeof value !== "object" || Array.isArray(value)) return "expected an object"
        for (const key of schema.required || []) {
            if (!(key in value) || value[key] == null) return `missing required "${key}"`
        }
        for (const [key, propSchema] of Object.entries(schema.properties || {})) {
            if (!(key in value) || value[key] == null) continue   // optional & absent → fine
            const why = validatePrimitive(value[key], propSchema, key)
            if (why) return why
        }
        return null
    }
    return validatePrimitive(value, schema, "value")
}

function validatePrimitive(value, schema, key) {
    if (!schema || typeof schema !== "object") return null
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
        return `"${key}" not one of [${schema.enum.join(", ")}]`
    }
    switch (schema.type) {
        case "string":  if (typeof value !== "string") return `"${key}" must be a string`; break
        case "number":  if (typeof value !== "number") return `"${key}" must be a number`; break
        case "integer": if (!Number.isInteger(value)) return `"${key}" must be an integer`; break
        case "boolean": if (typeof value !== "boolean") return `"${key}" must be a boolean`; break
        default: break   // unconstrained or composite type — accept
    }
    return null
}
