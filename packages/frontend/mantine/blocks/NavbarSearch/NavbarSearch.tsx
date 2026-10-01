import type { I18nString } from '@pikku/react'
import { Lightbulb, Plus, Search, SquareCheck, User, type LucideIcon } from 'lucide-react'
import {
  ActionIcon,
  Badge,
  Box,
  Code,
  Group,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import { UserButton } from './UserButton'
import classes from './NavbarSearch.module.css'

// Nav structure. Labels are UI copy (m.*); notification counts are live data.
const links: { icon: LucideIcon; label: () => I18nString; notifications?: number }[] = [
  { icon: Lightbulb, label: m.navbarsearch__activity, notifications: 3 },
  { icon: SquareCheck, label: m.navbarsearch__tasks, notifications: 4 },
  { icon: User, label: m.navbarsearch__contacts },
]

// Emoji are decorative; labels are UI copy (m.*).
const collections: { emoji: string; label: () => I18nString }[] = [
  { emoji: '👍', label: m.navbarsearch__sales },
  { emoji: '🚚', label: m.navbarsearch__deliveries },
  { emoji: '💸', label: m.navbarsearch__discounts },
  { emoji: '💰', label: m.navbarsearch__profits },
  { emoji: '✨', label: m.navbarsearch__reports },
  { emoji: '🛒', label: m.navbarsearch__orders },
  { emoji: '📅', label: m.navbarsearch__events },
  { emoji: '🙈', label: m.navbarsearch__debts },
  { emoji: '💁‍♀️', label: m.navbarsearch__customers },
]

export function NavbarSearch() {
  const mainLinks = links.map((link) => (
    <UnstyledButton key={link.label()} className={classes.mainLink}>
      <div className={classes.mainLinkInner}>
        <link.icon size={20} className={classes.mainLinkIcon} strokeWidth={1.5} />
        <span>{link.label()}</span>
      </div>
      {link.notifications && (
        <Badge size="sm" variant="filled" className={classes.mainLinkBadge}>
          {asI18n(String(link.notifications))}
        </Badge>
      )}
    </UnstyledButton>
  ))

  const collectionLinks = collections.map((collection) => (
    <a
      href="#"
      onClick={(event) => event.preventDefault()}
      key={collection.label()}
      className={classes.collectionLink}
    >
      <Box component="span" mr={9} fz={16}>
        {collection.emoji}
      </Box>{' '}
      {collection.label()}
    </a>
  ))

  return (
    <nav className={classes.navbar}>
      <div className={classes.section}>
        <UserButton
          name={asI18n('Harriette Spoonlicker')}
          email={asI18n('hspoonlicker@outlook.com')}
        />
      </div>

      <TextInput
        placeholder={m.navbarsearch__search()}
        size="xs"
        leftSection={<Search size={12} strokeWidth={1.5} />}
        rightSectionWidth={70}
        rightSection={<Code className={classes.searchCode}>{asI18n('Ctrl + K')}</Code>}
        styles={{ section: { pointerEvents: 'none' } }}
        mb="sm"
        aria-label={m.navbarsearch__search()}
      />

      <div className={classes.section}>
        <div className={classes.mainLinks}>{mainLinks}</div>
      </div>

      <div className={classes.section}>
        <Group className={classes.collectionsHeader} justify="space-between">
          <Text size="xs" fw={500} c="dimmed">
            {m.navbarsearch__collections()}
          </Text>
          <Tooltip label={m.navbarsearch__create_collection()} withArrow position="right">
            <ActionIcon
              variant="default"
              size={18}
              aria-label={m.navbarsearch__create_collection()}
            >
              <Plus size={12} strokeWidth={1.5} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <div className={classes.collections}>{collectionLinks}</div>
      </div>
    </nav>
  )
}
