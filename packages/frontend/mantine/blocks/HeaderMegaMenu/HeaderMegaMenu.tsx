import {
  BookOpen,
  PieChart,
  ChevronDown,
  Code,
  Coins,
  Fingerprint,
  Bell,
  type LucideIcon,
} from 'lucide-react'
import {
  Anchor,
  Box,
  Burger,
  Button,
  Center,
  Collapse,
  Divider,
  Drawer,
  Group,
  HoverCard,
  ScrollArea,
  SimpleGrid,
  Text,
  ThemeIcon,
  UnstyledButton,
  useMantineTheme,
} from '@pikku/mantine/core'
import { useDisclosure } from '@mantine/hooks'
import type { I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import { Wordmark } from '@/components/Wordmark'
import classes from './HeaderMegaMenu.module.css'

type Feature = { icon: LucideIcon; title: () => I18nString; description: () => I18nString }

// Feature blurbs are sample UI copy (m.*).
const mockdata: Feature[] = [
  {
    icon: Code,
    title: m.headermegamenu__open_source,
    description: m.headermegamenu__open_source_desc,
  },
  { icon: Coins, title: m.headermegamenu__free, description: m.headermegamenu__free_desc },
  {
    icon: BookOpen,
    title: m.headermegamenu__documentation,
    description: m.headermegamenu__documentation_desc,
  },
  {
    icon: Fingerprint,
    title: m.headermegamenu__security,
    description: m.headermegamenu__security_desc,
  },
  {
    icon: PieChart,
    title: m.headermegamenu__analytics,
    description: m.headermegamenu__analytics_desc,
  },
  {
    icon: Bell,
    title: m.headermegamenu__notifications,
    description: m.headermegamenu__notifications_desc,
  },
]

export function HeaderMegaMenu() {
  const [drawerOpened, { toggle: toggleDrawer, close: closeDrawer }] = useDisclosure(false)
  const [linksOpened, { toggle: toggleLinks }] = useDisclosure(false)
  const theme = useMantineTheme()

  const links = mockdata.map((item) => (
    <UnstyledButton className={classes.subLink} key={item.title()}>
      <Group wrap="nowrap" align="flex-start">
        <ThemeIcon size={34} variant="default" radius="md">
          <item.icon size={22} color={theme.colors.blue[6]} />
        </ThemeIcon>
        <div>
          <Text size="sm" fw={500}>
            {item.title()}
          </Text>
          <Text size="xs" c="dimmed">
            {item.description()}
          </Text>
        </div>
      </Group>
    </UnstyledButton>
  ))

  return (
    <Box pb={120}>
      <header className={classes.header}>
        <Group justify="space-between" h="100%">
          <Wordmark name={m.app__name()} />

          <Group h="100%" gap={0} visibleFrom="sm">
            <a href="#" className={classes.link}>
              {m.headermegamenu__home()}
            </a>
            <HoverCard width={600} position="bottom" radius="md" shadow="md" withinPortal>
              <HoverCard.Target>
                <a href="#" className={classes.link}>
                  <Center inline>
                    <Box component="span" mr={5}>
                      {m.headermegamenu__features()}
                    </Box>
                    <ChevronDown size={16} color={theme.colors.blue[6]} />
                  </Center>
                </a>
              </HoverCard.Target>

              <HoverCard.Dropdown style={{ overflow: 'hidden' }}>
                <Group justify="space-between" px="md">
                  <Text fw={500}>{m.headermegamenu__features()}</Text>
                  <Anchor href="#" fz="xs">
                    {m.headermegamenu__view_all()}
                  </Anchor>
                </Group>

                <Divider my="sm" />

                <SimpleGrid cols={2} spacing={0}>
                  {links}
                </SimpleGrid>

                <div className={classes.dropdownFooter}>
                  <Group justify="space-between">
                    <div>
                      <Text fw={500} fz="sm">
                        {m.headermegamenu__get_started()}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {m.headermegamenu__get_started_desc()}
                      </Text>
                    </div>
                    <Button variant="default">{m.headermegamenu__get_started()}</Button>
                  </Group>
                </div>
              </HoverCard.Dropdown>
            </HoverCard>
            <a href="#" className={classes.link}>
              {m.headermegamenu__learn()}
            </a>
            <a href="#" className={classes.link}>
              {m.headermegamenu__academy()}
            </a>
          </Group>

          <Group visibleFrom="sm">
            <Button variant="default">{m.headermegamenu__login()}</Button>
            <Button>{m.headermegamenu__signup()}</Button>
          </Group>

          <Burger
            opened={drawerOpened}
            onClick={toggleDrawer}
            hiddenFrom="sm"
            aria-label={m.headermegamenu__toggle_navigation()}
          />
        </Group>
      </header>

      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        size="100%"
        padding="md"
        title={m.headermegamenu__navigation()}
        hiddenFrom="sm"
        zIndex={1000000}
      >
        <ScrollArea h="calc(100dvh - 5rem)" mx="-md">
          <Divider my="sm" />

          <a href="#" className={classes.link}>
            {m.headermegamenu__home()}
          </a>
          <UnstyledButton className={classes.link} onClick={toggleLinks}>
            <Center inline>
              <Box component="span" mr={5}>
                {m.headermegamenu__features()}
              </Box>
              <ChevronDown size={16} color={theme.colors.blue[6]} />
            </Center>
          </UnstyledButton>
          <Collapse expanded={linksOpened}>{links}</Collapse>
          <a href="#" className={classes.link}>
            {m.headermegamenu__learn()}
          </a>
          <a href="#" className={classes.link}>
            {m.headermegamenu__academy()}
          </a>

          <Divider my="sm" />

          <Group justify="center" grow pb="xl" px="md">
            <Button variant="default">{m.headermegamenu__login()}</Button>
            <Button>{m.headermegamenu__signup()}</Button>
          </Group>
        </ScrollArea>
      </Drawer>
    </Box>
  )
}
