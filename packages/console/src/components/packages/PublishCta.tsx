import React from 'react'
import {
  Paper,
  Group,
  Stack,
  Text,
  Button,
  ThemeIcon,
} from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Package, ArrowRight } from 'lucide-react'

const PUBLISH_DOCS_HREF = 'https://pikku.dev/docs/external-packages'

export const PublishCta: React.FC = () => {
  useLocale()
  return (
    <Paper withBorder radius="md" p="lg" style={{ borderStyle: 'dashed' }}>
      <Group gap="md" wrap="nowrap">
        <ThemeIcon size={42} radius="md" variant="light" color="blue">
          <Package size={20} />
        </ThemeIcon>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} size="sm">
            {m.packages_publish_title()}
          </Text>
          <Text size="sm" c="dimmed">
            {m.packages_publish_subtext()}
          </Text>
        </Stack>
        <Button
          component="a"
          href={PUBLISH_DOCS_HREF}
          target="_blank"
          rel="noopener noreferrer"
          variant="default"
          rightSection={<ArrowRight size={14} />}
        >
          {m.packages_publish_cta()}
        </Button>
      </Group>
    </Paper>
  )
}
