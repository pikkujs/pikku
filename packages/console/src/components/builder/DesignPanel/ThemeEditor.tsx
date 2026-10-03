import { useCallback, useEffect, useState } from 'react'
import { Paintbrush } from 'lucide-react'
import { Box, Group, Select, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { usePreviewBridge } from '../PreviewBridgeProvider'
import { callSandboxControlRpc } from '../sandboxControl'
import {
  applyThemeSpecPatch,
  type ThemeSpec,
  type ThemeSpecPatch,
  type ThemeSpecResponse,
} from '../themeModel'
import { useBuilderSandbox } from '../context'
import { Center, Loader } from '@pikku/mantine/core'
const PageLoader = () => <Center p="md"><Loader size="sm" /></Center>
import { DEFAULT_TOKENS } from './internal.js'
import { PROP_META } from './constants.js'
import { ThemeColorField } from './ThemeColorField.js'
import { PropRowShell } from './PropRowShell.js'
import { EditableChip } from './EditableChip.js'
import { DesignToggle } from './DesignToggle.js'

// ─── Theme lens ──────────────────────────────────────────────────────────────
// Edits the ACTIVE theme spec (themes/<active>.json). Every change is applied
// live via the preview bridge's `set-theme` postMessage (instant, no reload)
// AND persisted through the updateSandboxThemeSpec control RPC.

export function ThemeEditor({ iframeId }: { iframeId: string }) {
  const { runtimeBaseUrl, builderToken } = useBuilderSandbox()
  const { previewTheme, getIframeElement } = usePreviewBridge()
  const [res, setRes] = useState<ThemeSpecResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    if (!runtimeBaseUrl || !builderToken) return
    setLoading(true)
    callSandboxControlRpc<ThemeSpecResponse & { spec: ThemeSpec }>(
      runtimeBaseUrl,
      'getSandboxThemeSpec',
      {},
      builderToken,
    )
      .then(setRes)
      .catch((err) => console.error('getSandboxThemeSpec failed', err))
      .finally(() => setLoading(false))
  }, [runtimeBaseUrl, builderToken])

  const save = useCallback(
    (patch: ThemeSpecPatch, key: string) => {
      if (!res || !runtimeBaseUrl || !builderToken) return
      const spec = (res as ThemeSpecResponse & { spec?: ThemeSpec }).spec ?? {}
      const nextSpec = applyThemeSpecPatch(spec, patch)
      setRes({
        ...res,
        colors: nextSpec.brand?.colors ?? {},
        defaultRadius: nextSpec.structure?.defaultRadius ?? res.defaultRadius,
        spec: nextSpec,
      } as ThemeSpecResponse & { spec: ThemeSpec })
      // Live-apply first — the app root rebuilds its Mantine theme instantly.
      previewTheme(nextSpec)
      setSavingKey(key)
      callSandboxControlRpc(runtimeBaseUrl, 'updateSandboxThemeSpec', patch, builderToken)
        .then(() => {
          // The set-theme listener isn't reliably alive in the embedded
          // preview (hydration timing), and vite doesn't consistently pick up
          // the workspace-package JSON write — so refresh the iframe once the
          // spec is persisted. Same colors either way, guaranteed applied.
          const el = getIframeElement(iframeId)
          if (el) {
            const { src } = el
            el.src = src
          }
        })
        .catch((err) => console.error('updateSandboxThemeSpec failed', err))
        .finally(() => setSavingKey(null))
    },
    [res, runtimeBaseUrl, builderToken, previewTheme, getIframeElement, iframeId],
  )

  if (loading) {
    return <PageLoader />
  }

  if (!res) {
    return (
      <Stack align="center" justify="center" gap={10} style={{ flex: 1, padding: '24px 20px' }}>
        <Paintbrush size={28} strokeWidth={1.5} color="var(--app-text-faint)" />
        <Text size="sm" c="dimmed" ta="center" style={{ lineHeight: 1.5 }}>
          {m.design_panel_theme_empty()}
        </Text>
      </Stack>
    )
  }

  const radiusMeta = PROP_META.radius
  const spec = (res as ThemeSpecResponse & { spec?: ThemeSpec }).spec ?? {}
  const fonts = spec.brand?.fonts ?? {}
  const structure = spec.structure ?? {}
  const rawShade = structure.primaryShade
  const shade =
    typeof rawShade === 'number'
      ? { light: rawShade, dark: rawShade }
      : { light: rawShade?.light ?? 6, dark: rawShade?.dark ?? 5 }
  const gradient = {
    from: structure.defaultGradient?.from ?? 'primary.5',
    to: structure.defaultGradient?.to ?? 'secondary.6',
    deg: structure.defaultGradient?.deg ?? 135,
  }
  const shadowSizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const
  const shadeOptions = Array.from({ length: 10 }, (_, i) => String(i))

  return (
    <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }} data-testid="theme-editor">
      <Box style={{ padding: '10px 14px', borderBottom: '1px solid var(--app-border)' }}>
        <Text size="xs" c="dimmed" style={{ lineHeight: 1.4 }}>
          {m.design_panel_theme_hint()}
        </Text>
      </Box>
      {Object.entries(res.colors).map(([role, hex]) => (
        <PropRowShell
          key={role}
          propName={role}
          label={asI18n(role)}
          description={
            role === 'primary'
              ? m.design_panel_theme_primary_desc()
              : m.design_panel_theme_role_desc()
          }
          saving={savingKey === role}
        >
          <ThemeColorField hex={hex} onCommit={(v) => save({ colors: { [role]: v } }, role)} />
        </PropRowShell>
      ))}
      <PropRowShell
        propName="fonts.heading"
        label={m.design_panel_theme_font_heading_label()}
        description={m.design_panel_theme_font_heading_desc()}
        saving={savingKey === 'fonts.heading'}
      >
        <EditableChip
          value={fonts.heading ?? ''}
          onChange={(v) => {
            if (v) save({ fonts: { heading: v } }, 'fonts.heading')
          }}
        />
      </PropRowShell>
      <PropRowShell
        propName="fonts.body"
        label={m.design_panel_theme_font_body_label()}
        description={m.design_panel_theme_font_body_desc()}
        saving={savingKey === 'fonts.body'}
      >
        <EditableChip
          value={fonts.body ?? ''}
          onChange={(v) => {
            if (v) save({ fonts: { body: v } }, 'fonts.body')
          }}
        />
      </PropRowShell>
      <PropRowShell
        propName="defaultRadius"
        label={radiusMeta.label}
        description={radiusMeta.description}
        saving={savingKey === 'defaultRadius'}
      >
        <DesignToggle
          strVal={res.defaultRadius ?? ''}
          options={res.tokens?.radius ?? DEFAULT_TOKENS.radius}
          isTokenScale
          propName="defaultRadius"
          onChange={(_, v) => {
            if (typeof v === 'string' && v) save({ defaultRadius: v }, 'defaultRadius')
          }}
        />
      </PropRowShell>
      <PropRowShell
        propName="defaultColorScheme"
        label={m.design_panel_theme_scheme_label()}
        description={m.design_panel_theme_scheme_desc()}
        saving={savingKey === 'defaultColorScheme'}
      >
        <DesignToggle
          strVal={structure.defaultColorScheme ?? 'dark'}
          options={['light', 'dark', 'auto']}
          propName="defaultColorScheme"
          onChange={(_, v) => {
            if (v === 'light' || v === 'dark' || v === 'auto')
              save({ defaultColorScheme: v }, 'defaultColorScheme')
          }}
        />
      </PropRowShell>
      <PropRowShell
        propName="autoContrast"
        label={m.design_panel_theme_auto_contrast_label()}
        description={m.design_panel_theme_auto_contrast_desc()}
        saving={savingKey === 'autoContrast'}
      >
        <DesignToggle
          strVal={String(structure.autoContrast ?? true)}
          options={['true', 'false']}
          propName="autoContrast"
          onChange={(_, v) => {
            if (typeof v === 'boolean') save({ autoContrast: v }, 'autoContrast')
          }}
        />
      </PropRowShell>
      <PropRowShell
        propName="primaryShade"
        label={m.design_panel_theme_shade_label()}
        description={m.design_panel_theme_shade_desc()}
        saving={savingKey === 'primaryShade'}
      >
        <Group gap={8} grow>
          <Select
            size="xs"
            label={m.design_panel_theme_shade_light()}
            data={shadeOptions}
            value={String(shade.light)}
            onChange={(v) => {
              if (v !== null) save({ primaryShade: { ...shade, light: Number(v) } }, 'primaryShade')
            }}
          />
          <Select
            size="xs"
            label={m.design_panel_theme_shade_dark()}
            data={shadeOptions}
            value={String(shade.dark)}
            onChange={(v) => {
              if (v !== null) save({ primaryShade: { ...shade, dark: Number(v) } }, 'primaryShade')
            }}
          />
        </Group>
      </PropRowShell>
      <PropRowShell
        propName="defaultGradient"
        label={m.design_panel_theme_gradient_label()}
        description={m.design_panel_theme_gradient_desc()}
        saving={savingKey === 'defaultGradient'}
      >
        <Stack gap={6}>
          {(
            [
              ['from', m.design_panel_theme_gradient_from(), gradient.from],
              ['to', m.design_panel_theme_gradient_to(), gradient.to],
              ['deg', m.design_panel_theme_gradient_deg(), String(gradient.deg)],
            ] as const
          ).map(([field, label, value]) => (
            <Group key={field} gap={8} wrap="nowrap" align="center">
              <Text size="xs" ff="monospace" c="dimmed" style={{ width: 34, flexShrink: 0 }}>
                {label}
              </Text>
              <Box style={{ flex: 1 }}>
                <EditableChip
                  value={value}
                  onChange={(v) => {
                    if (!v) return
                    if (field === 'deg') {
                      const n = Number(v)
                      if (Number.isFinite(n))
                        save({ defaultGradient: { ...gradient, deg: n } }, 'defaultGradient')
                    } else {
                      save({ defaultGradient: { ...gradient, [field]: v } }, 'defaultGradient')
                    }
                  }}
                />
              </Box>
            </Group>
          ))}
        </Stack>
      </PropRowShell>
      <PropRowShell
        propName="shadows"
        label={m.design_panel_theme_shadows_label()}
        description={m.design_panel_theme_shadows_desc()}
        saving={savingKey === 'shadows'}
      >
        <Stack gap={6}>
          {shadowSizes.map((size) => (
            <Group key={size} gap={8} wrap="nowrap" align="center">
              <Text size="xs" ff="monospace" c="dimmed" style={{ width: 20, flexShrink: 0 }}>
                {asI18n(size)}
              </Text>
              <Box style={{ flex: 1 }}>
                <EditableChip
                  value={structure.shadows?.[size] ?? ''}
                  onChange={(v) => {
                    if (v) save({ shadows: { [size]: v } }, 'shadows')
                  }}
                />
              </Box>
            </Group>
          ))}
        </Stack>
      </PropRowShell>
    </Box>
  )
}
