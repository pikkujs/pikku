import { Heart, HeartCrack } from 'lucide-react'
import { RangeSlider, Slider } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'

const styles = { thumb: { borderWidth: 2, height: 26, width: 26, padding: 3 } }

export function SliderIcon() {
  return (
    <>
      <Slider
        thumbChildren={<Heart size={16} strokeWidth={1.5} />}
        color="red"
        label={null}
        defaultValue={40}
        styles={styles}
        thumbLabel={m.slidericon__heart_thumb()}
      />

      <RangeSlider
        mt="xl"
        styles={styles}
        color="red"
        label={null}
        defaultValue={[20, 60]}
        thumbChildren={[
          <Heart size={16} strokeWidth={1.5} key="1" />,
          <HeartCrack size={16} strokeWidth={1.5} key="2" />,
        ]}
        thumbFromLabel={m.slidericon__from()}
        thumbToLabel={m.slidericon__to()}
      />
    </>
  )
}
