import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ToastProvider } from './components/Toast/ToastProvider';
import { I18nProvider } from './i18n/I18nProvider';
import { routes } from './routes';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const router = createBrowserRouter(routes);

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
);
