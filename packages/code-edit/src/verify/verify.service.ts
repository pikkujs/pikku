import {
  readLastVerifyResult,
  runVerify,
  type RunVerifyOptions,
} from './run-verify.js'
import type { VerifyResult } from './types.js'

/** Runs verify for one project at a time and serves its latest recorded result. */
export class VerifyService {
  private running: Promise<VerifyResult> | null = null

  constructor(private rootDir: string) {}

  get isRunning(): boolean {
    return this.running !== null
  }

  run(options: Omit<RunVerifyOptions, 'rootDir'> = {}): Promise<VerifyResult> {
    if (!this.running) {
      this.running = runVerify({ ...options, rootDir: this.rootDir }).finally(
        () => {
          this.running = null
        }
      )
    }
    return this.running
  }

  last(): Promise<VerifyResult | null> {
    return readLastVerifyResult(this.rootDir)
  }
}
