import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mantine/core/styles.css'
import { App } from './App'

// Color scheme + view + section are driven by the host (console Design tab) via
// the iframe URL — e.g. `?colorScheme=dark&view=library&section=Button`. The
// active theme is then driven live via postMessage (see useHostTheme).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
