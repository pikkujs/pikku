import './styles'

// Set favicon dynamically to handle non-root base paths
const favicon = import.meta.env.VITE_CONSOLE_FAVICON || '/pikku-console-logo.png'
const link = document.createElement('link')
link.rel = 'icon'
link.href = import.meta.env.BASE_URL + favicon.replace(/^\//, '')
document.head.appendChild(link)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClientProvider } from './context/QueryClientProvider'
import { ThemeProvider } from './context/ThemeProvider'
import { PikkuHTTPProvider, PikkuRPCProvider } from './context/PikkuRpcProvider'
import { ConsoleRouterProvider } from './router'
import { reactRouterAdapter } from './adapters/react-router'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
      <ConsoleRouterProvider value={reactRouterAdapter}>
        <QueryClientProvider>
          <ThemeProvider locale="en">
            <PikkuHTTPProvider>
              <PikkuRPCProvider>
                <App />
              </PikkuRPCProvider>
            </PikkuHTTPProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ConsoleRouterProvider>
    </BrowserRouter>
  </StrictMode>
)
