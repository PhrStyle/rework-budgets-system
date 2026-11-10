import './styles.css';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { ApiFailure } from './api/client.js';
import { ErrorBoundary, RouteError } from './components/ErrorBoundary.js';
import { Layout } from './components/Layout.js';
import { BudgetList } from './pages/BudgetList.js';
import { BudgetPage } from './pages/BudgetPage.js';
import { Login } from './pages/Login.js';
import { initObservability, isReportable, report, setReportedUser } from './observability.js';
import { currentUser } from './session.js';

initObservability();
setReportedUser(currentUser()?.id ?? null);

const queryClient = new QueryClient({
  // Falha de rede ou 5xx da API, em qualquer consulta ou edição: vai para o Sentry com o ID da
  // requisição. As telas continuam mostrando o erro do jeito delas.
  queryCache: new QueryCache({
    onError: (error) => {
      if (isReportable(error)) report(error, { origem: 'consulta' });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (isReportable(error)) report(error, { origem: 'edicao' });
    },
  }),
  defaultOptions: {
    queries: {
      // Erro do cliente (404, 400) não melhora repetindo; queda de rede e 5xx, sim.
      retry: (count, error) => !(error instanceof ApiFailure && error.status < 500) && count < 2,
    },
  },
});

const router = createBrowserRouter([
  { path: '/entrar', element: <Login />, errorElement: <RouteError /> },
  {
    element: <Layout />,
    errorElement: <RouteError />,
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
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
