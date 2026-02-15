export interface AIEmbedderService {
  embed(texts: string[]): Promise<number[][]>
}
