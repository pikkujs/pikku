import React from 'react'
import {
  Paper,
  Group,
  Stack,
  Text,
  Button,
  ThemeIcon,
} from '@pikku/mantine/core'
import { useI18n } from '@pikku/react/i18n'
import { Package, ArrowRight } from 'lucide-react'

const PUBLISH_DOCS_HREF = 'https://pikku.dev/docs/external-packages'

export const PublishCta: React.FC = () => {
  const { t } = useI18n()
  return (
    <Paper withBorder radius="md" p="lg" style={{ borderStyle: 'dashed' }}>
      <Group gap="md" wrap="nowrap">
        <ThemeIcon size={42} radius="md" variant="light" color="blue">
          <Package size={20} />
        </ThemeIcon>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} size="sm">
            {t('packages.publish_title')}
          </Text>
          <Text size="sm" c="dimmed">
            {t('packages.publish_subtext')}
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
          {t('packages.publish_cta')}
        </Button>
      </Group>
    </Paper>
  )
}
