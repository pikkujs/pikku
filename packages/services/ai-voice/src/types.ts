export interface STTService {
  transcribe(
    audio: Uint8Array,
    options?: { language?: string; format?: string }
  ): Promise<string>
}

export interface TTSService {
  synthesize(
    text: string,
    options?: { voice?: string; format?: string }
  ): Promise<Uint8Array>
  synthesizeStream?(
    text: string,
    options?: { voice?: string; format?: string }
  ): AsyncIterable<Uint8Array>
}
