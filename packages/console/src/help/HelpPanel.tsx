import {
  Anchor,
  Divider,
  Drawer,
  Group,
  Stack,
  Text,
} from '@pikku/mantine/core'
import { ExternalLink } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePhone } from '../lib/breakpoints'
import { HelpText } from './HelpText'
import type { HelpScreen } from './screens'

/**
 * Deliberately overlay-free: the panel explains the screen behind it and its
 * anchors ring controls out there, so a scrim would hide the thing being
 * pointed at.
 */
export function HelpPanel({
  screen,
  opened,
  onClose,
}: {
  screen: HelpScreen
  opened: boolean
  onClose: () => void
}) {
  useLocale()
  const phone = usePhone()
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position={phone ? 'bottom' : 'right'}
      size={phone ? '70%' : 360}
      withOverlay={false}
      lockScroll={false}
      trapFocus={false}
      title={asI18n(screen.title())}
      data-testid="help-panel"
    >
      <Stack gap="md">
        <Text size="sm">
          <HelpText>{screen.what()}</HelpText>
        </Text>
        <Text size="sm">
          <HelpText>{screen.behaviour()}</HelpText>
        </Text>
        <Text size="sm">
          <HelpText>{screen.surprise()}</HelpText>
        </Text>
        <Text size="sm" c="dimmed">
          <HelpText>{screen.examples()}</HelpText>
        </Text>
        <Divider />
        <Stack gap={7}>
          <Text fz={10.5} fw={700} tt="uppercase" lts="0.07em" c="dimmed">
            {m.help_actions_title()}
          </Text>
          {screen.whatYouCanDo.map((line, i) => (
            <Group key={i} gap={7} wrap="nowrap" align="baseline">
              <Text c="dimmed" fz={13}>
                {asI18n('·')}
              </Text>
              <Text size="sm">
                <HelpText>{line()}</HelpText>
              </Text>
            </Group>
          ))}
        </Stack>
        {screen.docsHref && (
          <>
            <Divider />
            <Anchor
              href={screen.docsHref}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
            >
              <Group gap={6} wrap="nowrap">
                {m.help_read_more()}
                <ExternalLink size={13} />
              </Group>
            </Anchor>
          </>
        )}
      </Stack>
    </Drawer>
  )
}
