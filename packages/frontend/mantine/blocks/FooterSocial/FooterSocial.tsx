import { Instagram, Twitter, Youtube } from 'lucide-react'
import { ActionIcon, Container, Group } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import { Wordmark } from '@/components/Wordmark'
import classes from './FooterSocial.module.css'

export function FooterSocial() {
  return (
    <div className={classes.footer}>
      <Container className={classes.inner}>
        <Wordmark name={m.app__name()} size={28} />
        <Group gap={0} className={classes.links} justify="flex-end" wrap="nowrap">
          <ActionIcon size="lg" color="gray" variant="subtle" aria-label={asI18n('Twitter')}>
            <Twitter size={18} strokeWidth={1.5} />
          </ActionIcon>
          <ActionIcon size="lg" color="gray" variant="subtle" aria-label={asI18n('YouTube')}>
            <Youtube size={18} strokeWidth={1.5} />
          </ActionIcon>
          <ActionIcon size="lg" color="gray" variant="subtle" aria-label={asI18n('Instagram')}>
            <Instagram size={18} strokeWidth={1.5} />
          </ActionIcon>
        </Group>
      </Container>
    </div>
  )
}
