import type { ComponentProps } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import { ActionIcon, TextInput, useMantineTheme } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'

// Props typed off the OVERRIDDEN TextInput itself (not base @mantine TextInputProps,
// whose label/error/placeholder are ReactNode/string and clash with the I18n gate).
export function InputWithButton(props: Omit<ComponentProps<typeof TextInput>, 'placeholder'>) {
  const theme = useMantineTheme()

  return (
    <TextInput
      radius="xl"
      size="md"
      placeholder={m.inputwithbutton__placeholder()}
      rightSectionWidth={42}
      leftSection={<Search size={18} strokeWidth={1.5} />}
      rightSection={
        <ActionIcon
          size={32}
          radius="xl"
          color={theme.primaryColor}
          variant="filled"
          aria-label={m.inputwithbutton__search_aria()}
        >
          <ArrowRight size={18} strokeWidth={1.5} />
        </ActionIcon>
      }
      aria-label={m.inputwithbutton__placeholder()}
      {...props}
    />
  )
}
