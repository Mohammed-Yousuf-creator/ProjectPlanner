import { lazy, Suspense, type ComponentType } from 'react';
import { RouteFallback } from './RouteFallback';

type PageModule = Record<string, ComponentType>;

/**
 * Route-level code splitting helper.
 *
 * Every page lives in its own module and is exported as a named function, so
 * this adapts a named export into the default-export shape `React.lazy` needs
 * while attaching the shared Suspense boundary. Keeping the helper here (rather
 * than inlining `lazy(...)` per route) means a single place controls the
 * fallback UI and the chunking strategy.
 */
export function lazyPage(loader: () => Promise<PageModule>, exportName: string): ComponentType {
  const Component = lazy(async () => {
    const module = await loader();
    const page = module[exportName];
    if (!page) {
      // A missing named export is a build-time mistake; fail loudly rather than
      // rendering a blank route.
      throw new Error(`Route module has no exported component named "${exportName}".`);
    }
    return { default: page };
  });

  function LazyRoute() {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Component />
      </Suspense>
    );
  }

  LazyRoute.displayName = `LazyRoute(${exportName})`;
  return LazyRoute;
}
