import { join } from 'node:path'
import {
  EMAIL_CATALOG,
  addCatalogEmail,
  findCatalogEmail,
} from '@pikku/code-edit/emails'
import { pikkuSessionlessFunc } from '#pikku/function'

/** Lists the ready-made emails, or prints one in full with its locale block and wiring. */
export const pikkuEmailsCatalog = pikkuSessionlessFunc<{ name?: string }, void>(
  {
    func: async (_services, input) => {
      if (!input?.name) {
        const lines = EMAIL_CATALOG.map(
          (e) => `${e.name} — ${e.title}\n    ${e.description}`
        )
        process.stdout.write(
          `${lines.join('\n')}\n\nShow one with \`pikku emails catalog <name>\`; add it with \`pikku emails add <name>\`.\n`
        )
        return
      }
      const entry = findCatalogEmail(input.name)
      if (!entry) {
        throw new Error(
          `No catalogue email named "${input.name}". Available: ${EMAIL_CATALOG.map((e) => e.name).join(', ')}`
        )
      }
      const parts = [
        `# ${entry.name} — ${entry.title}\n${entry.description}\nData: ${entry.data.join(', ') || '(none)'}`,
        `## locales/en.json\n${JSON.stringify(entry.locale, null, 2)}`,
        ...Object.entries(entry.source).map(
          ([file, content]) => `## templates/${file}\n${content.trimEnd()}`
        ),
      ]
      if (entry.usage) parts.push(`## Wiring\n${entry.usage}`)
      process.stdout.write(`${parts.join('\n\n')}\n`)
    },
  }
)

/** Copies a catalogue email into emailTemplatesDir and merges its copy into the base locale. */
export const pikkuEmailsAdd = pikkuSessionlessFunc<
  { name: string; force?: boolean },
  void
>({
  func: async ({ config }, { name, force }) => {
    const emailsDir = config.emailTemplatesDir || join(config.rootDir, 'emails')
    const result = addCatalogEmail(emailsDir, name, { force })
    const lines = [
      ...result.written.map((path) => `wrote ${path}`),
      ...result.skipped.map(
        (path) => `kept ${path} (exists; --force overwrites)`
      ),
      result.localeKeysAdded.length
        ? `added ${result.localeKeysAdded.length} key(s) to ${result.localeFile}`
        : `${result.localeFile} already has every key`,
      `Run \`pikku emails generate\` (pikku dev does it on save), then send it as template: { name: '${result.name}', data }.`,
    ]
    process.stdout.write(`${lines.join('\n')}\n`)
  },
})
