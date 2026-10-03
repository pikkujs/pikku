import { GripHorizontal } from 'lucide-react'
import { Slider } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './SliderWhite.module.css'

export function SliderWhite() {
  return (
    <Slider
      classNames={classes}
      thumbChildren={<GripHorizontal size={20} strokeWidth={1.5} />}
      defaultValue={40}
      label={null}
      thumbLabel={m.sliderwhite__thumb()}
    />
  )
}
