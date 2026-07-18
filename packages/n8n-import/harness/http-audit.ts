/**
 * Audit what the corpus's httpRequest nodes actually configure — so we know
 * how much of the node is "more than fetch" in practice.
 *   node --import tsx harness/http-audit.ts
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function firstJson(s: string): string {
  const t = s.replace(/^﻿/, '')
  let d = 0,
    q = false,
    e = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (e) {
      e = false
      continue
    }
    if (c === '\\') {
      e = true
      continue
    }
    if (c === '"') {
      q = !q
      continue
    }
    if (q) continue
    if (c === '{' || c === '[') d++
    else if (c === '}' || c === ']') {
      d--
      if (d === 0) return t.slice(0, i + 1)
    }
  }
  return t
}
function load(f: string): any {
  const s = readFileSync(f, 'utf-8')
  try {
    return JSON.parse(s)
  } catch {
    return JSON.parse(firstJson(s))
  }
}
function walk(dir: string): string[] {
  const out: string[] = []
  const w = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name)
      if (e.isDirectory()) w(f)
      else if (e.name.endsWith('.json')) out.push(f)
    }
  }
  try {
    w(dir)
  } catch {}
  return out
}

const feat: Record<string, number> = {}
const authKinds: Record<string, number> = {}
let total = 0
const bump = (k: string) => (feat[k] = (feat[k] || 0) + 1)

for (const dir of ['.corpus', '.corpus-ai']) {
  for (const f of walk(dir)) {
    let wf: any
    try {
      wf = load(f)
    } catch {
      continue
    }
    const nodes: any[] = wf?.nodes ?? []
    for (const n of nodes) {
      const t = String(n?.type ?? '')
      if (!/\.httpRequest(Tool)?$/.test(t)) continue
      total++
      const p = n?.parameters ?? {}
      const o = p.options ?? {}
      // authentication
      if (p.authentication && p.authentication !== 'none') {
        bump('auth')
        authKinds[String(p.authentication)] =
          (authKinds[String(p.authentication)] || 0) + 1
      }
      if (p.nodeCredentialType || n?.credentials) bump('credentials-attached')
      // pagination
      if (o.pagination || p.pagination) bump('pagination')
      // batching / rate limit
      if (o.batching || o.batchSize || o.batchInterval) bump('batching')
      // retry / continue on fail
      if (n?.retryOnFail || n?.continueOnFail || o.retry)
        bump('retry/continueOnFail')
      // binary
      if (
        p.sendBinaryData ||
        o.response?.response?.responseFormat === 'file' ||
        p.responseFormat === 'file' ||
        /file/i.test(String(o?.response?.response?.responseFormat ?? ''))
      )
        bump('binary/file')
      // multipart / body content type
      if (
        p.contentType === 'multipart-form-data' ||
        p.bodyContentType === 'multipart-form-data'
      )
        bump('multipart')
      // full response / never error
      if (o.response?.response?.fullResponse || o.fullResponse)
        bump('fullResponse')
      if (o.response?.response?.neverError || o.neverError) bump('neverError')
      // proxy / ssl / redirects / timeout
      if (o.proxy) bump('proxy')
      if (o.allowUnauthorizedCerts) bump('ignoreSSL')
      if (o.redirect) bump('redirect-opts')
      if (o.timeout) bump('timeout')
      // plain: method present, has url — the baseline
      if (p.url) bump('has-url')
      if (p.method && p.method !== 'GET') bump('non-GET')
    }
  }
}

console.log(`httpRequest nodes: ${total}\n`)
const pct = (n: number) => `${((100 * n) / total).toFixed(1)}%`.padStart(6)
for (const [k, v] of Object.entries(feat).sort((a, b) => b[1] - a[1])) {
  console.log(`${pct(v)}  ${String(v).padStart(5)}  ${k}`)
}
console.log('\nauth kinds:')
for (const [k, v] of Object.entries(authKinds).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(5)}  ${k}`)
}
