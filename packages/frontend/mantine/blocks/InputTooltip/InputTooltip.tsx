import { useState } from 'react'
import { Info } from 'lucide-react'
import { Center, PasswordInput, Text, TextInput, Tooltip } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'

function TooltipIcon() {
  const rightSection = (
    <Tooltip
      label={m.inputtooltip__store_securely()}
      position="top-end"
      withArrow
      transitionProps={{ transition: 'pop-bottom-right' }}
    >
      <Text component="div" c="dimmed" style={{ cursor: 'help' }}>
        <Center>
          <Info size={18} strokeWidth={1.5} />
        </Center>
      </Text>
    </Tooltip>
  )

  return (
    <TextInput
      rightSection={rightSection}
      label={m.inputtooltip__icon_label()}
      placeholder={m.inputtooltip__email_placeholder()}
    />
  )
}

function TooltipFocus() {
  const [opened, setOpened] = useState(false)
  const [value, setValue] = useState('')
  const valid = value.trim().length >= 6
  return (
    <Tooltip
      label={valid ? m.inputtooltip__all_good() : m.inputtooltip__min_chars()}
      position="bottom-start"
      withArrow
      opened={opened}
      color={valid ? 'teal' : undefined}
      withinPortal
    >
      <PasswordInput
        label={m.inputtooltip__focus_label()}
        required
        placeholder={m.inputtooltip__password_placeholder()}
        onFocus={() => setOpened(true)}
        onBlur={() => setOpened(false)}
        mt="md"
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
    </Tooltip>
  )
}

export function InputTooltip() {
  return (
    <>
      <TooltipIcon />
      <TooltipFocus />
    </>
  )
}
