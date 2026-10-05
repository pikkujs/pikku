import { Landmark, MoreHorizontal, Pill, Scale, type LucideIcon } from 'lucide-react'
import { Container, SimpleGrid, Text, ThemeIcon, Title } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { asI18n, m } from '@/i18n/messages'
import classes from './FeaturesImages.module.css'

// Source used local SVG illustrations per row; swapped for lucide theme-icons so
// the block is self-contained (no vendored image assets to ship).
const data: {
  icon: LucideIcon
  title: () => I18nString
  description: () => I18nString
}[] = [
  {
    icon: Pill,
    title: m.featuresimages__f1_title,
    description: m.featuresimages__f1_description,
  },
  {
    icon: Scale,
    title: m.featuresimages__f2_title,
    description: m.featuresimages__f2_description,
  },
  {
    icon: Landmark,
    title: m.featuresimages__f3_title,
    description: m.featuresimages__f3_description,
  },
  {
    icon: MoreHorizontal,
    title: m.featuresimages__f4_title,
    description: m.featuresimages__f4_description,
  },
]

export function FeaturesImages() {
  const items = data.map((item) => (
    <div className={classes.item} key={item.title()}>
      <ThemeIcon variant="light" className={classes.itemIcon} size={60} radius="md">
        <item.icon size={26} strokeWidth={1.5} />
      </ThemeIcon>

      <div>
        <Text fw={700} fz="lg" className={classes.itemTitle}>
          {item.title()}
        </Text>
        <Text c="dimmed">{item.description()}</Text>
      </div>
    </div>
  ))

  return (
    <Container size={700} className={classes.wrapper}>
      <Text className={classes.supTitle}>{m.featuresimages__sup_title()}</Text>

      <Title className={classes.title} order={2}>
        {m.featuresimages__title_before()}
        {asI18n(' ')}
        <span className={classes.highlight}>{m.featuresimages__title_highlight()}</span>
        {asI18n(' ')}
        {m.featuresimages__title_after()}
      </Title>

      <Container size={660} p={0}>
        <Text c="dimmed" className={classes.description}>
          {m.featuresimages__description()}
        </Text>
      </Container>

      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing={50} mt={30}>
        {items}
      </SimpleGrid>
    </Container>
  )
}
