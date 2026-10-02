import { Group, Combobox, useCombobox, InputBase, Input, CheckIcon } from '@pikku/mantine/core'
import { ListFilter } from 'lucide-react'
import { m } from '@/i18n/messages'
import type { WeaveType } from './types'
import { TYPES } from './internal'

export function WeaveTypeFilter({
  types,
  value,
  onChange,
}: {
  types: WeaveType[]
  value: WeaveType[]
  onChange: (value: WeaveType[]) => void
}) {
  const combobox = useCombobox()
  const summary =
    value.length === 0
      ? null
      : value.length === 1
        ? TYPES[value[0]].label()
        : m.weaving_filter_type_multiple()

  const toggle = (t: WeaveType) =>
    onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t])

  return (
    <Combobox
      store={combobox}
      withinPortal
      zIndex={400}
      onOptionSubmit={(val) => toggle(val as WeaveType)}
    >
      <Combobox.Target>
        <InputBase
          component="button"
          type="button"
          size="xs"
          w={168}
          pointer
          aria-label={m.weaving_filter_type_label()}
          leftSection={<ListFilter size={14} />}
          rightSection={<Combobox.Chevron />}
          rightSectionPointerEvents="none"
          onClick={() => combobox.toggleDropdown()}
        >
          {summary ?? <Input.Placeholder>{m.weaving_filter_all()}</Input.Placeholder>}
        </InputBase>
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {types.map((t) => (
            <Combobox.Option value={t} key={t} active={value.includes(t)}>
              <Group gap="xs" wrap="nowrap">
                {value.includes(t) ? (
                  <CheckIcon size={12} />
                ) : (
                  <span style={{ width: 12, display: 'inline-block' }} />
                )}
                {TYPES[t].label()}
              </Group>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  )
}
