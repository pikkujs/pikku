import React from 'react'
import { MultiSelect } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'

type TagFilterProps = {
  tags: string[]
  /** Empty means no filter. Match-any, mirroring `scenario run --tags`. */
  selected: string[]
  onChange: (selected: string[]) => void
}

export const TagFilter: React.FC<TagFilterProps> = ({
  tags,
  selected,
  onChange,
}) => {
  if (tags.length === 0) return null

  return (
    <MultiSelect
      data-testid="scenario-tag-filter"
      data={tags.map((tag) => ({ value: tag, label: asI18n(tag) as string }))}
      value={selected}
      onChange={onChange}
      placeholder={selected.length === 0 ? m.scenarios_all_tags() : undefined}
      searchable
      clearable
      hidePickedOptions
      size="xs"
      style={{ minWidth: 240, maxWidth: 420 }}
      comboboxProps={{ withinPortal: true }}
    />
  )
}
