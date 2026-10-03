import { useCallback, useEffect, useMemo, useState } from 'react'
import { Paintbrush } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Box, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import {
  BUILDER_PREVIEW_IFRAME_ID,
  usePreviewBridge,
} from './PreviewBridgeProvider'
import { callSandboxControlRpc } from './sandboxControl'
import {
  applyThemeSpecPatch,
  type ComponentPropMeta,
  type ThemeSpec,
  type ThemeSpecPatch,
  type ThemeSpecResponse,
  type ThemeTokens,
  type ThemesResponse,
} from './themeModel'
import { useBuilderSandbox } from './context'
import { DesignPropRow, PROP_META, type ProjectColor } from './DesignPanel/index.js'
import { Center, Loader } from '@pikku/mantine/core'
const PageLoader = () => <Center p="md"><Loader size="sm" /></Center>

type RichComponentMeta = {
  props: string[]
  variantOptions: string[]
  sizeOptions: string[]
  propMeta?: ComponentPropMeta[]
  stylesNames?: string[]
  cssVariables?: Record<string, string[]>
  source: 'manifest' | 'none'
}

const EDITABLE_KINDS = new Set<ComponentPropMeta['kind']>([
  'select',
  'boolean',
  'number',
  'color',
  'token',
  'text',
])

const DEFAULT_SCALE = ['xs', 'sm', 'md', 'lg', 'xl']

// The Component lens: edits theme.components[Name].defaultProps in the ACTIVE
// theme spec, so a change here restyles EVERY instance of the component in the
// app — element-level props still win over these defaults.
// See DesignPanel — `iframeId` names which preview to reload after a save.
export const ComponentThemePanel: React.FC<{ iframeId?: string }> = ({
  iframeId = BUILDER_PREVIEW_IFRAME_ID,
}) => {
  const { runtimeBaseUrl, builderToken } = useBuilderSandbox()
  const { subscribeElementSelect, previewTheme, getIframeElement } = usePreviewBridge()
  const [componentName, setComponentName] = useState<string | null>(null)
  const [localSpec, setLocalSpec] = useState<ThemeSpec | null>(null)
  const [savingProp, setSavingProp] = useState<string | null>(null)

  useEffect(
    () =>
      subscribeElementSelect((_omId, _tag, _rect, component) => {
        if (component) setComponentName(component)
      }),
    [subscribeElementSelect],
  )

  const enabled = !!runtimeBaseUrl && !!builderToken

  const specQuery = useQuery({
    queryKey: ['sandbox-theme-spec', runtimeBaseUrl],
    enabled,
    queryFn: () =>
      callSandboxControlRpc<ThemeSpecResponse>(
        runtimeBaseUrl!,
        'getSandboxThemeSpec',
        {},
        builderToken!,
      ),
  })

  const metaQuery = useQuery({
    queryKey: ['component-meta', runtimeBaseUrl, componentName],
    enabled: enabled && !!componentName,
    queryFn: () =>
      callSandboxControlRpc<RichComponentMeta>(
        runtimeBaseUrl!,
        'getComponentMeta',
        { componentName: componentName! },
        builderToken!,
      ),
  })

  const themesQuery = useQuery({
    queryKey: ['sandbox-themes', runtimeBaseUrl],
    enabled,
    queryFn: () =>
      callSandboxControlRpc<ThemesResponse>(runtimeBaseUrl!, 'getSandboxThemes', {}, builderToken!),
  })

  const themeColors = useMemo<ProjectColor[]>(() => {
    const data = themesQuery.data
    const active = data?.themes.find((t) => t.id === data.activeId)
    if (!active) return []
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
    return colors
  }, [themesQuery.data])

  const serverSpec = specQuery.data?.spec
  useEffect(() => {
    setLocalSpec(null)
  }, [serverSpec])
  const spec = useMemo<ThemeSpec>(() => localSpec ?? serverSpec ?? {}, [localSpec, serverSpec])

  const saveMutation = useMutation({
    mutationFn: (patch: ThemeSpecPatch) =>
      callSandboxControlRpc(runtimeBaseUrl!, 'updateSandboxThemeSpec', patch, builderToken!),
    onSuccess: () => {
      // Same reasoning as the Theme lens: the set-theme listener isn't reliably
      // alive in the embedded preview, so reload the iframe once persisted.
      const el = getIframeElement(iframeId)
      if (el) {
        const { src } = el
        el.src = src
      }
      void specQuery.refetch()
    },
    onSettled: () => setSavingProp(null),
  })

  const handleChange = useCallback(
    (propName: string, propValue: string | number | boolean | null) => {
      if (!componentName || !enabled) return
      const patch: ThemeSpecPatch = {
        components: { [componentName]: { defaultProps: { [propName]: propValue } } },
      }
      const nextSpec = applyThemeSpecPatch(spec, patch)
      setLocalSpec(nextSpec)
      previewTheme(nextSpec)
      setSavingProp(propName)
      saveMutation.mutate(patch)
    },
    [componentName, enabled, spec, previewTheme, saveMutation],
  )

  const tokens: ThemeTokens = specQuery.data?.tokens ?? {
    spacing: DEFAULT_SCALE,
    radius: DEFAULT_SCALE,
    fontSizes: DEFAULT_SCALE,
  }

  const rows = useMemo<ComponentPropMeta[]>(() => {
    const meta = metaQuery.data
    if (!meta) return []
    const list: ComponentPropMeta[] = []
    if (meta.variantOptions.length) {
      list.push({ name: 'variant', kind: 'select', options: meta.variantOptions })
    }
    const fromManifest = (meta.propMeta ?? []).filter((p) => EDITABLE_KINDS.has(p.kind))
    if (meta.sizeOptions.length && !fromManifest.some((p) => p.name === 'size')) {
      list.push({ name: 'size', kind: 'select', options: meta.sizeOptions })
    }
    return [...list, ...fromManifest]
  }, [metaQuery.data])

  if (!componentName) {
    return (
      <Stack align="center" justify="center" gap={10} style={{ flex: 1, padding: '24px 20px' }}>
        <Paintbrush size={28} strokeWidth={1.5} color="var(--app-text-faint)" />
        <Text size="sm" c="dimmed" ta="center" style={{ lineHeight: 1.5 }}>
          {m.design_panel_component_empty()}
        </Text>
      </Stack>
    )
  }

  const overrides =
    spec.structure?.components?.[componentName]?.defaultProps ??
    ({} as Record<string, string | number | boolean>)

  return (
    <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }} data-testid="component-theme-panel">
      <Box style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--app-border)' }}>
        <Text fw={600} size="sm" style={{ color: 'var(--app-text)' }}>
          {asI18n(`<${componentName}>`)}
        </Text>
        <Text size="xs" c="dimmed" mt={4} style={{ lineHeight: 1.4 }}>
          {m.design_panel_component_hint({ component: componentName })}
        </Text>
        {saveMutation.error ? (
          <Text size="xs" c="red" mt={4}>
            {asI18n(String(saveMutation.error))}
          </Text>
        ) : null}
      </Box>
      {metaQuery.isLoading || specQuery.isLoading ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <Stack align="center" justify="center" style={{ flex: 1, padding: '24px 20px' }}>
          <Text size="sm" c="dimmed" ta="center">
            {m.design_panel_component_no_props()}
          </Text>
        </Stack>
      ) : (
        rows.map((prop) => {
          const meta = PROP_META[prop.name]
          const scaleOptions =
            prop.tokenScale === 'spacing'
              ? tokens.spacing
              : prop.tokenScale === 'radius'
                ? tokens.radius
                : prop.tokenScale === 'fontSizes'
                  ? tokens.fontSizes
                  : prop.tokenScale
                    ? (prop.options ?? DEFAULT_SCALE)
                    : undefined
          const options =
            scaleOptions ??
            prop.options ??
            (prop.kind === 'boolean' ? ['true', 'false'] : undefined)
          const defaultLine = prop.default
            ? m.design_panel_component_default({ value: prop.default })
            : undefined
          const description = [prop.description ?? meta?.description, defaultLine]
            .filter(Boolean)
            .join(' — ')
          const value = overrides[prop.name] ?? ''
          return (
            <DesignPropRow
              key={prop.name}
              propName={prop.name}
              label={meta?.label ?? prop.name}
              description={description ? asI18n(description) : undefined}
              value={value}
              options={options}
              isTokenScale={!!prop.tokenScale}
              colorType={prop.kind === 'color'}
              themeColors={themeColors}
              saving={savingProp === prop.name}
              unset={!(prop.name in overrides)}
              onChange={handleChange}
            />
          )
        })
      )}
    </Box>
  )
}
