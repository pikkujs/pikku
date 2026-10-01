import { GripVertical, Dot } from 'lucide-react'
import { RangeSlider } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './SliderMarks.module.css'

const point = <Dot size={10} style={{ marginTop: 6 }} strokeWidth={1.5} />

export function SliderMarks() {
  return (
    <RangeSlider
      mt="xl"
      mb="xl"
      classNames={classes}
      defaultValue={[30, 60]}
      thumbChildren={<GripVertical size={20} strokeWidth={1.5} />}
      thumbFromLabel={m.slidermarks__from()}
      thumbToLabel={m.slidermarks__to()}
      marks={[
        { value: 0, label: '0' },
        { value: 12.5, label: point },
        { value: 25, label: '25' },
        { value: 37.5, label: point },
        { value: 50, label: '50' },
        { value: 62.5, label: point },
        { value: 75, label: '75' },
        { value: 87.5, label: point },
        { value: 100, label: '100' },
      ]}
    />
  )
}
