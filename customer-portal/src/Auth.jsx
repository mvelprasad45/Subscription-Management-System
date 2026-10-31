import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Circle, LockKeyhole, Sparkles } from 'lucide-react';
import { api } from './api.js';

const rules = [
  ['length', 'More than 8 characters', (value) => value.length > 8],
  ['upper', 'One uppercase letter', (value) => /[A-Z]/.test(value)],
  ['lower', 'One lowercase letter', (value) => /[a-z]/.test(value)],
  ['special', 'One special character', (value) => /[^A-Za-z0-9]/.test(value)],
];

export function AuthPage({ mode, onSignIn }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showRules, setShowRules] = useState(false);
  const update = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setError(''); setMessage('');
    if (mode === 'signup' && form.password !== form.confirm) return setError('Passwords do not match.');
    if (['signup', 'reset'].includes(mode) && !rules.every(([, , test]) => test(form.password))) return setError('Please meet all password requirements.');
    setBusy(true);
    try {
      if (mode === 'login' || mode === 'signup') {
        const path = mode === 'login' ? '/auth/login' : '/auth/signup';
        const result = await api(path, { method: 'POST', body: JSON.stringify({ name: form.name, email: form.email, password: form.password, ...(mode === 'signup' ? { confirmPassword: form.confirm } : {}) }) });
        onSignIn(result);
      } else if (mode === 'forgot') {
        const result = await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: form.email }) });
        setMessage(result.message);
      } else {
        const result = await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: params.get('token'), password: form.password }) });
        setMessage(result.message);
      }
    } catch (issue) { setError(issue.message); }
    finally { setBusy(false); }
  };
  const heading = { login: 'Welcome back', signup: 'Create your account', forgot: 'Reset your password', reset: 'Choose a new password' }[mode];
  const description = { login: 'Your Brightloop workspace is ready when you are.', signup: 'One place to keep your subscriptions in flow.', forgot: 'We will email a secure link if an account matches.', reset: 'Your reset link is valid for one hour.' }[mode];
  return <main className="auth-screen">
    <div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" />
    <section className="auth-card">
      <a className="brand auth-brand" href="/login"><span className="brand-mark"><Sparkles size={18} /></span><span>brightloop<span className="brand-software"> SOFTWARE</span></span></a>
      <div className="auth-content">
        <div className="auth-lock"><LockKeyhole size={20} /></div>
        <h1>{heading}</h1><p className="subtle">{description}</p>
        <form onSubmit={submit} className="form-stack">
          {mode === 'signup' && <label>Full name<input autoComplete="name" value={form.name} onChange={update('name')} required minLength="2" placeholder="Alex Morgan" /></label>}
          {mode !== 'reset' && <label>Email address<input type="email" autoComplete="email" value={form.email} onChange={update('email')} required placeholder="you@company.com" /></label>}
          {['login', 'signup'].includes(mode) && <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={update('password')} onFocus={() => setShowRules(mode === 'signup')} required placeholder="Enter your password" /></label>}
          {mode === 'signup' && <>
            {showRules && <div className="password-rules">{rules.map(([key, text, test]) => <span className={test(form.password) ? 'rule-valid' : ''} key={key}>{test(form.password) ? <Check size={13} /> : <Circle size={13} />}{text}</span>)}</div>}
            <label>Confirm password<input type="password" autoComplete="new-password" value={form.confirm} onChange={update('confirm')} required placeholder="Re-enter your password" /></label>
          </>}
          {mode === 'reset' && <label>New password<input type="password" autoComplete="new-password" value={form.password} onChange={update('password')} onFocus={() => setShowRules(true)} required placeholder="Create a secure password" /></label>}
          {mode === 'reset' && showRules && <div className="password-rules">{rules.map(([key, text, test]) => <span className={test(form.password) ? 'rule-valid' : ''} key={key}>{test(form.password) ? <Check size={13} /> : <Circle size={13} />}{text}</span>)}</div>}
          {error && <div className="form-alert error-alert">{error}</div>}{message && <div className="form-alert success-alert">{message}</div>}
          <button className="button primary-button full-button" disabled={busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Update password'}</button>
        </form>
        <div className="auth-links">
          {mode === 'login' && <><Link to="/forgot-password">Forgot password?</Link><span>New to Brightloop? <Link to="/signup">Create an account</Link></span></>}
          {mode === 'signup' && <span>Already have an account? <Link to="/login">Sign in</Link></span>}
          {mode === 'forgot' && <Link to="/login"><ArrowLeft size={14} /> Back to sign in</Link>}
          {mode === 'reset' && message && <button className="link-button" onClick={() => navigate('/login')}>Continue to sign in</button>}
        </div>
        {mode === 'login' && <div className="demo-login"><strong>Demo account</strong><span>demo@brightloop.com</span><span>DemoPass!123</span></div>}
      </div>
      <div className="auth-foot">A clearer view of your subscriptions.</div>
    </section>
  </main>;
}