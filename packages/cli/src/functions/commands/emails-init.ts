import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku'
import { generateEmailsArtifacts } from '../wirings/emails/pikku-command-emails.js'

type EmailsInitInput = {
  force?: boolean
}

const DEFAULT_EMAIL_DIR = 'emails'

const DEFAULT_THEME = {
  appName: 'Pikku App',
  previewText: 'Your app can render localized emails out of the box.',
  colors: {
    background: '#f5f7fb',
    surface: '#ffffff',
    text: '#101828',
    muted: '#475467',
    border: '#d0d5dd',
    primary: '#7c3aed',
    primaryText: '#ffffff',
    footer: '#667085',
  },
  fonts: {
    body: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
}

const DEFAULT_EN_LOCALE = {
  helloWorld: {
    subject: 'Hello from {{appName}}',
    eyebrow: 'Email templates are live',
    title: 'Your first Pikku email is ready',
    intro:
      'This starter template proves the pipeline works and gives you a place to shape your own visual language.',
    body: 'Chat to your AI to create new emails, refine the theme, or localize every message for your product.',
    cta: 'Open the email console',
    footer: 'Built with Pikku email templates.',
  },
}

const DEFAULT_DE_LOCALE = {
  helloWorld: {
    subject: 'Hallo von {{appName}}',
    eyebrow: 'E-Mail-Vorlagen sind aktiv',
    title: 'Deine erste Pikku-E-Mail ist bereit',
    intro:
      'Diese Startvorlage zeigt, dass die Pipeline funktioniert, und gibt dir einen Ausgangspunkt fuer dein eigenes Design.',
    body: 'Sprich mit deiner KI, um neue E-Mails zu erstellen, das Theme zu verfeinern oder jede Nachricht zu lokalisieren.',
    cta: 'E-Mail-Konsole oeffnen',
    footer: 'Erstellt mit Pikku-E-Mail-Vorlagen.',
  },
}

function layoutTemplate() {
  return `<!doctype html>
<html lang="{{locale}}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{subject}}</title>
  </head>
  <body style="margin:0;padding:32px 16px;background:{{theme.colors.background}};font-family:{{theme.fonts.body}};color:{{theme.colors.text}};">
    <div style="max-width:640px;margin:0 auto;background:{{theme.colors.surface}};border:1px solid {{theme.colors.border}};border-radius:20px;overflow:hidden;">
      {{content}}
    </div>
  </body>
</html>
`
}

function footerPartial() {
  return `<div style="padding:24px 32px;border-top:1px solid {{theme.colors.border}};font-size:13px;line-height:1.6;color:{{theme.colors.footer}};">
  <p style="margin:0;">{{t.helloWorld.footer}}</p>
</div>
`
}

function helloWorldHtml() {
  return `<div style="padding:32px;">
  <p style="margin:0 0 16px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:{{theme.colors.primary}};">
    {{t.helloWorld.eyebrow}}
  </p>
  <h1 style="margin:0 0 16px;font-size:32px;line-height:1.15;color:{{theme.colors.text}};">
    {{t.helloWorld.title}}
  </h1>
  <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:{{theme.colors.muted}};">
    Hello {{userName}}. {{t.helloWorld.intro}}
  </p>
  <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:{{theme.colors.muted}};">
    {{t.helloWorld.body}}
  </p>
  <a
    href="{{previewUrl}}"
    style="display:inline-block;padding:14px 18px;border-radius:999px;background:{{theme.colors.primary}};color:{{theme.colors.primaryText}};font-weight:600;text-decoration:none;"
  >
    {{t.helloWorld.cta}}
  </a>
</div>
{{> footer}}
`
}

function helloWorldSubject() {
  return `{{t.helloWorld.subject}}
`
}

function helloWorldText() {
  return `{{t.helloWorld.title}}

Hello {{userName}}.

{{t.helloWorld.intro}}

{{t.helloWorld.body}}

{{t.helloWorld.cta}}: {{previewUrl}}
`
}

async function ensureFile(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}

async function updateJsonConfig(configDir: string, emailDir: string) {
  const configPath = join(configDir, 'pikku.config.json')
  if (!existsSync(configPath)) {
    return false
  }

  const raw = await readFile(configPath, 'utf8')
  const parsed = JSON.parse(raw) as Record<string, unknown>
  if (
    typeof parsed.emailTemplatesDir === 'string' &&
    parsed.emailTemplatesDir
  ) {
    return false
  }

  parsed.emailTemplatesDir = emailDir
  await writeFile(configPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
  return true
}

export const pikkuEmailsInit = pikkuSessionlessFunc<EmailsInitInput, void>({
  func: async ({ logger, config }, input) => {
    const force = input?.force
    const configuredEmailDir =
      config.emailTemplatesDir ?? join(config.rootDir, DEFAULT_EMAIL_DIR)
    const emailDir =
      config.emailTemplatesDir && config.emailTemplatesDir.length > 0
        ? config.emailTemplatesDir
        : join(config.rootDir, DEFAULT_EMAIL_DIR)

    const files: Array<[string, string]> = [
      [
        join(emailDir, 'theme.json'),
        `${JSON.stringify(DEFAULT_THEME, null, 2)}\n`,
      ],
      [
        join(emailDir, 'locales', 'en.json'),
        `${JSON.stringify(DEFAULT_EN_LOCALE, null, 2)}\n`,
      ],
      [
        join(emailDir, 'locales', 'de.json'),
        `${JSON.stringify(DEFAULT_DE_LOCALE, null, 2)}\n`,
      ],
      [join(emailDir, 'partials', 'layout.html'), layoutTemplate()],
      [join(emailDir, 'partials', 'footer.html'), footerPartial()],
      [join(emailDir, 'templates', 'hello-world.html'), helloWorldHtml()],
      [
        join(emailDir, 'templates', 'hello-world.subject.txt'),
        helloWorldSubject(),
      ],
      [join(emailDir, 'templates', 'hello-world.text.txt'), helloWorldText()],
    ]

    const existing = !force
      ? files.map(([path]) => path).filter((path) => existsSync(path))
      : []
    if (existing.length > 0) {
      logger.error(
        `Email scaffold already exists at ${existing[0]}. Use --force to overwrite.`
      )
      process.exit(1)
    }

    await Promise.all(files.map(([path, content]) => ensureFile(path, content)))

    const configUpdated =
      !config.emailTemplatesDir &&
      (await updateJsonConfig(config.configDir, DEFAULT_EMAIL_DIR))

    if (!config.emailTemplatesDir && !configUpdated) {
      logger.warn(
        'Unable to auto-update pikku.config.json. Add "emailTemplatesDir": "emails" manually.'
      )
    }

    await generateEmailsArtifacts(logger, {
      emailTemplatesDir: emailDir,
      outDir: config.outDir,
    })

    logger.info(`Email templates initialized at ${configuredEmailDir}`)
  },
})
