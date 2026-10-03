import { useEffect, useMemo, useState } from 'react'
import type { RJSFSchema } from '@rjsf/utils'
import { useSearchParams } from '../router'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { useRenderEmailPreview } from './useWirings'

export type EmailPreviewValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | Array<unknown>

type EmailTemplates = NonNullable<
  ReturnType<typeof usePikkuMeta>['meta']['emailsMeta']
>['templates']

type EmailTemplateMeta = EmailTemplates[string]

export interface EmailsCompose {
  templates: EmailTemplates
  templateNames: string[]
  selectedTemplate: string | null
  selectedMeta: EmailTemplateMeta | null
  /** Resolved from the URL, falling back to the template's first locale — never
   *  a locale the selected template does not have. */
  selectedLocale: string | null
  localeOptions: { label: string; value: string }[]
  /** JSON schema for the template's variables, driving the compose form. */
  schema: RJSFSchema
  previewInput: Record<string, EmailPreviewValue>
  setPreviewInput: (input: Record<string, EmailPreviewValue>) => void
  preview: ReturnType<typeof useRenderEmailPreview>
  selectTemplate: (templateName: string) => void
  selectLocale: (locale: string) => void
  loading: boolean
}

export interface UseEmailsComposeOptions {
  /** Set false for an instance that only exists to keep hook order stable — it
   *  skips the preview request so an unused copy costs nothing. */
  enabled?: boolean
}

function buildVariablesSchema(variables: string[]): RJSFSchema {
  return {
    type: 'object',
    properties: Object.fromEntries(
      variables.map((name) => [name, { type: 'string', title: name }])
    ),
  }
}

/** Locales a template declares, in a stable order. */
function localesOf(template: EmailTemplateMeta | undefined): string[] {
  return Object.keys(template?.locales ?? {}).sort((a, b) => a.localeCompare(b))
}

/**
 * The emails workbench state: which template and locale are being previewed,
 * the variable values typed into the compose form, and the rendered preview
 * they produce.
 *
 * It lives here so the compose form can be mounted apart from the preview —
 * `EmailsComposePanel` in a host's side panel or phone sheet, with the same
 * state handed back to `EmailsPage` through its `compose` prop so both drive one
 * preview. Standalone, `EmailsPage` calls this itself and keeps the form beside
 * the preview.
 */
export const useEmailsCompose = ({
  enabled = true,
}: UseEmailsComposeOptions = {}): EmailsCompose => {
  const { meta, loading } = usePikkuMeta()
  const [searchParams, setSearchParams] = useSearchParams()
  const [previewInput, setPreviewInput] = useState<
    Record<string, EmailPreviewValue>
  >({})

  const templates = meta.emailsMeta?.templates || {}
  const templateNames = useMemo(
    () => Object.keys(templates).sort((a, b) => a.localeCompare(b)),
    [templates]
  )

  const selectedTemplate = searchParams.get('template')
  const selectedMeta = selectedTemplate ? templates[selectedTemplate] : null

  const localeOptions = useMemo(
    () =>
      localesOf(selectedMeta ?? undefined).map((locale) => ({
        label: locale,
        value: locale,
      })),
    [selectedMeta]
  )

  const selectedLocaleParam = searchParams.get('locale')
  const selectedLocale = selectedMeta
    ? localeOptions.find((option) => option.value === selectedLocaleParam)
        ?.value ||
      localeOptions[0]?.value ||
      'en'
    : null

  useEffect(() => {
    if (!enabled) return
    if (!selectedTemplate || !selectedLocale) return
    if (searchParams.get('locale') !== selectedLocale) {
      setSearchParams(
        { template: selectedTemplate, locale: selectedLocale },
        { replace: true }
      )
    }
  }, [enabled, searchParams, selectedLocale, selectedTemplate, setSearchParams])

  const preview = useRenderEmailPreview(
    selectedTemplate,
    selectedLocale ?? undefined,
    previewInput,
    enabled && !!selectedTemplate && !!selectedLocale
  )

  const schema = useMemo(
    () => buildVariablesSchema(selectedMeta?.variables ?? []),
    [selectedMeta]
  )

  /** Picking a template drops the typed variables: they belong to the template
   *  that was open, and its schema no longer applies. */
  const selectTemplate = (templateName: string) => {
    setPreviewInput({})
    setSearchParams({
      template: templateName,
      locale: localesOf(templates[templateName])[0] ?? 'en',
    })
  }

  const selectLocale = (locale: string) => {
    if (!selectedTemplate) return
    setPreviewInput({})
    setSearchParams({ template: selectedTemplate, locale })
  }

  return {
    templates,
    templateNames,
    selectedTemplate,
    selectedMeta: selectedMeta ?? null,
    selectedLocale,
    localeOptions,
    schema,
    previewInput,
    setPreviewInput,
    preview,
    selectTemplate,
    selectLocale,
    loading,
  }
}
