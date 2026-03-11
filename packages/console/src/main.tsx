import '@/styles'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@/context/QueryClientProvider'
import { ThemeProvider } from '@/context/ThemeProvider'
import { PikkuHTTPProvider, PikkuRPCProvider } from '@/context/PikkuRpcProvider'
import { ConsoleRouterProvider } from '@/router'
import { reactRouterAdapter } from '@/adapters/react-router'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
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
