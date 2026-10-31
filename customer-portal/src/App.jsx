import { lazy, Suspense, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthPage } from './Auth.jsx';

const Portal = lazy(() => import('./Portal.jsx').then((module) => ({ default: module.Portal })));

export default function App() {
  const [session, setSession] = useState(() => {
    const token = localStorage.getItem('brightloop-token');
    const user = localStorage.getItem('brightloop-user');
    return token && user ? { token, user: JSON.parse(user) } : null;
  });
  const navigate = useNavigate();
  const location = useLocation();
  const signIn = (data) => {
    localStorage.setItem('brightloop-token', data.token);
    localStorage.setItem('brightloop-user', JSON.stringify(data.user));
    setSession(data);
    navigate('/');
  };
  const signOut = () => {
    localStorage.removeItem('brightloop-token');
    localStorage.removeItem('brightloop-user');
    setSession(null);
    navigate('/login');
  };
  return <Routes>
    <Route path="/login" element={session ? <Navigate to="/" replace /> : <AuthPage mode="login" onSignIn={signIn} />} />
    <Route path="/signup" element={session ? <Navigate to="/" replace /> : <AuthPage mode="signup" onSignIn={signIn} />} />
    <Route path="/forgot-password" element={session ? <Navigate to="/" replace /> : <AuthPage mode="forgot" />} />
    <Route path="/reset-password" element={session ? <Navigate to="/" replace /> : <AuthPage mode="reset" />} />
    <Route path="*" element={session ? <Suspense fallback={<div className="app-loading">Loading your workspace...</div>}><Portal user={session.user} onSignOut={signOut} key={location.pathname} /></Suspense> : <Navigate to="/login" replace state={{ from: location.pathname }} />} />
  </Routes>;
}