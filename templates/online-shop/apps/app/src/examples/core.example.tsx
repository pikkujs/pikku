import { PikkuProvider, createPikku, createFeatureFlags, useFeatureFlag } from '@pikku/react'
import { PikkuFetch } from '@project/functions-sdk/pikku/pikku-fetch.gen'
import { PikkuRPC } from '@project/functions-sdk/pikku/pikku-rpc.gen'
import type { ReactNode } from 'react'

// @snippet start co-react-provider
const pikku = createPikku(PikkuFetch, PikkuRPC, {
  serverUrl: 'https://api.example.com',
})

export function App({ children }: { children: ReactNode }) {
  return <PikkuProvider pikku={pikku}>{children}</PikkuProvider>
}
// @snippet end co-react-provider

// @snippet start co-react-feature-flags
type FeatureFlagName = 'sandboxes' | 'calendar'

export const featureFlags = createFeatureFlags<FeatureFlagName>({
  endpoint: 'https://api.example.com/feature-flags',
})

export function SandboxButton() {
  const enabled = useFeatureFlag<FeatureFlagName>('sandboxes')
  return enabled ? <button>New sandbox</button> : null
}
// @snippet end co-react-feature-flags
