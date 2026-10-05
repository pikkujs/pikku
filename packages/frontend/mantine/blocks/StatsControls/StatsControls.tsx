import dayjs from 'dayjs'
import { useState } from 'react'
import { Bike, ChevronDown, ChevronUp, Footprints, Waves, type LucideIcon } from 'lucide-react'
import { Group, Paper, Text, UnstyledButton } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import type { I18nString } from '@pikku/react'
import classes from './StatsControls.module.css'

// Activity labels are UI copy (m.*); the km readouts are opaque metric data (asI18n).
const data: { icon: LucideIcon; label: () => I18nString }[] = [
  { icon: Footprints, label: m.statscontrols__running },
  { icon: Waves, label: m.statscontrols__swimming },
  { icon: Bike, label: m.statscontrols__bike },
]

export function StatsControls() {
  const [date, setDate] = useState(new Date(2021, 9, 24))

  const stats = data.map((stat) => {
    const Icon = stat.icon
    return (
      <Paper className={classes.stat} radius="md" shadow="md" p="xs" key={stat.label()}>
        <Icon size={32} className={classes.icon} strokeWidth={1.5} />
        <div>
          <Text className={classes.label}>{stat.label()}</Text>
          <Text fz="xs" className={classes.count}>
            <span className={classes.value}>
              {asI18n(`${Math.floor(Math.random() * 6 + 4)}km`)}
            </span>{' '}
            {asI18n('/ 10km')}
          </Text>
        </div>
      </Paper>
    )
  })

  return (
    <div className={classes.root}>
      <div className={classes.controls}>
        <UnstyledButton
          className={classes.control}
          onClick={() => setDate((current) => dayjs(current).add(1, 'day').toDate())}
          aria-label={m.statscontrols__next_day()}
        >
          <ChevronUp size={16} className={classes.controlIcon} strokeWidth={1.5} />
        </UnstyledButton>

        <div className={classes.date}>
          <Text className={classes.day}>{asI18n(dayjs(date).format('DD'))}</Text>
          <Text className={classes.month}>{asI18n(dayjs(date).format('MMMM'))}</Text>
        </div>

        <UnstyledButton
          className={classes.control}
          onClick={() => setDate((current) => dayjs(current).subtract(1, 'day').toDate())}
          aria-label={m.statscontrols__previous_day()}
        >
          <ChevronDown size={16} className={classes.controlIcon} strokeWidth={1.5} />
        </UnstyledButton>
      </div>
      <Group style={{ flex: 1 }}>{stats}</Group>
    </div>
  )
}
