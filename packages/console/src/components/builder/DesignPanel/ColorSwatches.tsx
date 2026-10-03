import { ColorSwatch, Group, Stack, Text, Tooltip } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { MANTINE_DEFAULT_COLORS } from '../themeModel'
import type { ProjectColor } from './types.js'
import { SWATCH_SIZE } from './internal.js'
import { SwatchLabel } from './SwatchLabel.js'

export function ColorSwatches({
  current,
  themeColors,
  onSelect,
}: {
  current: string
  themeColors: ProjectColor[]
  onSelect: (v: string) => void
}) {
  return (
    <Stack gap={8}>
      {themeColors.length > 0 && (
        <Stack gap={5}>
          <SwatchLabel>{m.design_panel_swatch_project_label()}</SwatchLabel>
          <Group gap={5} wrap="wrap">
            {themeColors.map(({ role, propValue, swatchBg }) => {
              const active = current === propValue
              return (
                <Tooltip key={role} label={asI18n(`${role} (${propValue})`)} withArrow>
                  <Stack
                    gap={3}
                    align="center"
                    onClick={() => onSelect(propValue)}
                    style={{ cursor: 'pointer' }}
                  >
                    <ColorSwatch
                      color={swatchBg}
                      size={SWATCH_SIZE}
                      radius={5}
                      style={{
                        border: active
                          ? '2px solid var(--mantine-color-blue-4)'
                          : '1.5px solid rgba(255,255,255,0.12)',
                        boxShadow: active ? '0 0 0 2px var(--app-panel-bg)' : undefined,
                        flexShrink: 0,
                      }}
                    />
                    <Text
                      size="xs"
                      c="dimmed"
                      style={{ fontSize: 9, lineHeight: 1, whiteSpace: 'nowrap' }}
                    >
                      {asI18n(role)}
                    </Text>
                  </Stack>
                </Tooltip>
              )
            })}
          </Group>
        </Stack>
      )}

      <Stack gap={5}>
        <SwatchLabel>{m.design_panel_swatch_system_label()}</SwatchLabel>
        <Group gap={5} wrap="wrap">
          {MANTINE_DEFAULT_COLORS.map((name) => {
            const active = current === name || current.startsWith(`${name}.`)
            return (
              <Tooltip key={name} label={asI18n(name)} withArrow>
                <ColorSwatch
                  component="button"
                  color={`var(--mantine-color-${name}-5)`}
                  size={SWATCH_SIZE}
                  radius={5}
                  onClick={() => onSelect(name)}
                  style={{
                    cursor: 'pointer',
                    border: active ? '2px solid white' : '1.5px solid rgba(255,255,255,0.12)',
                    boxShadow: active ? '0 0 0 2px var(--app-panel-bg)' : undefined,
                    flexShrink: 0,
                  }}
                />
              </Tooltip>
            )
          })}
        </Group>
      </Stack>
    </Stack>
  )
}
