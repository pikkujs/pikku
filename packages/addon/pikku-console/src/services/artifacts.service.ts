import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

export type ArtifactKind = 'Design' | 'Page' | 'Document'

export interface ArtifactSummary {
  id: string
  kind: ArtifactKind
  title: string
  summary: string
  device?: 'computer' | 'phone'
  at: number
}

export interface ArtifactFull extends ArtifactSummary {
  html?: string
  text?: string
}

const read = (file: string) => readFile(file, 'utf8').catch(() => undefined)

/**
 * What the builder made for the owner to look at, kept in the project as
 * `artifacts/<id>/`: an optional `artifact.json` (kind, title, summary, device),
 * plus `index.html` for a design or page, or `doc.md` for a document.
 */
export class ArtifactsService {
  constructor(private readonly root: string) {}

  async get(id: string): Promise<ArtifactFull | null> {
    if (!/^[\w.-]+$/.test(id)) return null
    const dir = join(this.root, 'artifacts', id)
    const [meta, html, text] = await Promise.all([
      read(join(dir, 'artifact.json')),
      read(join(dir, 'index.html')),
      read(join(dir, 'doc.md')),
    ])
    if (html === undefined && text === undefined) return null
    const info = meta ? (JSON.parse(meta) as Partial<ArtifactSummary>) : {}
    const at = (await stat(join(dir, html === undefined ? 'doc.md' : 'index.html'))).mtimeMs
    const heading =
      text?.match(/^#\s+(.+)$/m)?.[1] ?? html?.match(/<title>([^<]*)<\/title>/i)?.[1]
    return {
      id,
      kind: info.kind ?? (html === undefined ? 'Document' : 'Page'),
      title: info.title ?? heading ?? id,
      summary: info.summary ?? '',
      ...(info.device ? { device: info.device } : {}),
      at,
      ...(html === undefined ? {} : { html }),
      ...(text === undefined ? {} : { text }),
    }
  }

  async list(): Promise<ArtifactSummary[]> {
    const ids = await readdir(join(this.root, 'artifacts')).catch(() => [] as string[])
    const all = await Promise.all(ids.map((id) => this.get(id)))
    return all
      .filter((a): a is ArtifactFull => !!a)
      .map(({ html: _html, text: _text, ...summary }) => summary)
      .sort((a, b) => b.at - a.at)
  }
}
