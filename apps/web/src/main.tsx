import './styles.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { ApiFailure } from './api/client.js';
import { Layout } from './components/Layout.js';
import { BudgetList } from './pages/BudgetList.js';
import { BudgetPage } from './pages/BudgetPage.js';
import { Login } from './pages/Login.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Erro do cliente (404, 400) não melhora repetindo; queda de rede e 5xx, sim.
      retry: (count, error) => !(error instanceof ApiFailure && error.status < 500) && count < 2,
    },
  },
});

const router = createBrowserRouter([
  { path: '/entrar', element: <Login /> },
  {
    element: <Layout />,
    children: [
      { path: '/', element: <BudgetList /> },
      { path: '/orcamentos/:id', element: <BudgetPage /> },
    ],
  },
]);

const root = document.getElementById('root');
if (!root) throw new Error('#root não encontrado');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
