import { Slider } from '@pikku/mantine/core'
import { useHover } from '@mantine/hooks'
import { m } from '@/i18n/messages'

export function SliderHover() {
  const { hovered, ref } = useHover()

  return (
    <Slider
      defaultValue={40}
      min={10}
      max={90}
      ref={ref}
      label={null}
      thumbLabel={m.sliderhover__thumb()}
      styles={{
        thumb: {
          transition: 'opacity 150ms ease',
          opacity: hovered ? 1 : 0,
        },
      }}
    />
  )
}
