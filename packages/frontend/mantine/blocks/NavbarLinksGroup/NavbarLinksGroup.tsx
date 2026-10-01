import { useState } from 'react'
import type { FC } from 'react'
import type { I18nString } from '@pikku/react'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { Box, Collapse, Group, Text, ThemeIcon, UnstyledButton } from '@pikku/mantine/core'
import classes from './NavbarLinksGroup.module.css'

export type LinksGroupProps = {
  icon: LucideIcon
  // Nav labels are UI copy — pass m.*() message functions, never raw strings.
  label: I18nString
  initiallyOpened?: boolean
  links?: { label: I18nString; link: string }[]
}

export const LinksGroup: FC<LinksGroupProps> = ({ icon: Icon, label, initiallyOpened, links }) => {
  const hasLinks = Array.isArray(links)
  const [opened, setOpened] = useState(initiallyOpened || false)
  const items = (hasLinks ? links : []).map((link, i) => (
    <Text<'a'>
      component="a"
      className={classes.link}
      href={link.link}
      key={i}
      onClick={(event) => event.preventDefault()}
    >
      {link.label}
    </Text>
  ))

  return (
    <>
      <UnstyledButton onClick={() => setOpened((o) => !o)} className={classes.control}>
        <Group justify="space-between" gap={0}>
          <Box style={{ display: 'flex', alignItems: 'center' }}>
            <ThemeIcon variant="light" size={30}>
              <Icon size={18} />
            </ThemeIcon>
            <Box ml="md">{label}</Box>
          </Box>
          {hasLinks && (
            <ChevronRight
              className={classes.chevron}
              strokeWidth={1.5}
              size={16}
              style={{ transform: opened ? 'rotate(-90deg)' : 'none' }}
            />
          )}
        </Group>
      </UnstyledButton>
      {hasLinks ? <Collapse expanded={opened}>{items}</Collapse> : null}
    </>
  )
}
