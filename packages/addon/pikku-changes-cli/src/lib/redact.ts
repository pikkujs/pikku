import type { Finding } from './finding.js'

export const REDACTED = '[REDACTED]'

/**
 * Known-secret shapes. Each match is replaced whole, except the `key = value` form, which keeps the
 * key so a finding still says what leaked.
 */
const PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g,
  /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bnpm_[A-Za-z0-9]{36}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]+@/gi,
]

const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/g
const ASSIGNMENT =
  /\b((?:[A-Za-z0-9_]*_)?(?:api[_-]?key|secret|token|passw(?:or)?d|private[_-]?key|access[_-]?key|client[_-]?secret)[A-Za-z0-9_]*["']?\s*[:=]\s*)(["']?)[^\s"',;]{8,}\2/gi

export const redact = (text: string): string => {
  let out = text
  for (const pattern of PATTERNS) out = out.replace(pattern, REDACTED)
  out = out.replace(BEARER, (_, scheme) => `${scheme} ${REDACTED}`)
  out = out.replace(
    ASSIGNMENT,
    (_, key, quote) => `${key}${quote}${REDACTED}${quote}`
  )
  return out
}

export const redactFinding = (finding: Finding): Finding => ({
  ...finding,
  message: redact(finding.message),
  ...(finding.file === undefined ? {} : { file: redact(finding.file) }),
  ...(finding.rule === undefined ? {} : { rule: redact(finding.rule) }),
})
