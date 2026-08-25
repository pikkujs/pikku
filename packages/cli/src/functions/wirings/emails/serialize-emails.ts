type EmailTemplateAssets = {
  html: string
  subject: string
  text: string
  variables: string[]
  hashes: Record<
    string,
    {
      contentHash: string
      htmlHash: string
      subjectHash: string
      textHash: string
    }
  >
}

type SerializeEmailsInput = {
  theme: Record<string, unknown>
  locales: Record<string, Record<string, unknown>>
  partials: Record<string, string>
  templates: Record<string, EmailTemplateAssets>
}

/**
 * The generated module is the assets and the types over them — the renderer
 * itself is `renderEmail` in @pikku/core, which is the same for every
 * application and which nothing here could typecheck or lint.
 *
 * What is genuinely per-application: the four asset blobs, the union of
 * template and locale names taken from their keys, and `TemplateVariableMap`,
 * which is what makes `renderEmailTemplate` reject a variable the named
 * template does not declare.
 */
export const serializeEmailsModule = ({
  theme,
  locales,
  partials,
  templates,
}: SerializeEmailsInput) => {
  const serializedTheme = JSON.stringify(theme, null, 2)
  const serializedLocales = JSON.stringify(locales, null, 2)
  const serializedPartials = JSON.stringify(partials, null, 2)
  const serializedTemplates = JSON.stringify(templates, null, 2)

  return `import { renderEmail, type EmailAssets } from '@pikku/core/services'

type EmailPrimitive = string | number | boolean | null | undefined
type EmailTemplateValue = EmailPrimitive | Record<string, unknown> | Array<unknown>

const EMAIL_THEME = ${serializedTheme} as const
const EMAIL_LOCALES = ${serializedLocales} as const
const EMAIL_PARTIALS = ${serializedPartials} as const
const EMAIL_TEMPLATES = ${serializedTemplates} as const

export type EmailTemplateName = keyof typeof EMAIL_TEMPLATES
export type EmailLocale = keyof typeof EMAIL_LOCALES

type TemplateVariableMap = {
${Object.entries(templates)
  .map(([name, template]) => {
    const variables =
      template.variables.length === 0
        ? 'Record<string, never>'
        : `{
${template.variables
  .map((variable) => `    ${JSON.stringify(variable)}?: EmailTemplateValue`)
  .join('\n')}
  }`
    return `  ${JSON.stringify(name)}: ${variables}`
  })
  .join('\n')}
}

type EmailTemplateVariables<TName extends EmailTemplateName> =
  TemplateVariableMap[TName]

type RenderEmailInput<TName extends EmailTemplateName> = {
  name: TName
  locale?: EmailLocale
  data: EmailTemplateVariables<TName>
}

export type RenderedEmail<TName extends EmailTemplateName> = {
  name: TName
  locale: EmailLocale
  subject: string
  html: string
  text?: string
  variables: ReadonlyArray<string>
  hash: (typeof EMAIL_TEMPLATES)[TName]['hashes'][EmailLocale]['contentHash']
}

// The assets are frozen literals so their keys can drive the types above; the
// renderer reads them as plain records.
const EMAIL_ASSETS = {
  theme: EMAIL_THEME,
  locales: EMAIL_LOCALES,
  partials: EMAIL_PARTIALS,
  templates: EMAIL_TEMPLATES,
} as unknown as EmailAssets

export const EMAILS = EMAIL_TEMPLATES

export function renderEmailTemplate<TName extends EmailTemplateName>(
  input: RenderEmailInput<TName>
): RenderedEmail<TName> {
  const { locale, subject, html, text, variables, hash } = renderEmail(
    EMAIL_ASSETS,
    {
      name: String(input.name),
      locale: input.locale as string | undefined,
      data: (input.data ?? {}) as Record<string, unknown>,
    }
  )

  return {
    name: input.name,
    locale: locale as EmailLocale,
    subject,
    html,
    ...(text ? { text } : {}),
    variables,
    hash: hash as RenderedEmail<TName>['hash'],
  }
}
`
}
