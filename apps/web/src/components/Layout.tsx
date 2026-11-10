import { Link, Navigate, Outlet, useNavigate } from 'react-router';

import { setUser, useUser } from '../session.js';

function toggleTheme() {
  const root = document.documentElement;
  const dark = root.dataset.theme
    ? root.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try {
    localStorage.setItem('theme', root.dataset.theme);
  } catch {
    // sem armazenamento: o tema vale até recarregar
  }
}

export function Layout() {
  const user = useUser();
  const navigate = useNavigate();
  if (!user) return <Navigate to="/entrar" replace />;

  return (
    <>
      <header className="top">
        <div className="top-in">
          <Link className="brand" to="/">
            <i />
            Orçamentos
          </Link>
          <span className="pill" style={{ '--c': 'var(--good)' } as React.CSSProperties}>
            versão nova · React + API
          </span>
          <span className="sp" />
          <span className="muted sm">
            {user.name} ·{' '}
            <a
              href="/entrar"
              onClick={(e) => {
                e.preventDefault();
                setUser(null);
                void navigate('/entrar');
              }}
            >
              trocar usuário
            </a>
          </span>
          <button type="button" className="ghost" onClick={toggleTheme} title="Alternar tema">
            ◐ Tema
          </button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
