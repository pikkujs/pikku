import React from 'react'
import { Stack, Text, Button } from '@mantine/core'
import { ExternalLink } from 'lucide-react'

interface EmptyStatePlaceholderProps {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
  title: string
  description: string
  docsHref: string
}

export const EmptyStatePlaceholder: React.FunctionComponent<
  EmptyStatePlaceholderProps
> = ({ icon: Icon, title, description, docsHref }) => {
  return (
    <Stack
      align="center"
      justify="center"
      gap="md"
      style={{ flex: 1, height: '100%' }}
      py="xl"
    >
      <Icon size={48} strokeWidth={1} />
      <Text size="xl" fw={600}>
        {title}
      </Text>
      <Text c="dimmed" ta="center" maw={500}>
        {description}
      </Text>
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
  )
}
