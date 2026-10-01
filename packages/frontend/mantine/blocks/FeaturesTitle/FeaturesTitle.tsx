import { CircleDashed, FileCode, Flame, Receipt, type LucideIcon } from 'lucide-react'
import { Button, Grid, SimpleGrid, Text, ThemeIcon, Title } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import classes from './FeaturesTitle.module.css'

const features: {
  icon: LucideIcon
  title: () => I18nString
  description: () => I18nString
}[] = [
  {
    icon: Receipt,
    title: m.featurestitle__f1_title,
    description: m.featurestitle__f1_description,
  },
  {
    icon: FileCode,
    title: m.featurestitle__f2_title,
    description: m.featurestitle__f2_description,
  },
  {
    icon: CircleDashed,
    title: m.featurestitle__f3_title,
    description: m.featurestitle__f3_description,
  },
  {
    icon: Flame,
    title: m.featurestitle__f4_title,
    description: m.featurestitle__f4_description,
  },
]

export function FeaturesTitle() {
  const items = features.map((feature) => (
    <div key={feature.title()}>
      <ThemeIcon
        size={44}
        radius="md"
        variant="gradient"
        gradient={{ deg: 133, from: 'blue', to: 'cyan' }}
      >
        <feature.icon size={26} strokeWidth={1.5} />
      </ThemeIcon>
      <Text fz="lg" mt="sm" fw={500}>
        {feature.title()}
      </Text>
      <Text c="dimmed" fz="sm">
        {feature.description()}
      </Text>
    </div>
  ))

  return (
    <div className={classes.wrapper}>
      <Grid gap={80}>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Title className={classes.title} order={2}>
            {m.featurestitle__title()}
          </Title>
          <Text c="dimmed">{m.featurestitle__description()}</Text>

          <Button
            variant="gradient"
            gradient={{ deg: 133, from: 'blue', to: 'cyan' }}
            size="lg"
            radius="md"
            mt="xl"
          >
            {m.featurestitle__cta()}
          </Button>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing={30}>
            {items}
          </SimpleGrid>
        </Grid.Col>
      </Grid>
    </div>
  )
}
