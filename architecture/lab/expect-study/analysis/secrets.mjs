/**
 * Where this box keeps its keys.
 *
 * `TYPESAFE_API_KEY` lives in `~/.env` (sourced by the shell profile), not in a
 * repo `.env` and not in the analysis scripts' environment. `resolveModelRef()`
 * interpolates `${TYPESAFE_API_KEY}` out of `process.env`, so a lab script has
 * to put it there before `loadModelConfig()` runs.
 *
 * The value is never printed and never written anywhere.
 */
import fs from 'node:fs'
import path from 'node:path'

export function loadEnvKey(name, { repoRoot } = {}) {
    if (process.env[name]) return true
    const candidates = [
        repoRoot ? path.join(repoRoot, '.env') : null,
        process.env.HOME ? path.join(process.env.HOME, '.env') : null,
    ].filter(Boolean)
    const pattern = new RegExp(`^\\s*(export\\s+)?${name}\\s*=`)
    for (const file of candidates) {
        let env
        try { env = fs.readFileSync(file, 'utf8') } catch { continue }
        const line = env.split('\n').find(l => pattern.test(l))
        if (!line) continue
        const value = line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
        if (!value) continue
        process.env[name] = value
        return true
    }
    return false
}
