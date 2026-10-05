import type { FC } from 'react'
import type { I18nString } from '@pikku/react'
import { Checkbox, Image, SimpleGrid, Text, UnstyledButton } from '@pikku/mantine/core'
import { useUncontrolled } from '@mantine/hooks'
import { m } from '@/i18n/messages'
import classes from './ImageCheckboxes.module.css'

type ImageCheckboxProps = {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  // Option label and supporting line — UI copy, translated by the caller.
  title: I18nString
  description: I18nString
  // Icon/illustration URL; opaque data, never translated.
  image: string
}

export const ImageCheckbox: FC<ImageCheckboxProps> = ({
  checked,
  defaultChecked,
  onChange,
  title,
  description,
  image,
}) => {
  const [value, handleChange] = useUncontrolled({
    value: checked,
    defaultValue: defaultChecked,
    finalValue: false,
    onChange,
  })

  return (
    <UnstyledButton
      onClick={() => handleChange(!value)}
      data-checked={value || undefined}
      className={classes.button}
      component="div"
    >
      <Image src={image} alt={title} w={40} h={40} />

      <div className={classes.body}>
        <Text c="dimmed" size="xs" lh={1} mb={5}>
          {description}
        </Text>
        <Text fw={500} size="sm" lh={1}>
          {title}
        </Text>
      </div>

      <Checkbox
        checked={value}
        onChange={() => {}}
        tabIndex={-1}
        styles={{ input: { cursor: 'pointer' } }}
        aria-label={title}
      />
    </UnstyledButton>
  )
}

const ICONS =
  'https://raw.githubusercontent.com/mantinedev/ui.mantine.dev/master/lib/ImageCheckboxes/icons'

const mockdata = [
  {
    description: m.imagecheckboxes__beach_desc(),
    title: m.imagecheckboxes__beach_title(),
    image: `${ICONS}/sea.png`,
  },
  {
    description: m.imagecheckboxes__city_desc(),
    title: m.imagecheckboxes__city_title(),
    image: `${ICONS}/city.png`,
  },
  {
    description: m.imagecheckboxes__hiking_desc(),
    title: m.imagecheckboxes__hiking_title(),
    image: `${ICONS}/mountain.png`,
  },
  {
    description: m.imagecheckboxes__winter_desc(),
    title: m.imagecheckboxes__winter_title(),
    image: `${ICONS}/winter.png`,
  },
]

export function ImageCheckboxes() {
  const items = mockdata.map((item) => <ImageCheckbox {...item} key={item.image} />)
  return <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>{items}</SimpleGrid>
}
