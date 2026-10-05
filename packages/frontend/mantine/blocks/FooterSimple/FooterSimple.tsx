import { Anchor, Container, Group } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { Wordmark } from '@/components/Wordmark'
import classes from './FooterSimple.module.css'

// Footer link labels are UI copy (m.*); `link` targets are yours to wire.
const links = [
  { link: '#', label: m.footersimple__contact },
  { link: '#', label: m.footersimple__privacy },
  { link: '#', label: m.footersimple__blog },
  { link: '#', label: m.footersimple__careers },
]

export function FooterSimple() {
  const items = links.map((link) => (
    <Anchor
      c="dimmed"
      key={link.link + link.label()}
      href={link.link}
      onClick={(event) => event.preventDefault()}
      size="sm"
    >
      {link.label()}
    </Anchor>
  ))

  return (
    <div className={classes.footer}>
      <Container className={classes.inner}>
        <Wordmark name={m.app__name()} size={28} />
        <Group className={classes.links}>{items}</Group>
      </Container>
    </div>
  )
}
