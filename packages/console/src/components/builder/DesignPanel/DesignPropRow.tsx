import { ColorInput, Stack } from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { ProjectColor } from './types.js'

import { PropRowShell } from './PropRowShell.js'
import { EditableChip } from './EditableChip.js'
import { SwatchLabel } from './SwatchLabel.js'
import { ColorSwatches } from './ColorSwatches.js'
import { DesignSelect } from './DesignSelect.js'
import { DesignToggle } from './DesignToggle.js'

// ─── Row dispatcher ──────────────────────────────────────────────────────────

export function DesignPropRow({
  propName,
  label,
  description,
  value,
  options,
  isTokenScale,
  colorType,
  themeColors,
  saving,
  unset,
  onChange,
}: {
  propName: string
  label: I18nNode
  description?: I18nNode
  value: string | number | boolean
  options?: readonly string[]
  isTokenScale?: boolean
  colorType: boolean
  themeColors: ProjectColor[]
  saving: boolean
  unset: boolean
  onChange: (name: string, value: string | number | boolean | null) => void
}) {
  const strVal = String(value)

  const handleText = (raw: string) => {
    const t = raw.trim()
    if (t === '' || t === 'null') {
      onChange(propName, null)
      return
    }
    if (t === 'true') {
      onChange(propName, true)
      return
    }
    if (t === 'false') {
      onChange(propName, false)
      return
    }
    if (!Number.isNaN(Number(t)) && t !== '') {
      onChange(propName, Number(t))
      return
    }
    onChange(propName, t)
  }

  return (
    <PropRowShell
      propName={propName}
      label={label}
      description={description}
      saving={saving}
      unset={unset}
      onClear={unset ? undefined : () => onChange(propName, null)}
    >
      {colorType ? (
        <>
          <ColorSwatches
            current={strVal}
            themeColors={themeColors}
            onSelect={(v) => onChange(propName, v)}
          />
          <Stack gap={5} mt={8}>
            <SwatchLabel>{m.design_panel_swatch_custom_label()}</SwatchLabel>
            <ColorInput
              value={strVal.startsWith('#') ? strVal : ''}
              placeholder={
                strVal.startsWith('#')
                  ? undefined
                  : strVal
                    ? asI18n(strVal)
                    : m.design_panel_color_pick_hint()
              }
              onChange={(hex) => onChange(propName, hex)}
              format="hex"
              withPicker
              size="xs"
              styles={{
                input: {
                  fontSize: 12,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  background: 'var(--app-panel-bg)',
                  borderColor: 'var(--app-border)',
                  color: 'var(--app-text)',
                },
              }}
            />
          </Stack>
        </>
      ) : options ? (
        options.length > 4 ? (
          <DesignSelect
            strVal={strVal}
            options={options}
            propName={propName}
            unset={unset}
            onChange={onChange}
          />
        ) : (
          <DesignToggle
            strVal={strVal}
            options={options}
            isTokenScale={isTokenScale}
            propName={propName}
            onChange={onChange}
          />
        )
      ) : (
        <EditableChip value={strVal} onChange={handleText} />
      )}
    </PropRowShell>
  )
}
