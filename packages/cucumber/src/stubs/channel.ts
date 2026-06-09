export interface ChannelWireConfig {
  channelId?: string
  openingData?: unknown
}

export interface StubChannelWire {
  wire: {
    channelId: string
    openingData: unknown
    state: 'initial' | 'open' | 'closed'
    send(data: unknown, isBinary?: boolean): Promise<void>
    sendBinary(data: unknown): Promise<void>
    close(): Promise<void>
    setState<T>(state: T): Promise<void>
    getState<T>(): Promise<T | undefined>
    clearState(): Promise<void>
  }
  readonly sentMessages: unknown[]
  readonly isClosed: boolean
}

export function createStubChannelWire(
  config: ChannelWireConfig = {}
): StubChannelWire {
  const sentMessages: unknown[] = []
  let closed = false
  let channelState: unknown = undefined
  let state: 'initial' | 'open' | 'closed' = 'open'

  const wire = {
    channelId: config.channelId ?? 'test-channel-id',
    openingData: config.openingData ?? {},
    get state(): 'initial' | 'open' | 'closed' {
      return state
    },
    async send(data: unknown) {
      sentMessages.push(data)
    },
    async sendBinary(data: unknown) {
      sentMessages.push(data)
    },
    async close() {
      state = 'closed'
      closed = true
    },
    async setState<T>(s: T) {
      channelState = s
    },
    async getState<T>() {
      return channelState as T | undefined
    },
    async clearState() {
      channelState = undefined
    },
  }

  return {
    wire,
    get sentMessages() {
      return sentMessages
    },
    get isClosed() {
      return closed
    },
  }
}
