export interface HostMailOptions {
  url: string
  token: string
  onError?: (error: unknown) => void
}

export class HostMailService {
  constructor(readonly options: HostMailOptions) {}

  async send(input: { to: string; subject: string }): Promise<{ id: string }> {
    return { id: `${this.options.url}:${input.to}:${input.subject}` }
  }
}
