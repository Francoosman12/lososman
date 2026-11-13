import { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, LogIn, Store } from 'lucide-react';

export default function StaffLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/status')
      .then(async (response) => {
        const status = await response.json().catch(() => null);
        if (!response.ok) throw new Error(status?.message || 'No se pudo verificar la sesión.');
        return status;
      })
      .then((status) => {
        if (!active) return;
        if (status?.authenticated) window.location.replace('/sistema');
        else setCheckingSession(false);
      })
      .catch((sessionError) => {
        if (!active) return;
        setError(sessionError.message || 'No se pudo verificar la sesión.');
        setCheckingSession(false);
      });
    return () => { active = false; };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudo iniciar sesión.');
      window.location.assign('/sistema');
    } catch (loginError) {
      setError(loginError.message || 'No se pudo iniciar sesión.');
      setSubmitting(false);
    }
  };

  return <main className="staff-login-page">
    <header className="staff-login-header">
      <a className="staff-login-brand" href="/" aria-label="Volver al catálogo Los Osman">
        <span><Store size={22} /></span>
        <strong>LOS OSMAN</strong>
      </a>
      <a className="staff-login-back" href="/"><ArrowLeft size={16} /> Volver al catálogo</a>
    </header>
    <section className="staff-login-card" aria-labelledby="staff-login-title">
      <span className="staff-login-icon"><KeyRound size={22} /></span>
      <span className="staff-login-eyebrow">ACCESO INTERNO</span>
      <h1 id="staff-login-title">Ingresar al sistema</h1>
      <p className="staff-login-description">Usá tu cuenta del local. El sistema habilita las herramientas correspondientes a tu rol.</p>
      {checkingSession ? <p className="staff-login-status" role="status">Verificando sesión…</p> : <form onSubmit={submit}>
        <label htmlFor="staff-username">Usuario o correo</label>
        <input id="staff-username" required autoComplete="username" autoCapitalize="none" value={username} onChange={(event) => setUsername(event.target.value)} />
        <label htmlFor="staff-password">Contraseña</label>
        <input id="staff-password" type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        {error && <p className="staff-login-error" role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          <LogIn size={17} /> {submitting ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>}
      {!checkingSession && !error && <p className="staff-login-help">¿Necesitás acceso? Pedíselo al propietario del local. No hay registro público de usuarios internos.</p>}
      <a className="staff-login-mobile-back" href="/"><ArrowLeft size={16} /> Volver al catálogo</a>
    </section>
  </main>;
}
