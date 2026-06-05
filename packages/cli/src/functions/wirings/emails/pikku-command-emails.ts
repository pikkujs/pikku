import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku'
import type { PikkuCLIConfig } from '../../../../types/config.js'
import type { CLILogger } from '../../../services/cli-logger.service.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeEmailsModule } from './serialize-emails.js'

function sha256(input: string) {
  return createHash('sha256').update(input).digest('hex')
}

function extractVariables(...sources: string[]) {
  const variables = new Set<string>()
  for (const source of sources) {
    for (const match of source.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
      const key = String(match[1]).trim()
      if (!key || key === 'content' || key.startsWith('>')) continue
      const rootKey = key.split('.')[0]
      if (rootKey === 't' || rootKey === 'theme' || rootKey === 'locale') continue
      if (rootKey === 'subject') continue
      variables.add(rootKey)
    }
  }
  return [...variables].sort()
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    )
    return `{${entries
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function collectStringLeaves(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStringLeaves(item))
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap((nested) => collectStringLeaves(nested))
  }
  return []
}

export const pikkuEmails = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config }) => {
    return generateEmailsArtifacts(logger, config)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating emails',
      commandEnd: 'Generated emails',
    }),
  ],
})

export async function generateEmailsArtifacts(
  logger: CLILogger,
  config: Pick<PikkuCLIConfig, 'outDir'> & { emailTemplatesDir?: string }
) {
  const emailDir = config.emailTemplatesDir
  if (!emailDir) {
    logger.debug({
      message:
        'Skipping emails (set emailTemplatesDir in pikku.config.json to enable).',
      type: 'skip',
    })
    return
  }

  const typedOut = join(config.outDir, 'email', 'pikku-emails.gen.ts')
  const metaOut = join(config.outDir, 'email', 'pikku-emails-meta.gen.json')

  const [themeRaw, localeFiles, templateFiles, partialFiles] = await Promise.all([
    readFile(join(emailDir, 'theme.json'), 'utf8').catch(() => '{}'),
    readdir(join(emailDir, 'locales')).catch(() => []),
    readdir(join(emailDir, 'templates')).catch(() => []),
    readdir(join(emailDir, 'partials')).catch(() => []),
  ])

  const theme = JSON.parse(themeRaw) as Record<string, unknown>
  const locales = Object.fromEntries(
    await Promise.all(
      localeFiles
        .filter((file) => extname(file) === '.json')
        .map(async (file) => {
          const locale = basename(file, '.json')
          const raw = await readFile(join(emailDir, 'locales', file), 'utf8')
          return [locale, JSON.parse(raw) as Record<string, unknown>] as const
        })
    )
  )

  const partials = Object.fromEntries(
    await Promise.all(
      partialFiles
        .filter((file) => extname(file) === '.html')
        .map(async (file) => {
          const name = basename(file, '.html')
          const raw = await readFile(join(emailDir, 'partials', file), 'utf8')
          return [name, raw] as const
        })
    )
  )

  const templateNames = [
    ...new Set(
      templateFiles
        .filter(
          (file) =>
            file.endsWith('.html') ||
            file.endsWith('.subject.txt') ||
            file.endsWith('.text.txt')
        )
        .map((file) =>
          file.endsWith('.subject.txt')
            ? file.slice(0, -'.subject.txt'.length)
            : file.endsWith('.text.txt')
              ? file.slice(0, -'.text.txt'.length)
              : file.slice(0, -'.html'.length)
        ),
    ),
  ].sort()

  if (templateNames.length === 0) {
    logger.debug({
      message: 'Skipping emails (no templates found).',
      type: 'skip',
    })
    return
  }

  const templates = Object.fromEntries(
    await Promise.all(
      templateNames.map(async (templateName) => {
        const [html, subject, text] = await Promise.all([
          readFile(join(emailDir, 'templates', `${templateName}.html`), 'utf8'),
          readFile(join(emailDir, 'templates', `${templateName}.subject.txt`), 'utf8'),
          readFile(join(emailDir, 'templates', `${templateName}.text.txt`), 'utf8').catch(
            () => ''
          ),
        ])
        const localeSources = Object.values(locales).flatMap((strings) =>
          collectStringLeaves(strings)
        )
        const variables = extractVariables(
          html,
          subject,
          text,
          ...Object.values(partials),
          ...localeSources
        )
        const hashes = Object.fromEntries(
          Object.entries(locales).map(([locale, strings]) => {
            const localePayload = stableStringify({
              templateName,
              locale,
              theme,
              strings,
              partials,
              subject,
              html,
              text,
            })
            return [
              locale,
              {
                contentHash: sha256(localePayload),
                htmlHash: sha256(stableStringify({ html, partials, theme, strings })),
                subjectHash: sha256(stableStringify({ subject, strings })),
                textHash: sha256(stableStringify({ text, strings })),
              },
            ] as const
          })
        )
        return [
          templateName,
          {
            html,
            subject,
            text,
            variables,
            hashes,
          },
        ] as const
      })
    )
  )

  const meta = {
    src: emailDir,
    themeHash: sha256(stableStringify(theme)),
    templates: Object.fromEntries(
      Object.entries(templates).map(([name, template]) => [
        name,
        {
          variables: template.variables,
          hasHtml: Boolean(template.html),
          hasSubject: Boolean(template.subject),
          hasText: Boolean(template.text),
          locales: template.hashes,
        },
      ])
    ),
  }

  await writeFileInDir(
    logger,
    typedOut,
    serializeEmailsModule({ theme, locales, partials, templates })
  )
  await writeFileInDir(logger, metaOut, JSON.stringify(meta, null, 2), {
    ignoreModifyComment: true,
  })
  return true
}
