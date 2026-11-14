import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/Toast';

/**
 * Test harness factory.
 *
 * Every test renders inside the same providers the real app mounts in
 * `App.tsx` (react-query + toast) plus a MemoryRouter, so components that use
 * `useToast`, `useMutation` and `<Link>` work unchanged.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        // Tests assert on loading/error states explicitly; keep them immediate.
        staleTime: 0,
      },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  {
    route = '/',
    queryClient = createTestQueryClient(),
  }: { route?: string; queryClient?: QueryClient } = {},
): { queryClient: QueryClient } {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
  }

  render(ui, { wrapper: Wrapper });
  return { queryClient };
}

export { renderWithProviders as renderPage };
