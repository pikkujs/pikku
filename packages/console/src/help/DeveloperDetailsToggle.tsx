import { ActionIcon, Tooltip } from '@pikku/mantine/core'
import { Code2 } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useDeveloperDetails } from '../hooks/useDeveloperDetails'

export function DeveloperDetailsToggle() {
  const { shown, setShown } = useDeveloperDetails()
  const label = shown ? m.developer_details_hide() : m.developer_details_show()
  return (
    <Tooltip label={label}>
      <ActionIcon
        variant={shown ? 'light' : 'default'}
        color="gray"
        size="input-sm"
        aria-label={label}
        aria-pressed={shown}
        onClick={() => setShown(!shown)}
        data-testid="developer-details-toggle"
      >
        <Code2 size={16} />
      </ActionIcon>
    </Tooltip>
  )
}
