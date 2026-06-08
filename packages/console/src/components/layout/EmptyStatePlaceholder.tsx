import React from 'react'
import { Box, Stack, Text, Button } from '@mantine/core'
import { ExternalLink } from 'lucide-react'
import classes from '../ui/console.module.css'
import { CommandChip } from '../ui/CommandChip'

interface EmptyStatePlaceholderProps {
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
  hero?: React.ReactNode
  title: string
  description?: string
  code?: string
  docsHref: string
}

export const EmptyStatePlaceholder: React.FC<EmptyStatePlaceholderProps> = ({
  icon: Icon,
  hero,
  title,
  description,
  code,
  docsHref,
}) => {
  return (
    <Box className={classes.listSurfaceCard}>
      <Stack
        align="center"
        justify="center"
        gap="md"
        className={classes.emptyState}
        py="xl"
        style={{ minHeight: '60vh' }}
      >
        {hero ?? (Icon ? <Icon size={48} strokeWidth={1} /> : null)}
        <Text size="xl" fw={600}>
          {title}
        </Text>
        {description && (
          <Text c="dimmed" ta="center" maw={500}>
            {description}
          </Text>
        )}
        {code && <CommandChip cmd={code} />}
        <Button
          component="a"
          href={docsHref}
          target="_blank"
          rel="noopener noreferrer"
          variant="default"
          leftSection={<ExternalLink size={16} />}
        >
          Docs
        </Button>
      </Stack>
    </Box>
  )
}
