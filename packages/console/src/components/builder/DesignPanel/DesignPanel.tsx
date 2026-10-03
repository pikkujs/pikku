import { Box } from '@pikku/mantine/core'
import { BUILDER_PREVIEW_IFRAME_ID } from '../PreviewBridgeProvider'

import { ThemeEditor } from './ThemeEditor.js'

import { ElementInspector } from './ElementInspector.js'

// The panel has two lenses: Theme edits the active theme spec (one change
// restyles the whole app), Element edits the selected element's own props.
// The lens toggle lives in the inspector card header (DevelopmentBuilderTab)
// and is sticky — picking an element does not switch it back.
// `iframeId` names the preview this panel drives: the app preview by default, the
// design shell when the Design tab mounts it. Only the post-save reload needs it —
// the theme itself is persisted server-side either way.
export function DesignPanel({
  lens,
  iframeId = BUILDER_PREVIEW_IFRAME_ID,
}: {
  lens: 'theme' | 'element'
  iframeId?: string
}) {
  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {lens === 'theme' ? <ThemeEditor iframeId={iframeId} /> : <ElementInspector />}
    </Box>
  )
}
