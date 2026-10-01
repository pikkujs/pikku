import { useState } from 'react'
import {
  ChevronDown,
  Heart,
  LogOut,
  MessageCircle,
  Pause,
  Settings,
  Star,
  ArrowLeftRight,
  Trash2,
} from 'lucide-react'
import {
  Avatar,
  Burger,
  Container,
  Divider,
  Drawer,
  Group,
  Menu,
  ScrollArea,
  Tabs,
  Text,
  UnstyledButton,
  useMantineTheme,
} from '@pikku/mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { asI18n, m } from '@/i18n/messages'
import { Wordmark } from '@/components/Wordmark'
import classes from './HeaderTabs.module.css'

// Signed-in user is opaque data (asI18n); a real app passes it via props.
const user = {
  name: asI18n('Jane Spoonfighter'),
  image: 'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-5.png',
}

// Tab `value` is a stable identifier; `label` is UI copy (m.*).
const tabs = [
  { value: 'home', label: m.headertabs__home },
  { value: 'orders', label: m.headertabs__orders },
  { value: 'education', label: m.headertabs__education },
  { value: 'community', label: m.headertabs__community },
  { value: 'forums', label: m.headertabs__forums },
  { value: 'support', label: m.headertabs__support },
  { value: 'account', label: m.headertabs__account },
  { value: 'helpdesk', label: m.headertabs__helpdesk },
]

export function HeaderTabs() {
  const theme = useMantineTheme()
  const [opened, { toggle, close }] = useDisclosure(false)
  const [userMenuOpened, setUserMenuOpened] = useState(false)

  const items = tabs.map((tab) => (
    <Tabs.Tab value={tab.value} key={tab.value}>
      {tab.label()}
    </Tabs.Tab>
  ))

  return (
    <div className={classes.header}>
      <Container className={classes.mainSection} size="md">
        <Group justify="space-between">
          <Wordmark name={m.app__name()} />

          <Burger
            opened={opened}
            onClick={toggle}
            hiddenFrom="xs"
            size="sm"
            aria-label={m.headertabs__toggle_navigation()}
          />

          <Menu
            width={260}
            position="bottom-end"
            transitionProps={{ transition: 'pop-top-right' }}
            onClose={() => setUserMenuOpened(false)}
            onOpen={() => setUserMenuOpened(true)}
            withinPortal
          >
            <Menu.Target>
              <UnstyledButton
                className={`${classes.user}${userMenuOpened ? ` ${classes.userActive}` : ''}`}
              >
                <Group gap={7}>
                  <Avatar src={user.image} radius="xl" size={20} name={user.name} />
                  <Text fw={500} size="sm" lh={1} mr={3}>
                    {user.name}
                  </Text>
                  <ChevronDown size={12} strokeWidth={1.5} />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Heart size={16} color={theme.colors.red[6]} strokeWidth={1.5} />}
              >
                {m.headertabs__liked_posts()}
              </Menu.Item>
              <Menu.Item
                leftSection={<Star size={16} color={theme.colors.yellow[6]} strokeWidth={1.5} />}
              >
                {m.headertabs__saved_posts()}
              </Menu.Item>
              <Menu.Item
                leftSection={
                  <MessageCircle size={16} color={theme.colors.blue[6]} strokeWidth={1.5} />
                }
              >
                {m.headertabs__your_comments()}
              </Menu.Item>

              <Menu.Label>{m.headertabs__settings()}</Menu.Label>
              <Menu.Item leftSection={<Settings size={16} strokeWidth={1.5} />}>
                {m.headertabs__account_settings()}
              </Menu.Item>
              <Menu.Item leftSection={<ArrowLeftRight size={16} strokeWidth={1.5} />}>
                {m.headertabs__change_account()}
              </Menu.Item>
              <Menu.Item leftSection={<LogOut size={16} strokeWidth={1.5} />}>
                {m.headertabs__logout()}
              </Menu.Item>

              <Menu.Divider />

              <Menu.Label>{m.headertabs__danger_zone()}</Menu.Label>
              <Menu.Item leftSection={<Pause size={16} strokeWidth={1.5} />}>
                {m.headertabs__pause_subscription()}
              </Menu.Item>
              <Menu.Item color="red" leftSection={<Trash2 size={16} strokeWidth={1.5} />}>
                {m.headertabs__delete_account()}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Container>
      <Container size="md">
        <Tabs
          defaultValue="home"
          variant="outline"
          visibleFrom="sm"
          classNames={{
            root: classes.tabs,
            list: classes.tabsList,
            tab: classes.tab,
          }}
        >
          <Tabs.List>{items}</Tabs.List>
        </Tabs>
      </Container>

      <Drawer
        opened={opened}
        onClose={close}
        size="100%"
        padding="md"
        title={m.headertabs__navigation()}
        hiddenFrom="xs"
        zIndex={1000000}
      >
        <ScrollArea h="calc(100dvh - 5rem)" mx="-md">
          <Divider my="sm" />
          {tabs.map((tab) => (
            <a
              href="#"
              key={tab.value}
              className={classes.drawerLink}
              onClick={(event) => event.preventDefault()}
            >
              {tab.label()}
            </a>
          ))}
        </ScrollArea>
      </Drawer>
    </div>
  )
}
