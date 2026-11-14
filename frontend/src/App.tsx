import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/Toast';
import { router } from '@/routes';
import { useAuthBootstrap } from '@/hooks/useAuth';
import { toApiError } from '@/lib/errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        const status = toApiError(error).status;
        if (status !== null && status >= 400 && status < 500) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});

function Bootstrap() {
  useAuthBootstrap();
  return <RouterProvider router={router} />;
}

export default function App() {
  useEffect(() => {
    document.documentElement.lang = 'en';
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Bootstrap />
      </ToastProvider>
    </QueryClientProvider>
  );
}
