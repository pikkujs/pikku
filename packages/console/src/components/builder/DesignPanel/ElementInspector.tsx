import { useCallback, useEffect, useState } from 'react'
import { Paintbrush } from 'lucide-react'
import { Box, Stack, Text, TextInput } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { usePreviewBridge } from '../PreviewBridgeProvider'
import { callSandboxControlRpc } from '../sandboxControl'
import { type ThemeTokens, type ThemesResponse } from '../themeModel'
import { useBuilderSandbox } from '../context'
import { Center, Loader } from '@pikku/mantine/core'
const PageLoader = () => <Center p="md"><Loader size="sm" /></Center>
import type { ProjectColor } from './types.js'
import { ComponentMeta, DEFAULT_TOKENS, SelectedElementInfo } from './internal.js'
import { PROP_META } from './constants.js'
import { SectionLabel } from './SectionLabel.js'

import { DesignPropRow } from './DesignPropRow.js'

// ─── Element lens ────────────────────────────────────────────────────────────

export function ElementInspector() {
  const { subscribeElementSelect } = usePreviewBridge()
  const { runtimeBaseUrl, builderToken } = useBuilderSandbox()
  const [selected, setSelected] = useState<SelectedElementInfo | null>(null)
  const [props, setProps] = useState<Record<string, string | number | boolean> | null>(null)
  const [componentMeta, setComponentMeta] = useState<ComponentMeta | null>(null)
  const [filter, setFilter] = useState('')
  const [loadingProps, setLoadingProps] = useState(false)
  const [savingProp, setSavingProp] = useState<string | null>(null)
  const [themeColors, setThemeColors] = useState<ProjectColor[]>([])
  const [themeTokens, setThemeTokens] = useState<ThemeTokens>(DEFAULT_TOKENS)
  const [i18nMap, setI18nMap] = useState<Record<string, Record<string, string>>>({})

  // Fetch the active theme's semantic colors + token scales once.
  useEffect(() => {
    if (!runtimeBaseUrl || !builderToken) return
    callSandboxControlRpc<ThemesResponse>(runtimeBaseUrl, 'getSandboxThemes', {}, builderToken)
      .then((res) => {
        if (res.tokens) setThemeTokens(res.tokens)
        const active = res.themes.find((t) => t.id === res.activeId)
        if (!active) return
        const colors: ProjectColor[] = []
        if (active.primaryColor) {
          const hex = active.bases?.[active.primaryColor]
          colors.push({
            role: 'primary',
            propValue: active.primaryColor,
            swatchBg: hex ?? `var(--mantine-color-${active.primaryColor}-5)`,
          })
        }
        for (const [role, hex] of Object.entries(active.bases ?? {})) {
          if (role === active.primaryColor) continue
          colors.push({ role, propValue: role, swatchBg: hex })
        }
        setThemeColors(colors)
      })
      .catch((err) => console.error('failed to load theme colors (non-critical)', err))
  }, [runtimeBaseUrl, builderToken])

  const fetchI18nMap = useCallback(async () => {
    if (!runtimeBaseUrl || !builderToken) return
    try {
      const res = await fetch(`${runtimeBaseUrl}/_frontend/design/om-i18n-map.json`, {
        headers: { Authorization: `Bearer ${builderToken}` },
      })
      if (res.ok) setI18nMap(await res.json())
    } catch (err) {
      console.error('failed to fetch om-i18n-map', err)
    }
  }, [runtimeBaseUrl, builderToken])

  useEffect(() => {
    fetchI18nMap()
  }, [fetchI18nMap])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.source === 'fabric-preview' && event.data.type === 'om-i18n-map-updated') {
        fetchI18nMap()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [fetchI18nMap])

  useEffect(() => {
    return subscribeElementSelect((omId, tag, rect, component) => {
      setSelected({ omId, tag, component, rect })
      setProps(null)
      setFilter('')
    })
  }, [subscribeElementSelect])

  useEffect(() => {
    if (!selected || !runtimeBaseUrl || !builderToken) return
    const parts = selected.omId.split(':')
    const path = parts.slice(0, -2).join(':')
    const line = parseInt(parts[parts.length - 2], 10)
    const col = parseInt(parts[parts.length - 1], 10)
    if (!path || Number.isNaN(line) || Number.isNaN(col)) return
    let cancelled = false
    setLoadingProps(true)
    Promise.all([
      callSandboxControlRpc<{ props: Record<string, string | number | boolean> }>(
        runtimeBaseUrl,
        'getJsxProps',
        { path, line, col },
        builderToken,
      ),
      selected.component
        ? callSandboxControlRpc<ComponentMeta>(
            runtimeBaseUrl,
            'getComponentMeta',
            { componentName: selected.component },
            builderToken,
          ).catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([jsxRes, metaRes]) => {
        if (cancelled) return
        setProps(jsxRes.props)
        setComponentMeta(metaRes)
      })
      .catch(() => {
        if (!cancelled) setProps({})
      })
      .finally(() => {
        if (!cancelled) setLoadingProps(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected, runtimeBaseUrl, builderToken])

  const handlePropChange = useCallback(
    (propName: string, propValue: string | number | boolean | null) => {
      if (!selected || !runtimeBaseUrl || !builderToken) return
      const parts = selected.omId.split(':')
      const path = parts.slice(0, -2).join(':')
      const line = parseInt(parts[parts.length - 2], 10)
      const col = parseInt(parts[parts.length - 1], 10)
      setSavingProp(propName)
      setProps((prev) => {
        if (!prev) return prev
        if (propValue === null) {
          const next = { ...prev }
          delete next[propName]
          return next
        }
        return { ...prev, [propName]: propValue }
      })
      callSandboxControlRpc(
        runtimeBaseUrl,
        'updateSandboxJsxProp',
        { path, line, col, propName, propValue },
        builderToken,
      )
        .catch(() => {
          setProps((prev) => (prev ? { ...prev, [propName]: props?.[propName] ?? '' } : prev))
        })
        .finally(() => setSavingProp(null))
    },
    [selected, runtimeBaseUrl, builderToken, props],
  )

  if (!selected) {
    return (
      <Stack align="center" justify="center" gap={10} style={{ flex: 1, padding: '24px 20px' }}>
        <Paintbrush size={28} strokeWidth={1.5} color="var(--app-text-faint)" />
        <Text size="sm" c="dimmed" ta="center" style={{ lineHeight: 1.5 }}>
          {m.design_panel_click_hint()}
        </Text>
      </Stack>
    )
  }

  const parts = selected.omId.split(':')
  const file = parts.slice(0, -2).join(':')
  const line = parts[parts.length - 2]
  const col = parts[parts.length - 1]
  const displayName = selected.component || selected.tag

  const COMPONENT_PROP_ORDER = [
    'variant',
    'color',
    'size',
    'radius',
    'fullWidth',
    'justify',
    'align',
    'direction',
    'wrap',
    'gap',
    'fz',
    'fw',
    'ta',
    'c',
    'tt',
    'td',
    'truncate',
    'lineClamp',
    'p',
    'px',
    'py',
    'm',
    'mx',
    'my',
    'w',
    'h',
    'bg',
    'opacity',
  ]

  const componentPropKeys = new Set((componentMeta?.props ?? []).filter((k) => k in PROP_META))
  if (componentMeta?.variantOptions.length) componentPropKeys.add('variant')
  if (componentMeta?.sizeOptions.length) componentPropKeys.add('size')

  const sortedComponentProps = [...componentPropKeys].sort((a, b) => {
    const ai = COMPONENT_PROP_ORDER.indexOf(a)
    const bi = COMPONENT_PROP_ORDER.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })

  const q = filter.trim().toLowerCase()
  const matchesProp = (key: string) => {
    if (!q) return true
    const label = PROP_META[key]?.label ?? key
    return key.toLowerCase().includes(q) || label.toLowerCase().includes(q)
  }

  const componentSpecificProps: Array<[string, string | number | boolean]> = sortedComponentProps
    .filter(matchesProp)
    .map((k) => [k, props?.[k] ?? ''])

  const setBoxProps = props
    ? Object.entries(props).filter(
        ([k]) => k in PROP_META && !componentPropKeys.has(k) && matchesProp(k),
      )
    : []

  const i18nTokens = Object.entries(i18nMap[selected.omId] ?? {})

  return (
    <Box
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}
    >
      {/* Header */}
      <Box
        style={{
          padding: '12px 14px 10px',
          borderBottom: '1px solid var(--app-border)',
          flexShrink: 0,
        }}
      >
        <Stack gap={4}>
          <Text fw={600} size="sm" style={{ color: 'var(--app-text)' }}>
            {asI18n(`<${displayName}>`)}
          </Text>
          <Text size="xs" ff="monospace" c="dimmed">
            {asI18n(`${file}:${line}:${col}`)}
          </Text>
          <TextInput
            placeholder={m.design_panel_filter_placeholder()}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            size="xs"
            mt={6}
          />
        </Stack>
      </Box>

      {loadingProps ? (
        <PageLoader />
      ) : componentSpecificProps.length === 0 &&
        setBoxProps.length === 0 &&
        i18nTokens.length === 0 ? (
        <Stack
          align="center"
          justify="center"
          style={{ flex: 1, padding: '24px 20px', textAlign: 'center' }}
        >
          <Text size="sm" c="dimmed">
            {m.design_panel_no_props()}
          </Text>
        </Stack>
      ) : (
        <>
          {componentSpecificProps.length > 0 && (
            <Box style={{ flexShrink: 0 }}>
              {componentSpecificProps.map(([key, value]) => {
                const meta = PROP_META[key]
                const runtimeOptions =
                  key === 'variant' && componentMeta?.variantOptions.length
                    ? componentMeta.variantOptions
                    : key === 'size' && componentMeta?.sizeOptions.length
                      ? componentMeta.sizeOptions
                      : undefined
                const options =
                  runtimeOptions ??
                  meta?.options ??
                  (meta?.tokenScale ? themeTokens[meta.tokenScale] : undefined)
                return (
                  <DesignPropRow
                    key={key}
                    propName={key}
                    label={meta?.label ?? asI18n(key)}
                    description={meta?.description}
                    value={value}
                    options={options}
                    isTokenScale={!runtimeOptions && !!meta?.tokenScale}
                    colorType={meta?.type === 'color'}
                    themeColors={themeColors}
                    saving={savingProp === key}
                    unset={value === ''}
                    onChange={handlePropChange}
                  />
                )
              })}
            </Box>
          )}
          {setBoxProps.length > 0 && (
            <Box style={{ flexShrink: 0 }}>
              {setBoxProps.map(([key, value]) => {
                const meta = PROP_META[key]
                const options =
                  meta?.options ?? (meta?.tokenScale ? themeTokens[meta.tokenScale] : undefined)
                return (
                  <DesignPropRow
                    key={key}
                    propName={key}
                    label={meta?.label ?? asI18n(key)}
                    description={meta?.description}
                    value={value}
                    options={options}
                    isTokenScale={!!meta?.tokenScale}
                    colorType={meta?.type === 'color'}
                    themeColors={themeColors}
                    saving={savingProp === key}
                    unset={false}
                    onChange={handlePropChange}
                  />
                )
              })}
            </Box>
          )}
          {i18nTokens.length > 0 && (
            <Box style={{ flexShrink: 0 }}>
              <SectionLabel>{m.design_panel_text_content_label()}</SectionLabel>
              {i18nTokens.map(([prop, key]) => (
                <Box
                  key={prop}
                  style={{
                    padding: '10px 14px 11px',
                    borderBottom: '1px solid var(--app-border)',
                  }}
                >
                  <Text fw={600} size="sm" mb={4} style={{ color: 'var(--app-text)' }}>
                    {asI18n(prop)}
                  </Text>
                  <Text size="xs" ff="monospace" c="dimmed">
                    {asI18n(key)}
                  </Text>
                </Box>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  )
}
