import { Text } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import type { I18nString } from '@pikku/react'
import classes from './StatsGroup.module.css'

// Titles/descriptions are UI copy (m.*); the headline figure is opaque data (asI18n).
type Stat = { title: () => I18nString; stats: I18nString; description: () => I18nString }

const data: Stat[] = [
  {
    title: m.statsgroup__pageviews_title,
    stats: asI18n('456,133'),
    description: m.statsgroup__pageviews_desc,
  },
  {
    title: m.statsgroup__newusers_title,
    stats: asI18n('2,175'),
    description: m.statsgroup__newusers_desc,
  },
  {
    title: m.statsgroup__orders_title,
    stats: asI18n('1,994'),
    description: m.statsgroup__orders_desc,
  },
]

export function StatsGroup() {
  const stats = data.map((stat) => (
    <div key={stat.title()} className={classes.stat}>
      <Text className={classes.count}>{stat.stats}</Text>
      <Text className={classes.title}>{stat.title()}</Text>
      <Text className={classes.description}>{stat.description()}</Text>
    </div>
  ))
  return <div className={classes.root}>{stats}</div>
}
