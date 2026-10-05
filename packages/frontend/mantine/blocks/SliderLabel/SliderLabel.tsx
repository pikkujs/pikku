import { RangeSlider } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './SliderLabel.module.css'

export function SliderLabel() {
  return (
    <RangeSlider
      labelAlwaysOn
      defaultValue={[20, 60]}
      classNames={classes}
      thumbFromLabel={m.sliderlabel__from()}
      thumbToLabel={m.sliderlabel__to()}
    />
  )
}
