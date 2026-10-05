import { Instagram, Twitter, Youtube } from 'lucide-react'
import { ActionIcon, Container, Group, Text } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import { Wordmark } from '@/components/Wordmark'
import classes from './FooterLinks.module.css'

// Group headings and link labels are UI copy (m.*); `link` targets are yours to wire.
const data = [
  {
    title: m.footerlinks__about,
    links: [
      { label: m.footerlinks__features, link: '#' },
      { label: m.footerlinks__pricing, link: '#' },
      { label: m.footerlinks__support, link: '#' },
      { label: m.footerlinks__forums, link: '#' },
    ],
  },
  {
    title: m.footerlinks__project,
    links: [
      { label: m.footerlinks__contribute, link: '#' },
      { label: m.footerlinks__media_assets, link: '#' },
      { label: m.footerlinks__changelog, link: '#' },
      { label: m.footerlinks__releases, link: '#' },
    ],
  },
  {
    title: m.footerlinks__community,
    links: [
      { label: m.footerlinks__join_discord, link: '#' },
      { label: m.footerlinks__follow_twitter, link: '#' },
      { label: m.footerlinks__email_newsletter, link: '#' },
      { label: m.footerlinks__github_discussions, link: '#' },
    ],
  },
]

export function FooterLinks() {
  const groups = data.map((group) => {
    const links = group.links.map((link) => (
      <Text
        key={link.label()}
        className={classes.link}
        component="a"
        href={link.link}
        onClick={(event) => event.preventDefault()}
      >
        {link.label()}
      </Text>
    ))

    return (
      <div className={classes.wrapper} key={group.title()}>
        <Text className={classes.title}>{group.title()}</Text>
        {links}
      </div>
    )
  })

  return (
    <footer className={classes.footer}>
      <Container className={classes.inner}>
        <div className={classes.logo}>
          <Wordmark name={m.app__name()} size={30} />
          <Text size="xs" c="dimmed" className={classes.description}>
            {m.footerlinks__description()}
          </Text>
        </div>
        <div className={classes.groups}>{groups}</div>
      </Container>
      <Container className={classes.afterFooter}>
        <Text c="dimmed" size="sm">
          {m.footerlinks__copyright()}
        </Text>

        <Group gap={0} className={classes.social} justify="flex-end" wrap="nowrap">
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
    </footer>
  )
}
