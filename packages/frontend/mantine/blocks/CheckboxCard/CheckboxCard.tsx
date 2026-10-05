import { useState } from 'react'
import { Checkbox, Text, UnstyledButton } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import classes from './CheckboxCard.module.css'

export function CheckboxCard() {
  const [checked, setChecked] = useState(true)

  return (
    <UnstyledButton component="label" className={classes.button}>
      <Checkbox
        checked={checked}
        onChange={(event) => setChecked(event.currentTarget.checked)}
        size="md"
        mr="xl"
        styles={{ input: { cursor: 'pointer' } }}
      />

      <div>
        <Text fw={500} mb={7} lh={1}>
          {asI18n('@mantine/core')}
        </Text>
        <Text fz="sm" c="dimmed">
          {m.checkboxcard__description()}
        </Text>
      </div>
    </UnstyledButton>
  )
}
