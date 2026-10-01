import { Check, Copy } from 'lucide-react'
import { Button, Tooltip } from '@pikku/mantine/core'
import { useClipboard } from '@mantine/hooks'
import { m } from '@/i18n/messages'

export function ButtonCopy() {
  const clipboard = useClipboard()
  return (
    <Tooltip
      label={m.buttoncopy__link_copied()}
      offset={5}
      position="bottom"
      radius="xl"
      transitionProps={{ duration: 100, transition: 'slide-down' }}
      opened={clipboard.copied}
    >
      <Button
        variant="light"
        rightSection={
          clipboard.copied ? (
            <Check size={20} strokeWidth={1.5} />
          ) : (
            <Copy size={20} strokeWidth={1.5} />
          )
        }
        radius="xl"
        size="md"
        pr={14}
        h={48}
        styles={{ section: { marginLeft: 22 } }}
        onClick={() => clipboard.copy('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}
      >
        {m.buttoncopy__copy_link()}
      </Button>
    </Tooltip>
  )
}
