import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { adminSession } from '../../api.js';

const LINKS = [
  ['feedback', 'Feedback'],
  ['questions', 'Questions'],
  ['ratings', 'Rating attributes'],
  ['winners', 'Winners'],
  ['prizes', 'Prizes'],
  ['settings', 'Settings'],
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const loggedIn = Boolean(adminSession.get());

  useEffect(() => {
    document.title = 'Feedback admin';
    if (!loggedIn) navigate('/admin/login', { replace: true });
    const onLogout = () => navigate('/admin/login', { replace: true });
    window.addEventListener('admin-logout', onLogout);
    return () => window.removeEventListener('admin-logout', onLogout);
  }, [loggedIn, navigate]);

  if (!loggedIn) return null;

  const logout = () => {
    adminSession.clear();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="admin">
      <header className="admin-header">
        <div className="container admin-header-inner">
          <strong className="brand">Feedback Admin</strong>
          <nav className="admin-nav">
            {LINKS.map(([to, label]) => (
              <NavLink key={to} to={`/admin/${to}`} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
            ))}
          </nav>
          <button className="btn btn-secondary btn-sm" onClick={logout}>Log out</button>
        </div>
      </header>
      <main className="container admin-main">
        <Outlet />
      </main>
    </div>
  );
}
