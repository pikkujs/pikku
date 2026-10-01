import type { I18nString } from '@pikku/react'
import { Avatar, Group, Paper, Text, Typography } from '@pikku/mantine/core'
import { asI18n } from '@/i18n/messages'
import classes from './CommentHtml.module.css'

export type CommentHtmlProps = {
  // Author/timestamp are opaque data (asI18n in a real app); avatar is a plain
  // URL; body is a trusted rich-text HTML string rendered as-is.
  author?: I18nString
  postedAt?: I18nString
  avatar?: string
  body?: string
}

export function CommentHtml({
  author = asI18n('Jacob Warnhalter'),
  postedAt = asI18n('10 minutes ago'),
  avatar = 'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-2.png',
  body = '<p>I use <a href="https://heroku.com/" rel="noopener noreferrer" target="_blank">Heroku</a> to host my Node.js application, but MongoDB add-on appears to be too <strong>expensive</strong>. I consider switching to <a href="https://www.digitalocean.com/" rel="noopener noreferrer" target="_blank">Digital Ocean</a> VPS to save some cash.</p>',
}: CommentHtmlProps = {}) {
  return (
    <Paper withBorder radius="md" className={classes.comment}>
      <Group>
        <Avatar src={avatar} alt={author} radius="xl" />
        <div>
          <Text fz="sm">{author}</Text>
          <Text fz="xs" c="dimmed">
            {postedAt}
          </Text>
        </div>
      </Group>
      <Typography className={classes.body}>
        <div className={classes.content} dangerouslySetInnerHTML={{ __html: body }} />
      </Typography>
    </Paper>
  )
}
