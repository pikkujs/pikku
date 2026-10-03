import { useContext } from 'react'

import { PreviewBridge, PreviewBridgeContext } from './internal.js'

export const usePreviewBridge = (): PreviewBridge => useContext(PreviewBridgeContext)
