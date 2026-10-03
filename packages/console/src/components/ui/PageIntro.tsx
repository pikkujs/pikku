import React from 'react'
import {
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@pikku/mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { asI18n, type I18nNode } from '@pikku/react'

export type PageIntroStep = {
  title: I18nNode
  body: I18nNode
}

/** The first-visit card a screen opens with: what it is, then how to use it in a few steps. Dismissal is remembered per screen. */
export const PageIntro: React.FC<{
  storageKey: string
  eyebrow: I18nNode
  title: I18nNode
  body: I18nNode
  steps?: PageIntroStep[]
  dismissLabel: I18nNode
}> = ({ storageKey, eyebrow, title, body, steps = [], dismissLabel }) => {
  const [dismissed, setDismissed] = useLocalStorage({
    key: `page-intro:${storageKey}`,
    defaultValue: false,
  })
  if (dismissed) return null
  return (
    <Paper
      variant="accent"
      px={{ base: 20, sm: 32 }}
      py={{ base: 20, sm: 28 }}
      data-testid={`page-intro-${storageKey}`}
    >
      <Group justify="space-between" align="flex-start" gap="md">
        <Stack gap="sm" miw={0} style={{ flex: 1 }}>
          <Text
            size="xs"
            fw={600}
            tt="uppercase"
            c="blue"
            style={{ letterSpacing: '0.06em' }}
          >
            {eyebrow}
          </Text>
          <Title order={1} style={{ textWrap: 'balance' }}>
            {title}
          </Title>
          <Text maw={760}>{body}</Text>
        </Stack>
        <Button onClick={() => setDismissed(true)}>{dismissLabel}</Button>
      </Group>
      {steps.length > 0 && (
        <SimpleGrid cols={{ base: 1, md: steps.length }} spacing="sm" mt="md">
          {steps.map((step, index) => (
            <Paper key={index} variant="accent-inset" px="md" py="sm">
              <Stack gap={4}>
                <Text size="xs" fw={700} c="blue">
                  {asI18n(String(index + 1))}
                </Text>
                <Text fw={600} size="sm">
                  {step.title}
                </Text>
                <Text size="sm" c="dimmed">
                  {step.body}
                </Text>
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
      )}
    </Paper>
  )
}
