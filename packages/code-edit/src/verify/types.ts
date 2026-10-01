export type VerifySeverity = 'error' | 'warn' | 'info'

export type VerifyStepId =
  'codegen' | 'typecheck' | 'frontend-typecheck' | 'checks'

/** One problem a verify run found, located where possible so a UI can link straight to it. */
export type VerifyFinding = {
  id: string
  severity: VerifySeverity
  message: string
  step: VerifyStepId
  file?: string
  line?: number
  code?: string
  hint?: string
}

export type VerifyStep = {
  id: VerifyStepId
  target?: string
  ok: boolean
  skipped?: string
  durationMs: number
}

export type VerifyResult = {
  ok: boolean
  rootDir: string
  startedAt: string
  durationMs: number
  steps: VerifyStep[]
  findings: VerifyFinding[]
}
