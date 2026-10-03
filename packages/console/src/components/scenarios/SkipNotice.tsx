import React from 'react'
import { Group, Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { CircleSlash } from 'lucide-react'

type SkipNoticeProps = {
  /** The author's own words for why this is held out of a default run. */
  reason: string
}

export const SkipNotice: React.FC<SkipNoticeProps> = ({ reason }) => (
  <Group gap={6} wrap="nowrap" align="center" data-testid="scenario-skip">
    <CircleSlash size={13} strokeWidth={2} />
    <Text size="sm" c="dimmed">
      {m.scenarios_skipped_reason({ reason })}
    </Text>
  </Group>
)
