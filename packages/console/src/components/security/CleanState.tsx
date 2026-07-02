import React from 'react'
import { Paper, Stack, Text } from '@pikku/mantine/core'
import { ShieldCheck } from 'lucide-react'
import { asI18n } from '@pikku/react'

export const CleanState: React.FC<{ label: string }> = ({ label }) => (
  <Paper withBorder radius="md" p="xl" style={{ borderStyle: 'dashed' }}>
    <Stack align="center" gap="sm" py="lg">
      <ShieldCheck size={28} color="var(--mantine-color-green-7)" />
      <Text c="dimmed" ta="center">
        {asI18n(label)}
      </Text>
    </Stack>
  </Paper>
)
