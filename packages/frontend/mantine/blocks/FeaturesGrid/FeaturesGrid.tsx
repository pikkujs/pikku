import type { FC } from 'react'
import { Cookie, Gauge, Lock, MessageCircle, User, type LucideIcon } from 'lucide-react'
import { Container, SimpleGrid, Text, ThemeIcon, Title } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import classes from './FeaturesGrid.module.css'

const mockdata: {
  icon: LucideIcon
  title: () => I18nString
  description: () => I18nString
}[] = [
  {
    icon: Gauge,
    title: m.featuresgrid__f1_title,
    description: m.featuresgrid__f1_description,
  },
  {
    icon: User,
    title: m.featuresgrid__f2_title,
    description: m.featuresgrid__f2_description,
  },
  {
    icon: Cookie,
    title: m.featuresgrid__f3_title,
    description: m.featuresgrid__f3_description,
  },
  {
    icon: Lock,
    title: m.featuresgrid__f4_title,
    description: m.featuresgrid__f4_description,
  },
  {
    icon: MessageCircle,
    title: m.featuresgrid__f5_title,
    description: m.featuresgrid__f5_description,
  },
]

type FeatureProps = {
  icon: LucideIcon
  title: I18nString
  description: I18nString
}

const Feature: FC<FeatureProps> = ({ icon: Icon, title, description }) => (
  <div>
    <ThemeIcon variant="light" size={40} radius={40}>
      <Icon size={18} strokeWidth={1.5} />
    </ThemeIcon>
    <Text mt="sm" mb={7}>
      {title}
    </Text>
    <Text size="sm" c="dimmed" lh={1.6}>
      {description}
    </Text>
  </div>
)

export function FeaturesGrid() {
  const features = mockdata.map((feature, index) => (
    <Feature
      icon={feature.icon}
      title={feature.title()}
      description={feature.description()}
      key={index}
    />
  ))

  return (
    <Container className={classes.wrapper}>
      <Title className={classes.title}>{m.featuresgrid__title()}</Title>

      <Container size={560} p={0}>
        <Text size="sm" className={classes.description}>
          {m.featuresgrid__description()}
        </Text>
      </Container>

      <SimpleGrid
        mt={60}
        cols={{ base: 1, sm: 2, md: 3 }}
        spacing={{ base: 'xl', md: 50 }}
        verticalSpacing={{ base: 'xl', md: 50 }}
      >
        {features}
      </SimpleGrid>
    </Container>
  )
}
