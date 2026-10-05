import { useState } from 'react'
import { NumberInput, Slider } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './SliderInput.module.css'

export function SliderInput() {
  const [value, setValue] = useState<number | string>(2200)
  return (
    <div className={classes.wrapper}>
      <NumberInput
        value={value}
        onChange={setValue}
        label={m.sliderinput__label()}
        placeholder={m.sliderinput__placeholder()}
        step={50}
        min={0}
        max={8000}
        hideControls
        classNames={{ input: classes.input, label: classes.label }}
      />
      <Slider
        max={8000}
        step={50}
        min={0}
        label={null}
        value={typeof value === 'string' ? 0 : value}
        onChange={setValue}
        size={2}
        className={classes.slider}
        classNames={classes}
        thumbLabel={m.sliderinput__thumb()}
      />
    </div>
  )
}
