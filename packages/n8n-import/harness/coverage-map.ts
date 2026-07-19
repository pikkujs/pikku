/**
 * Definitive coverage classification for the corpus's integration nodes.
 * For every non-native node type, classify against the three existing
 * coverage sources — @pikku/addon-graph natives, hand-crafted @pikku addons,
 * and the OpenAPI/registry addons — and rank what's truly MISSING by frequency.
 *
 *   node --import tsx harness/coverage-map.ts [--dir <corpus> ...]
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseN8n } from '../src/parse-n8n.js'

function firstJson(s: string): string {
  const t = s.replace(/^﻿/, '')
  let depth = 0,
    inStr = false,
    esc = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (esc) {
      esc = false
      continue
    }
    if (c === '\\') {
      esc = true
      continue
    }
    if (c === '"') {
      inStr = !inStr
      continue
    }
    if (inStr) continue
    if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) return t.slice(0, i + 1)
    }
  }
  return t
}

function load(f: string): unknown {
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
  w(dir)
  return out
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// data-transform natives already implemented by @pikku/addon-graph
const graphNative = [
  'sort',
  'limit',
  'unique',
  'splitout',
  'removeduplicates',
  'aggregate',
  'summarize',
  'reverse',
  'itemlists',
  'merge',
  'renamekeys',
  'pick',
  'omit',
  'set',
  'editfields',
  'coalesce',
  'typeconvert',
  'math',
  'jwt',
  'datetime',
  'stringtransform',
  'crypto',
  'sleep',
  'chunk',
  'groupby',
  'find',
].map(norm)

// native n8n nodes the importer emits directly (control flow / io / no addon)
const nativeN8n = [
  'httprequest',
  'stoperror',
  'stopanderror',
  'respondtowebhook',
  'executeworkflow',
  'executeworkflowtrigger',
  'cron',
  'scheduletrigger',
  'form',
  'converttofile',
  'readwritefile',
  'extractfromfile',
  'html',
  'markdown',
  'noop',
  'code',
  'function',
  'functionitem',
  'filter',
  'if',
  'switch',
  'splitinbatches',
  'wait',
  'n8n',
  'editimage',
  'xml',
  'compression',
  'webhook',
  'manualtrigger',
  'chattrigger',
  'errortrigger',
].map(norm)

// hand-crafted @pikku/* addons that exist in packages/<cat>/<name>
const hand = [
  'assemblyai',
  'deepl',
  'elevenlabs',
  'ollama',
  'openai',
  'whisperasr',
  'googleanalytics',
  'metaconversions',
  'metabase',
  'posthog',
  'segment',
  'redis',
  'flyio',
  'googlecloudstorage',
  's3',
  'discord',
  'telegram',
  'twilio',
  'whatsapp',
  'hubspot',
  'coingecko',
  'hackernews',
  'icalendar',
  'qrcode',
  'rssfeed',
  'spreadsheetfile',
  'airtable',
  'mongodb',
  'mysql',
  'postgres',
  'supabase',
  'git',
  'jenkins',
  'shopify',
  'emailsend',
  'gmail',
  'imap',
  'mailgun',
  'sendgrid',
  'jotform',
  'typeform',
  'cloudflare',
  'kafka',
  'ssh',
  'sentry',
  'stripe',
].map(norm)

let openapi: string[] = []
try {
  const cache = JSON.parse(
    readFileSync(
      '/Users/yasser/git/pikku/addons/test-openapi-results/cache.json',
      'utf-8'
    )
  )
  openapi = Object.keys(cache).map(norm)
} catch {
  /* registry cache not present locally */
}

const graphSet = new Set(graphNative)
const natSet = new Set(nativeN8n)
const handSet = new Set(hand)
const oaSet = new Set(openapi)

type Bucket = 'NATIVE' | 'HAND-ADDON' | 'OPENAPI' | 'MISSING'
function classify(t: string): Bucket {
  const n = norm(t)
  if (natSet.has(n) || graphSet.has(n)) return 'NATIVE'
  if (handSet.has(n)) return 'HAND-ADDON'
  if (oaSet.has(n)) return 'OPENAPI'
  for (const a of oaSet) {
    if (
      a.length >= 5 &&
      n.length >= 5 &&
      (a.includes(n) || n.includes(a) || a.endsWith(n) || n.endsWith(a))
    )
      return 'OPENAPI'
  }
  return 'MISSING'
}

const dirs = process.argv.slice(2).filter((a) => a !== '--dir')
const corpusDirs = dirs.length ? dirs : ['.corpus', '.corpus-ai']

const freq: Record<string, number> = {}
let workflows = 0
for (const dir of corpusDirs) {
  let files: string[] = []
  try {
    files = walk(dir)
  } catch {
    continue
  }
  for (const f of files) {
    let p
    try {
      p = parseN8n(load(f))
    } catch {
      continue
    }
    workflows++
    for (const nd of p.nodes) {
      if (nd.disabled) continue
      if (
        ['integration', 'agentTool', 'set', 'control', 'code'].includes(nd.role)
      ) {
        const base = nd.typeShort.replace(/Tool$/, '')
        freq[base] = (freq[base] || 0) + 1
      }
    }
  }
}

const rows = Object.entries(freq).sort((a, b) => b[1] - a[1])
const tot: Record<string, number> = {}
const cnt: Record<string, number> = {}
for (const [t, c] of rows) {
  const k = classify(t)
  tot[k] = (tot[k] || 0) + c
  cnt[k] = (cnt[k] || 0) + 1
}

const grand = Object.values(tot).reduce((a, b) => a + b, 0)
console.log(
  `Corpus: ${workflows} workflows, ${grand} classified node instances\n`
)
console.log('=== coverage by node instances ===')
for (const k of ['NATIVE', 'HAND-ADDON', 'OPENAPI', 'MISSING'] as Bucket[]) {
  const pct = ((100 * (tot[k] || 0)) / grand).toFixed(1)
  console.log(
    `${k.padEnd(11)} types:${String(cnt[k] || 0).padStart(4)}  instances:${String(tot[k] || 0).padStart(6)}  ${pct.padStart(5)}%`
  )
}
console.log('\n=== truly MISSING, ranked (build these) ===')
let shown = 0
for (const [t, c] of rows) {
  if (classify(t) === 'MISSING' && shown < 35) {
    console.log(String(c).padStart(5), t)
    shown++
  }
}
