export class AuditLog {
  readonly entries: string[] = []

  constructor(
    readonly options: { label: string; onError?: (error: unknown) => void }
  ) {}

  record(entry: 'boot' | 'send'): void {
    this.entries.push(`${this.options.label}:${entry}`)
  }
}
