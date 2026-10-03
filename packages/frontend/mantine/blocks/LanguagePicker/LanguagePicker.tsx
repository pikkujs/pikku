import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Group, Image, Menu, UnstyledButton } from '@pikku/mantine/core'
import { asI18n } from '@/i18n/messages'
import classes from './LanguagePicker.module.css'

// Language names are opaque locale labels (never translated); flag URLs are
// plain image sources.
const FLAGS =
  'https://raw.githubusercontent.com/mantinedev/ui.mantine.dev/master/lib/LanguagePicker/images'

const data = [
  { label: asI18n('English'), image: `${FLAGS}/english.png` },
  { label: asI18n('German'), image: `${FLAGS}/german.png` },
  { label: asI18n('Italian'), image: `${FLAGS}/italian.png` },
  { label: asI18n('French'), image: `${FLAGS}/french.png` },
  { label: asI18n('Polish'), image: `${FLAGS}/polish.png` },
]

export function LanguagePicker() {
  const [opened, setOpened] = useState(false)
  const [selected, setSelected] = useState(data[0])
  const items = data.map((item) => (
    <Menu.Item
      leftSection={<Image src={item.image} w={18} h={18} alt="" />}
      onClick={() => setSelected(item)}
      key={item.image}
    >
      {item.label}
    </Menu.Item>
  ))

  return (
    <Menu
      onOpen={() => setOpened(true)}
      onClose={() => setOpened(false)}
      radius="md"
      width="target"
      withinPortal
    >
      <Menu.Target>
        <UnstyledButton className={classes.control} data-expanded={opened || undefined}>
          <Group gap="xs">
            <Image src={selected.image} w={22} h={22} alt="" />
            <span className={classes.label}>{selected.label}</span>
          </Group>
          <ChevronDown size={16} className={classes.icon} strokeWidth={1.5} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>{items}</Menu.Dropdown>
    </Menu>
  )
}
