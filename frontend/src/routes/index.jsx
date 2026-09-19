import { createBrowserRouter } from 'react-router-dom';

// routes
import AuthenticationRoutes from './AuthenticationRoutes';
import MainRoutes from './MainRoutes';

// ==============================|| ROUTING RENDER ||============================== //

function normalizeRouterBaseName(rawBaseName) {
  const trimmed = (rawBaseName || '/').trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  return withoutTrailingSlash.startsWith('/') ? withoutTrailingSlash : `/${withoutTrailingSlash}`;
}

const router = createBrowserRouter([MainRoutes, AuthenticationRoutes], {
  basename: normalizeRouterBaseName(import.meta.env.VITE_APP_BASE_NAME)
});

export default router;
