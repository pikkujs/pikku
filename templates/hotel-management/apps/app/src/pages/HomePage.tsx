import type { FC } from 'react'
import { Box, Card, Group, SimpleGrid, Stack, Text, Title } from '@pikku/mantine/core'
import { Link } from '@tanstack/react-router'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useNavItems } from '@/components/layout/nav'

/**
 * The app's front door.
 *
 * This was a centred marketing hero — a headline and a paragraph floating in
 * two thirds of an empty viewport, with nothing to click. That is a landing
 * page, and this is not one: everybody who reaches it is already signed in and
 * came here to do something. So it keeps the same page grammar as every other
 * screen (left-aligned title over a dimmed line) and then does the one useful
 * thing a home screen can do, which is get out of the way.
 *
 * The destinations come from `useNavItems()` rather than a list of their own, so
 * a screen added to the sidebar appears here too instead of quietly not.
 */
export const HomePage: FC = () => {
  useLocale()
  // Everything except this page. Linking home from home is a dead end dressed
  // up as a choice.
  const destinations = useNavItems().filter((item) => item.to !== '/app')

  return (
    <Stack gap="xl">
      <Box>
        <Title order={1} fz={30} fw={650} style={{ letterSpacing: '-0.02em' }}>
          {m.home__title()}
        </Title>
        <Text c="dimmed" size="sm" maw={620} style={{ lineHeight: 1.6 }}>
          {m.home__body()}
        </Text>
      </Box>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {destinations.map(({ to, label, description, Icon }) => (
          <Card
            key={to}
            component={Link}
            to={to}
            withBorder
            radius="md"
            padding="lg"
            // The whole card is the target, so the click area matches the thing
            // that looks clickable.
            style={{ textDecoration: 'none' }}
          >
            <Group gap="sm" align="flex-start" wrap="nowrap">
              <Box c="dimmed" style={{ flexShrink: 0, lineHeight: 0, paddingTop: 2 }}>
                <Icon size={20} />
              </Box>
              <Stack gap={2}>
                {/* A heading, not a Text. These cards are the page's sections,
                    and without them every screen was a lone h1 with nothing
                    navigable beneath it. `fz`/`fw` hold the previous appearance
                    so this is structure only. */}
                <Title order={2} fz="md" fw={600} lh={1.4}>
                  {label}
                </Title>
                {description && (
                  <Text c="dimmed" size="sm" style={{ lineHeight: 1.5 }}>
                    {description}
                  </Text>
                )}
              </Stack>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  )
}
