import type { FC } from 'react'
import { Award, Coins, Truck, type LucideIcon } from 'lucide-react'
import { Container, SimpleGrid, Text } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import classes from './FeaturesAsymmetrical.module.css'

type FeatureProps = {
  icon: LucideIcon
  title: I18nString
  description: I18nString
}

const Feature: FC<FeatureProps> = ({ icon: Icon, title, description }) => (
  <div className={classes.feature}>
    <div className={classes.overlay} />

    <div className={classes.content}>
      <Icon size={38} className={classes.icon} strokeWidth={1.5} />
      <Text fw={700} fz="lg" mb="xs" mt={5} className={classes.title}>
        {title}
      </Text>
      <Text c="dimmed" fz="sm">
        {description}
      </Text>
    </div>
  </div>
)

const mockdata: {
  icon: LucideIcon
  title: () => I18nString
  description: () => I18nString
}[] = [
  {
    icon: Truck,
    title: m.featuresasymmetrical__f1_title,
    description: m.featuresasymmetrical__f1_description,
  },
  {
    icon: Award,
    title: m.featuresasymmetrical__f2_title,
    description: m.featuresasymmetrical__f2_description,
  },
  {
    icon: Coins,
    title: m.featuresasymmetrical__f3_title,
    description: m.featuresasymmetrical__f3_description,
  },
]

export function FeaturesAsymmetrical() {
  const items = mockdata.map((item) => (
    <Feature
      icon={item.icon}
      title={item.title()}
      description={item.description()}
      key={item.title()}
    />
  ))

  return (
    <Container mt={30} mb={30} size="lg">
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing={50}>
        {items}
      </SimpleGrid>
    </Container>
  )
}
