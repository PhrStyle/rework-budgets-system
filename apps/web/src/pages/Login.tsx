import { useNavigate } from 'react-router';

import { useSellers } from '../api/queries.js';
import { setUser } from '../session.js';

export function Login() {
  const sellers = useSellers();
  const navigate = useNavigate();

  return (
    <main>
      <div className="pagehead">
        <div>
          <h2>Entrar</h2>
          <p className="muted">
            Login simulado: escolha um usuário. Abra outra janela com outro usuário para ver o
            bloqueio de edição.
          </p>
        </div>
      </div>
      <div className="card usuarios">
        {sellers.isPending && <p className="carregando">Carregando usuários…</p>}
        {sellers.data?.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setUser(s);
              void navigate('/');
            }}
          >
            {s.name}
          </button>
        ))}
      </div>
    </main>
  );
}
