import { Instagram, Twitter, Youtube } from 'lucide-react'
import { ActionIcon, Anchor, Group } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import { Wordmark } from '@/components/Wordmark'
import classes from './FooterCentered.module.css'

// Footer link labels are UI copy (m.*); `link` targets are yours to wire.
const links = [
  { link: '#', label: m.footercentered__contact },
  { link: '#', label: m.footercentered__privacy },
  { link: '#', label: m.footercentered__blog },
  { link: '#', label: m.footercentered__store },
  { link: '#', label: m.footercentered__careers },
]

export function FooterCentered() {
  const items = links.map((link) => (
    <Anchor
      c="dimmed"
      key={link.link + link.label()}
      href={link.link}
      lh={1}
      onClick={(event) => event.preventDefault()}
      size="sm"
    >
      {link.label()}
    </Anchor>
  ))

  return (
    <div className={classes.footer}>
      <div className={classes.inner}>
        <Wordmark name={m.app__name()} size={28} />

        <Group className={classes.links}>{items}</Group>

        <Group gap="xs" justify="flex-end" wrap="nowrap">
          <ActionIcon size="lg" variant="default" radius="xl" aria-label={asI18n('Twitter')}>
            <Twitter size={18} strokeWidth={1.5} />
          </ActionIcon>
          <ActionIcon size="lg" variant="default" radius="xl" aria-label={asI18n('YouTube')}>
            <Youtube size={18} strokeWidth={1.5} />
          </ActionIcon>
          <ActionIcon size="lg" variant="default" radius="xl" aria-label={asI18n('Instagram')}>
            <Instagram size={18} strokeWidth={1.5} />
          </ActionIcon>
        </Group>
      </div>
    </div>
  )
}
