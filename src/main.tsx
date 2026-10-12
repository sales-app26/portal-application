import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/auth/AuthProvider'
import { ApiError } from '@/lib/api'
import { registerServiceWorker } from '@/pwa'
import { router } from '@/router'
import { applyTheme, watchSystemTheme } from '@/lib/theme'
import '@/styles/index.css'

applyTheme()
watchSystemTheme()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't hammer the API on errors the user must act on.
      retry: (count, err) => count < 2 && (!(err instanceof ApiError) || err.status === 0 || err.status >= 500),
      refetchOnWindowFocus: true,
    },
    // Saves are never retried automatically; the form shows Retry (PRD §5.6).
    mutations: { retry: false },
  },
})

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster
          position="bottom-center"
          offset={{ bottom: 'calc(80px + env(safe-area-inset-bottom))' }}
          mobileOffset={{ bottom: 'calc(80px + env(safe-area-inset-bottom))', left: '16px', right: '16px' }}
          toastOptions={{
            classNames: {
              // HeroUI overlay look: a floating surface with a soft shadow, in both themes.
              toast: '!bg-overlay !text-overlay-foreground !border !border-border !rounded-2xl !shadow-overlay !font-sans !text-body-sm !gap-3',
              title: '!font-medium',
              success: '[&_[data-icon]]:!text-up',
              error: '[&_[data-icon]]:!text-down',
              actionButton: '!bg-accent-soft !text-accent-soft-foreground !font-semibold !rounded-pill !px-3 !h-8',
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
