import { useCallback, useEffect, useState } from 'react'
import { Globe } from 'lucide-react'
import { usePreviewBridge } from '../PreviewBridgeProvider'
import { callSandboxControlRpc } from '../sandboxControl'
import { useBuilderSandbox } from '../context'
import { getLanguageLabel } from './internal.js'
import { EditableChip } from './EditableChip.js'
import { LocaleRow } from './LocaleRow.js'

type LocaleTree = Record<string, unknown>

type I18nApp = { slug: string; locales: Record<string, LocaleTree> }

type I18nData = { apps: I18nApp[] }

function sortLocales(codes: string[]): string[] {
  return [...codes].sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)))
}

function readLeaf(tree: LocaleTree, segments: string[]): unknown {
  let cur: unknown = tree
  for (const seg of segments) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

function writeLeaf(tree: LocaleTree, segments: string[], value: string): LocaleTree {
  const next = JSON.parse(JSON.stringify(tree)) as LocaleTree
  let cur: unknown = next
  for (let i = 0; i < segments.length - 1; i++) {
    if (cur === null || typeof cur !== 'object') return next
    cur = (cur as Record<string, unknown>)[segments[i]]
  }
  if (cur !== null && typeof cur === 'object') {
    ;(cur as Record<string, unknown>)[segments[segments.length - 1]] = value
  }
  return next
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function I18nPanel() {
  const { subscribeI18nOpen } = usePreviewBridge()
  const { runtimeBaseUrl, builderToken } = useBuilderSandbox()
  // The panel mounts when i18n inspect mode is enabled; the key arrives when the
  // user clicks a translated element in the preview (i18n-open).
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [i18nData, setI18nData] = useState<I18nData | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!runtimeBaseUrl || !builderToken) return
    setLoading(true)
    callSandboxControlRpc<I18nData>(runtimeBaseUrl, 'getSandboxI18n', undefined, builderToken)
      .then((data) => setI18nData(data))
      .catch((err) => console.error('getSandboxI18n failed', err))
      .finally(() => setLoading(false))
  }, [runtimeBaseUrl, builderToken])

  useEffect(() => {
    return subscribeI18nOpen((key) => setFocusedKey(key))
  }, [subscribeI18nOpen])

  const handleChange = useCallback(
    (appSlug: string, locale: string, segments: string[], newValue: string) => {
      if (!runtimeBaseUrl || !builderToken || !i18nData) return
      const app = i18nData.apps.find((a) => a.slug === appSlug)
      if (!app) return
      const updatedTree = writeLeaf(app.locales[locale] ?? {}, segments, newValue)
      setI18nData((prev) => {
        if (!prev) return prev
        return {
          apps: prev.apps.map((a) =>
            a.slug !== appSlug ? a : { ...a, locales: { ...a.locales, [locale]: updatedTree } },
          ),
        }
      })
      setSaving((s) => ({ ...s, [locale]: true }))
      callSandboxControlRpc(
        runtimeBaseUrl,
        'writeSandboxI18nLocale',
        { app: appSlug, locale, content: updatedTree },
        builderToken,
      )
        .catch((err) => console.error('writeSandboxI18nLocale failed', err))
        .finally(() => setSaving((s) => ({ ...s, [locale]: false })))
    },
    [runtimeBaseUrl, builderToken, i18nData],
  )

  if (!focusedKey) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          color: 'var(--app-text-faint)',
          padding: '24px 20px',
          textAlign: 'center',
        }}
      >
        <Globe size={28} strokeWidth={1.5} />
        <span style={{ fontSize: 13, lineHeight: 1.5 }}>
          Click any translated text in the preview to edit it here.
        </span>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '16px 14px', color: 'var(--app-text-faint)', fontSize: 12 }}>
        Loading…
      </div>
    )
  }

  const segments = focusedKey.split('.')
  const matchApp = i18nData?.apps.find((app) =>
    Object.values(app.locales).some((tree) => readLeaf(tree, segments) !== undefined),
  )
  const localeCodes = matchApp ? sortLocales(Object.keys(matchApp.locales)) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      <div
        style={{
          padding: '12px 14px 10px',
          borderBottom: '1px solid var(--app-border)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: 'var(--app-text-faint)',
            wordBreak: 'break-all',
          }}
        >
          {focusedKey.replace(/__/g, ' / ')}
        </span>
      </div>
      {!matchApp ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--app-text-faint)',
            fontSize: 12.5,
            padding: '24px 20px',
            textAlign: 'center',
          }}
        >
          Key not found in any locale file.
        </div>
      ) : (
        <div style={{ flexShrink: 0 }}>
          {localeCodes.map((code) => {
            const value = readLeaf(matchApp.locales[code] ?? {}, segments)
            const strValue = value !== undefined && value !== null ? String(value) : ''
            return (
              <LocaleRow
                key={code}
                code={code}
                value={strValue}
                saving={saving[code] ?? false}
                onChange={(v) => handleChange(matchApp.slug, code, segments, v)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
