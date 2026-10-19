import type { FC } from 'react'
import { Text } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'

// No icon mark — the generic rounded-square-with-lines glyph was a placeholder
// every build shipped verbatim (the actual browser-tab identity lives in the
// favicon in __root.tsx, which already themes itself). The wordmark carries
// the app's identity through typography alone: tight tracking + weight, no box.
export const Wordmark: FC<{ name: I18nString; size?: number }> = ({ name, size = 30 }) => {
  return (
    <Text fw={700} style={{ fontSize: size * 0.62, letterSpacing: '-0.03em', lineHeight: 1 }}>
      {name}
    </Text>
  )
}
