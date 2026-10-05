import { Cog, Fuel, Gauge, Users, type LucideIcon } from 'lucide-react'
import { Badge, Button, Card, Center, Group, Image, Text } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { asI18n, m } from '@/i18n/messages'
import classes from './FeaturesCard.module.css'

const mockdata: { label: () => I18nString; icon: LucideIcon }[] = [
  { label: m.featurescard__passengers, icon: Users },
  { label: m.featurescard__speed, icon: Gauge },
  { label: m.featurescard__gearbox, icon: Cog },
  { label: m.featurescard__electric, icon: Fuel },
]

export function FeaturesCard() {
  const features = mockdata.map((feature) => (
    <Center key={feature.label()}>
      <feature.icon size={16} className={classes.icon} strokeWidth={1.5} />
      <Text size="xs">{feature.label()}</Text>
    </Center>
  ))

  return (
    <Card withBorder radius="md" className={classes.card}>
      <Card.Section className={classes.imageSection}>
        <Image src="https://i.imgur.com/ZL52Q2D.png" alt={asI18n('Tesla Model S')} />
      </Card.Section>

      <Group justify="space-between" mt="md">
        <div>
          <Text fw={500}>{asI18n('Tesla Model S')}</Text>
          <Text fz="xs" c="dimmed">
            {m.featurescard__subtitle()}
          </Text>
        </div>
        <Badge variant="outline">{m.featurescard__discount()}</Badge>
      </Group>

      <Card.Section className={classes.section} mt="md">
        <Text fz="sm" c="dimmed" className={classes.label}>
          {m.featurescard__basic_config()}
        </Text>

        <Group gap={8} mb={-8}>
          {features}
        </Group>
      </Card.Section>

      <Card.Section className={classes.section}>
        <Group gap={30}>
          <div>
            <Text fz="xl" fw={700} style={{ lineHeight: 1 }}>
              {asI18n('$168.00')}
            </Text>
            <Text fz="sm" c="dimmed" fw={500} style={{ lineHeight: 1 }} mt={3}>
              {m.featurescard__per_day()}
            </Text>
          </div>

          <Button radius="xl" style={{ flex: 1 }}>
            {m.featurescard__cta()}
          </Button>
        </Group>
      </Card.Section>
    </Card>
  )
}
