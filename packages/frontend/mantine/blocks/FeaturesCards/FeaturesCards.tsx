import { Cookie, Gauge, User, type LucideIcon } from 'lucide-react'
import {
  Badge,
  Card,
  Container,
  Group,
  SimpleGrid,
  Text,
  Title,
  useMantineTheme,
} from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import classes from './FeaturesCards.module.css'

const mockdata: {
  title: () => I18nString
  description: () => I18nString
  icon: LucideIcon
}[] = [
  {
    title: m.featurescards__f1_title,
    description: m.featurescards__f1_description,
    icon: Gauge,
  },
  {
    title: m.featurescards__f2_title,
    description: m.featurescards__f2_description,
    icon: User,
  },
  {
    title: m.featurescards__f3_title,
    description: m.featurescards__f3_description,
    icon: Cookie,
  },
]

export function FeaturesCards() {
  const theme = useMantineTheme()
  const features = mockdata.map((feature) => (
    <Card key={feature.title()} shadow="md" radius="md" className={classes.card} padding="xl">
      <feature.icon size={50} strokeWidth={1.5} color={theme.colors.blue[6]} />
      <Text fz="lg" fw={500} className={classes.cardTitle} mt="md">
        {feature.title()}
      </Text>
      <Text fz="sm" c="dimmed" mt="sm">
        {feature.description()}
      </Text>
    </Card>
  ))

  return (
    <Container size="lg" py="xl">
      <Group justify="center">
        <Badge variant="filled" size="lg">
          {m.featurescards__badge()}
        </Badge>
      </Group>

      <Title order={2} className={classes.title} ta="center" mt="sm">
        {m.featurescards__title()}
      </Title>

      <Text c="dimmed" className={classes.description} ta="center" mt="md">
        {m.featurescards__description()}
      </Text>

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl" mt={50}>
        {features}
      </SimpleGrid>
    </Container>
  )
}
