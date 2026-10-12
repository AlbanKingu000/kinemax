import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AuthProvider } from './auth/AuthProvider';
import { ToastProvider } from './components/Toast/ToastProvider';
import { I18nProvider } from './i18n/I18nProvider';
import { LocationProvider } from './location/LocationProvider';
import { routes } from './routes';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const router = createBrowserRouter(routes);

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <LocationProvider>
            <RouterProvider router={router} />
          </LocationProvider>
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
);
