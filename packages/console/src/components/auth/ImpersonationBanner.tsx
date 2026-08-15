import { useEffect, useLayoutEffect, useRef } from 'react'
import { Group, Text, Button, Box } from '@pikku/mantine/core'
import { UserCog } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useOptionalImpersonation } from '../../context/ImpersonationContext'

/* Hands back the edge the banner has taken. Module scope for the same reason
   the dock's is: an effect that only runs on unmount must not be keyed on a
   callback that changes as the banner re-renders. */
function releaseBannerInset() {
  document.documentElement.style.removeProperty('--app-banner-inset-top')
}

export const ImpersonationBanner: React.FC = () => {
  useLocale()
  const impersonation = useOptionalImpersonation()
  const target = impersonation?.target
  const bannerRef = useRef<HTMLDivElement>(null)

  /* The banner is fixed, so it reserves nothing by itself and paints over the
     top of every page — which swallowed clicks on whatever the page put there.
     Publish the height it occupies and let the layout pad by it. Measured
     rather than a hardcoded height: the bar grows when the impersonated email
     wraps at narrow widths. */
  useLayoutEffect(() => {
    const el = bannerRef.current
    if (!target || !el) {
      releaseBannerInset()
      return
    }
    const publish = () =>
      document.documentElement.style.setProperty(
        '--app-banner-inset-top',
        `${el.getBoundingClientRect().height}px`
      )
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => observer.disconnect()
  }, [target])

  useEffect(() => releaseBannerInset, [])

  if (!target) {
    return null
  }

  return (
    <Box
      ref={bannerRef}
      pos="fixed"
      top={0}
      left={0}
      right={0}
      px="md"
      py={6}
      data-testid="impersonation-banner"
      style={{
        zIndex: 1000,
        backgroundColor: 'var(--mantine-color-yellow-6)',
        color: 'var(--mantine-color-black)',
      }}
    >
      <Group justify="center" gap="sm">
        <UserCog size={16} />
        <Text size="sm" fw={500}>
          {m.impersonate_banner({ email: target.email })}
        </Text>
        <Button
          size="compact-xs"
          variant="filled"
          color="dark"
          data-testid="impersonation-stop"
          onClick={() => impersonation!.clear()}
        >
          {m.impersonate_stop()}
        </Button>
      </Group>
    </Box>
  )
}
