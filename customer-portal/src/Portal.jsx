import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, Bell, CalendarDays, Check, ChevronDown, CircleHelp, CreditCard, FileText, Headphones, LayoutDashboard, LogOut, Menu, PackageCheck, Plus, Search, Settings, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import { api, dateLabel, money } from './api.js';

const SpendingChart = lazy(() => import('./SpendingChart.jsx'));

const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/profile', label: 'My profile', icon: UserRound },
  { to: '/plans', label: 'Available plans', icon: PackageCheck },
  { to: '/subscriptions', label: 'My subscription', icon: Activity },
  { to: '/invoices', label: 'My invoices', icon: FileText },
  { to: '/payments', label: 'My payments', icon: CreditCard },
  { to: '/renew', label: 'Renew subscription', icon: CalendarDays },
  { to: '/support', label: 'Support', icon: Headphones },
];

function useResource(path, refresh = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  useEffect(() => {
    let active = true;
    setState((old) => ({ ...old, loading: true, error: '' }));
    api(path).then((data) => active && setState({ data, loading: false, error: '' }))
      .catch((error) => active && setState({ data: null, loading: false, error: error.message }));
    return () => { active = false; };
  }, [path, refresh]);
  return state;
}

function Toast({ toast, dismiss }) {
  useEffect(() => { if (toast) { const timer = setTimeout(dismiss, 3200); return () => clearTimeout(timer); } }, [toast, dismiss]);
  return toast ? <div className={`toast ${toast.type === 'error' ? 'toast-error' : ''}`} role="status"><span><Check size={15} /></span>{toast.text}<button onClick={dismiss} aria-label="Dismiss"><X size={15} /></button></div> : null;
}

function Skeleton({ rows = 3 }) { return <div className="skeleton-list" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div className="skeleton-line" key={i} />)}</div>; }
function PageTitle({ eyebrow, title, action }) { return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>{action}</div>; }
function Empty({ title, note, action }) { return <div className="empty-state"><span className="empty-icon"><CircleHelp size={21} /></span><strong>{title}</strong><p>{note}</p>{action}</div>; }
function Status({ value }) { return <span className={`status status-${String(value).toLowerCase().replace(/\s/g, '-')}`}>{value}</span>; }

export function Portal({ user, onSignOut }) {
  const [toast, setToast] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [profile, setProfile] = useState(null);
  const location = useLocation();
  const notify = (text, type = 'success') => setToast({ text, type });
  const title = navigation.find((item) => item.to === location.pathname)?.label || 'Customer portal';
  return <div className="portal-shell">
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
      <Link to="/" className="brand"><span className="brand-mark"><Sparkles size={18} /></span><span>brightloop<span className="brand-software"> SOFTWARE</span></span></Link>
      <div className="workspace-label">CUSTOMER SPACE</div>
      <nav className="side-nav">{navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setMobileMenu(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'My invoices' && <span className="nav-dot" />}</NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="support-note"><span className="support-bubble"><Headphones size={17} /></span><strong>Need a hand?</strong><span>We're here to help.</span><Link to="/support">Contact support <ArrowRight size={13} /></Link></div><button className="nav-link signout-link" onClick={onSignOut}><LogOut size={17} />Sign out</button></div>
    </aside>
    {mobileMenu && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
    <div className="portal-main">
      <header className="topbar"><button className="icon-button mobile-menu-button" aria-label="Open menu" onClick={() => setMobileMenu(true)}><Menu size={19} /></button><div className="breadcrumb"><span>Brightloop</span><span className="crumb-slash">/</span><strong>{title}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Notifications" title="Notifications"><Bell size={18} /><i className="notification-pip" /></button><button className="icon-button" aria-label="Settings" title="Settings"><Settings size={18} /></button><div className="top-divider" /><span className="user-name">{user.name}</span><span className="avatar">{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span></div></header>
      <main className="page-content"><Routes>
        <Route path="/" element={<Dashboard notify={notify} />} />
        <Route path="/profile" element={<Profile notify={notify} />} />
        <Route path="/plans" element={<Plans notify={notify} />} />
        <Route path="/subscriptions" element={<Subscriptions notify={notify} />} />
        <Route path="/invoices" element={<Invoices notify={notify} />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/renew" element={<Renewals notify={notify} />} />
        <Route path="/support" element={<Support notify={notify} />} />
        <Route path="*" element={<NavigateHome />} />
      </Routes></main>
      <footer className="portal-footer"><span>© {new Date().getFullYear()} Brightloop Software</span><span><ShieldCheck size={13} /> Your account data is private</span></footer>
    </div>
    <Toast toast={toast} dismiss={() => setToast(null)} />
  </div>;
}

function NavigateHome() { const navigate = useNavigate(); useEffect(() => navigate('/', { replace: true }), [navigate]); return null; }

function Dashboard({ notify }) {
  const { data, loading, error } = useResource('/dashboard');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  if (loading) return <><div className="page-title"><div><span className="eyebrow">YOUR ACCOUNT</span><h1>Loading your dashboard</h1></div></div><Skeleton rows={5} /></>;
  if (error) return <div className="form-alert error-alert">{error}</div>;
  const countdown = data.nextRenewal ? Math.max(0, new Date(`${data.nextRenewal}T23:59:59`).getTime() - now) : 0;
  const days = Math.floor(countdown / 86400000);
  const hours = Math.floor((countdown % 86400000) / 3600000);
  const paidPercent = data.paidCount + data.unpaidCount ? Math.round(data.paidCount / (data.paidCount + data.unpaidCount) * 100) : 0;
  return <>
    {data.overdueCount > 0 && <div className="overdue-banner"><span className="alert-mark">!</span><div><strong>{data.overdueCount} invoice{data.overdueCount > 1 ? 's are' : ' is'} overdue</strong><span>{money(data.overdueAmount)} needs your attention.</span></div><Link to="/invoices">View invoices <ArrowRight size={14} /></Link></div>}
    <div className="welcome-row"><div><span className="eyebrow">YOUR ACCOUNT AT A GLANCE</span><h1>Hello, {data.name} <span className="wave">👋</span><br /><span className="welcome-second">How are you doing today?</span></h1><p className="welcome-caption">Here’s what’s happening with your Brightloop account.</p></div><div className="today-chip"><CalendarDays size={15} />{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div></div>
    <section className="stats-grid">
      <Stat label="Active subscriptions" value={data.activeCount} icon={Activity} detail="Across your account" tone="violet" />
      <Stat label="Next renewal" value={data.nextRenewal ? dateLabel(data.nextRenewal) : 'Not scheduled'} icon={CalendarDays} detail={data.upcomingSubscription?.plan_name || 'No active plan'} tone="blue" />
      <Stat label="Outstanding amount" value={money(data.outstanding)} icon={CreditCard} detail={data.overdueCount ? `${data.overdueCount} overdue invoice${data.overdueCount > 1 ? 's' : ''}` : 'All caught up'} tone="orange" />
      <Stat label="Total paid" value={money(data.paidTotal)} icon={Check} detail="Payments to date" tone="green" />
    </section>
    <section className="dashboard-grid">
      <article className="panel chart-panel"><div className="panel-heading"><div><span className="eyebrow">PAYMENT ACTIVITY</span><h2>Your spending</h2></div><span className="period-chip">Last 6 months <ChevronDown size={13} /></span></div><div className="chart-total"><strong>{money(data.chart.reduce((sum, item) => sum + item.amount, 0))}</strong><span>paid in the past six months</span></div><div className="chart-wrap"><Suspense fallback={<div className="chart-loading">Preparing chart...</div>}><SpendingChart data={data.chart} /></Suspense></div></article>
      <article className="panel invoice-progress"><div className="panel-heading"><div><span className="eyebrow">BILLING HEALTH</span><h2>Invoice progress</h2></div><span className="progress-ring"><Check size={15} /></span></div><div className="progress-count"><strong>{paidPercent}%</strong><span>of invoices paid</span></div><div className="progress-bar"><span style={{ width: `${paidPercent}%` }} /></div><div className="progress-line"><span><i className="legend-dot paid-dot" />Paid</span><strong>{data.paidCount}</strong></div><div className="progress-line"><span><i className="legend-dot unpaid-dot" />Unpaid</span><strong>{data.unpaidCount}</strong></div><div className="progress-foot">Keep your account in good standing.</div></article>
      <article className="panel renewal-panel"><div className="renewal-decoration"><span /><span /></div><div className="renewal-top"><span className="eyebrow">UPCOMING RENEWAL</span><span className="renewal-calendar"><CalendarDays size={16} /></span></div>{data.upcomingSubscription ? <><h2>{data.upcomingSubscription.plan_name}</h2><p>{data.upcomingSubscription.number} · renews {dateLabel(data.upcomingSubscription.expiry_date)}</p><div className="countdown"><div><strong>{days}</strong><span>days</span></div><span className="countdown-colon">:</span><div><strong>{hours.toString().padStart(2, '0')}</strong><span>hours</span></div></div><Link to="/renew" className="renew-link">Manage renewal <ArrowRight size={14} /></Link></> : <Empty title="No upcoming renewals" note="Active subscriptions will appear here." action={<Link className="text-link" to="/plans">Browse plans</Link>} />}</article>
      <article className="panel recent-panel"><div className="panel-heading"><div><span className="eyebrow">LATEST ACTIVITY</span><h2>Recent invoices</h2></div><Link className="text-link" to="/invoices">View all <ArrowRight size={14} /></Link></div>{data.invoices.length ? <div className="recent-list">{data.invoices.map((invoice) => <div className="recent-row" key={invoice.id}><span className="invoice-file"><FileText size={17} /></span><div className="recent-invoice-name"><strong>{invoice.number}</strong><span>{dateLabel(invoice.date)}</span></div><div className="recent-amount"><strong>{money(invoice.amount)}</strong><Status value={invoice.status} /></div><button className="download-button" title="Download invoice PDF" aria-label={`Download ${invoice.number}`} onClick={() => downloadInvoice(invoice.id, notify)}><ArrowDownToLine size={16} /></button></div>)}</div> : <Empty title="No invoices yet" note="Your invoices will show up here." />}</article>
    </section>
  </>;
}

function Stat({ label, value, icon: Icon, detail, tone }) { return <article className="stat-card"><span className={`stat-icon stat-${tone}`}><Icon size={17} /></span><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-detail">{detail}</span></article>; }

async function downloadInvoice(id, notify) {
  try {
    const blob = await api(`/invoices/${id}/pdf`);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `invoice-${id}.pdf`; anchor.click(); URL.revokeObjectURL(url);
  } catch (error) { notify(error.message, 'error'); }
}

function Profile({ notify }) {
  const { data, loading, error } = useResource('/profile');
  const [form, setForm] = useState(null);
  const [password, setPassword] = useState({ currentPassword: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setForm(data); }, [data]);
  const save = async (event) => { event.preventDefault(); setBusy(true); try { await api('/profile', { method: 'PUT', body: JSON.stringify(form) }); notify('Profile saved.'); } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); } };
  const changePassword = async (event) => { event.preventDefault(); if (password.password !== password.confirm) return notify('New passwords do not match.', 'error'); setBusy(true); try { const { confirm, ...body } = password; await api('/profile/password', { method: 'PUT', body: JSON.stringify(body) }); setPassword({ currentPassword: '', password: '', confirm: '' }); notify('Password changed.'); } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); } };
  if (loading || !form) return <><PageTitle eyebrow="ACCOUNT SETTINGS" title="My profile" /><Skeleton rows={4} /></>;
  if (error) return <div className="form-alert error-alert">{error}</div>;
  return <><PageTitle eyebrow="ACCOUNT SETTINGS" title="My profile" /><div className="profile-layout"><section className="panel profile-panel"><div className="section-heading"><span className="profile-avatar">{form.name.split(' ').map((s) => s[0]).slice(0,2).join('').toUpperCase()}</span><div><h2>Personal details</h2><p>Keep your account information up to date.</p></div></div><form className="form-grid" onSubmit={save}><label>Full name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength="2" /></label><label>Email address<input value={form.email} readOnly aria-readonly="true" /><small>Email address cannot be changed here.</small></label><label>Phone number<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 415 555 0132" /></label><label>Company<input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Your company" /></label><label className="full-field">Billing address<textarea value={form.billing_address} onChange={(e) => setForm({ ...form, billing_address: e.target.value })} rows="3" placeholder="Street, city, postal code" /></label><div className="form-actions full-field"><button className="button primary-button" disabled={busy}>Save changes</button></div></form></section><section className="panel password-panel"><div className="section-heading"><span className="secure-icon"><ShieldCheck size={18} /></span><div><h2>Change password</h2><p>Use a unique password for your account.</p></div></div><form className="form-stack" onSubmit={changePassword}><label>Current password<input type="password" autoComplete="current-password" value={password.currentPassword} onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })} required /></label><label>New password<input type="password" autoComplete="new-password" value={password.password} onChange={(e) => setPassword({ ...password, password: e.target.value })} required minLength="9" /></label><PasswordHint value={password.password} /><label>Confirm new password<input type="password" autoComplete="new-password" value={password.confirm} onChange={(e) => setPassword({ ...password, confirm: e.target.value })} required /></label><button className="button secondary-button">Update password</button></form></section></div></>;
}

function PasswordHint({ value }) { const checks = [['9+ characters', value.length > 8], ['Uppercase letter', /[A-Z]/.test(value)], ['Lowercase letter', /[a-z]/.test(value)], ['Special character', /[^A-Za-z0-9]/.test(value)]]; return <div className="password-hint">{checks.map(([text, ok]) => <span className={ok ? 'rule-valid' : ''} key={text}>{ok ? <Check size={12} /> : <Circle size={12} />}{text}</span>)}</div>; }

function Plans({ notify }) {
  const { data, loading, error } = useResource('/plans');
  const [selections, setSelections] = useState({});
  const [busy, setBusy] = useState(0);
  const request = async (plan) => { setBusy(plan.id); try { const selected = selections[plan.id] || {}; await api(`/plans/${plan.id}/request`, { method: 'POST', body: JSON.stringify({ quantity: plan.minimum_quantity, variantId: selected.variantId || null }) }); notify('Your plan request was submitted.'); } catch (e) { notify(e.message, 'error'); } finally { setBusy(0); } };
  if (loading) return <><PageTitle eyebrow="FIND YOUR FIT" title="Available plans" /><Skeleton rows={4} /></>;
  return <><PageTitle eyebrow="FIND YOUR FIT" title="Available plans" /><p className="page-intro">Choose a plan that fits your team. Your request will be reviewed by our team.</p>{error ? <div className="form-alert error-alert">{error}</div> : data.length ? <div className="plans-grid">{data.map((plan, index) => {
    const selected = selections[plan.id]?.variantId;
    const variant = plan.variants.find((item) => item.id === Number(selected));
    const price = Number(plan.price) + Number(variant?.price_delta || 0);
    return <article className={`plan-card ${index === 0 ? 'plan-featured' : ''}`} key={plan.id}><div className="plan-card-head"><span className="plan-symbol"><PackageCheck size={19} /></span>{index === 0 && <span className="recommended">POPULAR</span>}</div><span className="plan-product">{plan.product_name}</span><h2>{plan.name}</h2><div className="plan-price">{money(price)}<span> / {plan.billing_period}</span></div><div className="plan-meta"><span>Minimum quantity</span><strong>{plan.minimum_quantity}</strong></div><div className="plan-meta"><span>Available</span><strong>{dateLabel(plan.available_from)} – {dateLabel(plan.available_to)}</strong></div>{plan.variants.length > 0 && <label className="variant-select">Product variant<select value={selected || ''} onChange={(e) => setSelections({ ...selections, [plan.id]: { variantId: e.target.value } })}><option value="">Choose a variant</option>{plan.variants.map((item) => <option key={item.id} value={item.id}>{item.name}{item.price_delta ? ` (+${money(item.price_delta)})` : ''}</option>)}</select></label>}<div className="plan-features">{plan.features.map((feature) => <span key={feature}><Check size={14} />{feature}</span>)}</div><button className={`button ${index === 0 ? 'primary-button' : 'secondary-button'} full-button`} onClick={() => request(plan)} disabled={busy === plan.id || (!!plan.variants.length && !selected)}>{busy === plan.id ? 'Submitting...' : 'Request this plan'}<ArrowRight size={15} /></button></article>;
  })}</div> : <Empty title="No plans available" note="There are no plans available for your account right now." />}</>;
}

function Subscriptions({ notify }) {
  const { data, loading, error } = useResource('/subscriptions');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const steps = ['Draft', 'Quotation', 'Confirmed', 'Active', 'Closed'];
  const open = async (subscription) => { setSelected(subscription.id); try { setDetail(await api(`/subscriptions/${subscription.id}`)); } catch (e) { notify(e.message, 'error'); } };
  if (loading) return <><PageTitle eyebrow="YOUR SERVICES" title="My subscriptions" /><Skeleton rows={4} /></>;
  return <><PageTitle eyebrow="YOUR SERVICES" title="My subscriptions" action={<Link className="button secondary-button" to="/plans"><Plus size={15} /> Browse plans</Link>} />{error ? <div className="form-alert error-alert">{error}</div> : data.length ? <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Subscription</th><th>Plan</th><th>Start date</th><th>Expiry date</th><th>Payment terms</th><th>Status</th><th /></tr></thead><tbody>{data.map((subscription) => <tr key={subscription.id}><td><button className="table-link" onClick={() => open(subscription)}>{subscription.number}</button></td><td>{subscription.plan_name}</td><td>{dateLabel(subscription.start_date)}</td><td>{dateLabel(subscription.expiry_date)}</td><td>{subscription.payment_terms}</td><td><Status value={subscription.status} /></td><td><button className="icon-button mini-icon" title="View details" onClick={() => open(subscription)}><ArrowRight size={16} /></button></td></tr>)}</tbody></table></div></div> : <Empty title="No subscriptions yet" note="Your active and requested plans will appear here." action={<Link className="button primary-button" to="/plans">Explore plans</Link>} />}
    {detail && <Modal title={detail.number} close={() => { setDetail(null); setSelected(null); }}><div className="detail-top"><div><span className="eyebrow">{detail.plan_name}</span><h3>{money(detail.total)}<small> total</small></h3></div><Status value={detail.status} /></div><div className="stepper">{steps.map((step, index) => { const current = steps.indexOf(detail.status); return <div className={`step ${index <= current ? 'step-done' : ''}`} key={step}><span>{index < current ? <Check size={12} /> : index + 1}</span><small>{step}</small></div>; })}</div><div className="detail-facts"><span>Start date<strong>{dateLabel(detail.start_date)}</strong></span><span>Expiry date<strong>{dateLabel(detail.expiry_date)}</strong></span><span>Payment terms<strong>{detail.payment_terms}</strong></span></div><h4 className="table-subheading">Line items</h4><div className="table-scroll"><table><thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Tax</th><th>Discount</th><th>Amount</th></tr></thead><tbody>{detail.lines.map((line) => <tr key={line.id}><td>{line.product}</td><td>{line.quantity}</td><td>{money(line.unit_price)}</td><td>{line.tax_rate}%</td><td>{line.discount_rate}%</td><td>{money(line.amount)}</td></tr>)}</tbody></table></div></Modal>}
  </>;
}

function Modal({ title, close, children }) { useEffect(() => { const listener = (e) => e.key === 'Escape' && close(); window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, [close]); return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="modal"><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button></div>{children}</section></div>; }

function Invoices({ notify }) {
  const [status, setStatus] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [search, setSearch] = useState(''); const [page, setPage] = useState(1); const [selected, setSelected] = useState(null);
  const query = useMemo(() => `/invoices?status=${encodeURIComponent(status)}&from=${from}&to=${to}&search=${encodeURIComponent(search)}&page=${page}&limit=8`, [status, from, to, search, page]);
  const { data, loading, error } = useResource(query);
  const view = async (id) => { try { setSelected(await api(`/invoices/${id}`)); } catch (e) { notify(e.message, 'error'); } };
  return <><PageTitle eyebrow="BILLING HISTORY" title="My invoices" /><div className="filter-bar"><label className="search-control"><Search size={16} /><input placeholder="Search invoice number" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} /></label><select aria-label="Filter by status" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}><option value="">All statuses</option><option>Draft</option><option>Confirmed</option><option>Paid</option><option>Overdue</option></select><label className="date-filter"><span>From</span><input aria-label="From date" type="date" value={from} onChange={(e) => { setPage(1); setFrom(e.target.value); }} /></label><label className="date-filter"><span>To</span><input aria-label="To date" type="date" value={to} onChange={(e) => { setPage(1); setTo(e.target.value); }} /></label></div>{error ? <div className="form-alert error-alert">{error}</div> : loading ? <Skeleton rows={4} /> : data.items.length ? <><div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Invoice no.</th><th>Invoice date</th><th>Due date</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{data.items.map((invoice) => <tr key={invoice.id}><td><button className="table-link" onClick={() => view(invoice.id)}>{invoice.number}</button></td><td>{dateLabel(invoice.date)}</td><td>{dateLabel(invoice.due_date)}</td><td className="amount-cell">{money(invoice.total)}</td><td><Status value={invoice.status} /></td><td><div className="table-actions"><button className="icon-button mini-icon" title="View invoice" onClick={() => view(invoice.id)}><FileText size={15} /></button><button className="icon-button mini-icon" title="Download invoice PDF" onClick={() => downloadInvoice(invoice.id, notify)}><ArrowDownToLine size={15} /></button></div></td></tr>)}</tbody></table></div><div className="pagination"><span>{data.total} invoice{data.total === 1 ? '' : 's'}</span><div><button className="icon-button mini-icon" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ArrowLeft size={15} /></button><span>Page {data.page} of {Math.max(data.pages, 1)}</span><button className="icon-button mini-icon" disabled={page >= data.pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ArrowRight size={15} /></button></div></div></div></> : <Empty title="No invoices match" note="Try changing your filters or search terms." />}
    {selected && <Modal title={selected.number} close={() => setSelected(null)}><div className="invoice-detail-head"><div><span className="eyebrow">INVOICE DATE</span><strong>{dateLabel(selected.date)}</strong></div><div><span className="eyebrow">DUE DATE</span><strong>{dateLabel(selected.due_date)}</strong></div><Status value={selected.status} /></div><div className="table-scroll"><table><thead><tr><th>Product</th><th>Qty</th><th>Unit</th><th>Discount</th><th>Tax</th><th>Amount</th></tr></thead><tbody>{selected.lines.map((line) => <tr key={line.id}><td>{line.product}</td><td>{line.quantity}</td><td>{money(line.unit_price)}</td><td>{line.discount_rate}%</td><td>{line.tax_rate}%</td><td>{money(line.quantity * line.unit_price * (1 - line.discount_rate / 100) * (1 + line.tax_rate / 100))}</td></tr>)}</tbody></table></div><div className="invoice-totals"><span>Subtotal<strong>{money(selected.subtotal)}</strong></span><span>Discount<strong>-{money(selected.discount)}</strong></span><span>Tax<strong>{money(selected.tax)}</strong></span><span className="invoice-grand-total">Total<strong>{money(selected.total)}</strong></span></div>{selected.note && <p className="invoice-note">{selected.note}</p>}<div className="modal-actions"><button className="button secondary-button" onClick={() => window.print()}><FileText size={15} /> Print</button><button className="button primary-button" onClick={() => downloadInvoice(selected.id, notify)}><ArrowDownToLine size={15} /> Download PDF</button></div></Modal>}
  </>;
}

function Payments() {
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [method, setMethod] = useState('');
  const query = useMemo(() => `/payments?from=${from}&to=${to}&method=${encodeURIComponent(method)}`, [from, to, method]);
  const { data, loading, error } = useResource(query);
  return <><PageTitle eyebrow="PAYMENT HISTORY" title="My payments" /><div className="payment-totals"><div className="panel payment-total"><span className="stat-icon stat-green"><Check size={16} /></span><span>Total paid</span><strong>{loading ? '...' : money(data?.paidTotal)}</strong></div><div className="panel payment-total"><span className="stat-icon stat-orange"><CreditCard size={16} /></span><span>Outstanding</span><strong>{loading ? '...' : money(data?.outstanding)}</strong></div></div><div className="filter-bar"><label className="date-filter"><span>From</span><input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="date-filter"><span>To</span><input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><select aria-label="Filter by payment method" value={method} onChange={(e) => setMethod(e.target.value)}><option value="">All methods</option><option>Card</option><option>Bank transfer</option><option>Cash</option><option>Other</option></select></div>{error ? <div className="form-alert error-alert">{error}</div> : loading ? <Skeleton rows={4} /> : data.items.length ? <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Date</th><th>Invoice no.</th><th>Payment method</th><th>Note</th><th>Amount</th></tr></thead><tbody>{data.items.map((payment) => <tr key={payment.id}><td>{dateLabel(payment.date)}</td><td>{payment.invoice_number}</td><td><span className="method-label"><CreditCard size={14} />{payment.method}</span></td><td>{payment.note || '—'}</td><td className="amount-cell">{money(payment.amount)}</td></tr>)}</tbody></table></div></div> : <Empty title="No payments found" note="Payments matching these filters will appear here." />}</>;
}

function Renewals({ notify }) {
  const [refresh, setRefresh] = useState(0); const { data, loading, error } = useResource('/renewals', refresh); const [notes, setNotes] = useState({}); const [busy, setBusy] = useState(0);
  const submit = async (subscriptionId) => { setBusy(subscriptionId); try { const result = await api('/renewals', { method: 'POST', body: JSON.stringify({ subscriptionId, note: notes[subscriptionId] || '' }) }); notify(result.message); setRefresh((v) => v + 1); } catch (e) { notify(e.message, 'error'); } finally { setBusy(0); } };
  return <><PageTitle eyebrow="KEEP THE MOMENTUM" title="Renew subscription" /><p className="page-intro">Request a renewal for an eligible subscription. Our team will confirm the next steps.</p>{loading ? <Skeleton rows={4} /> : error ? <div className="form-alert error-alert">{error}</div> : <><div className="renew-sub-grid">{data.subscriptions.map((sub) => { const allowed = sub.allows_renewal && sub.plan_status === 'Open'; const pending = data.requests.some((request) => request.subscription_id === sub.id && request.status === 'Pending'); return <article className="panel renew-sub-card" key={sub.id}><div className="renew-card-head"><span className="plan-symbol"><CalendarDays size={18} /></span><Status value={sub.status} /></div><h2>{sub.plan_name}</h2><p>{sub.number} · expires {dateLabel(sub.expiry_date)}</p>{allowed ? <><label className="note-label">Add a note <textarea rows="2" maxLength="1000" placeholder="Anything we should know? (optional)" value={notes[sub.id] || ''} onChange={(e) => setNotes({ ...notes, [sub.id]: e.target.value })} /></label><button className="button primary-button" onClick={() => submit(sub.id)} disabled={busy === sub.id || pending}>{pending ? 'Request pending' : busy === sub.id ? 'Submitting...' : 'Request renewal'}<ArrowRight size={14} /></button></> : <div className="plan-closed"><CircleHelp size={15} />This plan is closed or does not allow renewal.</div>}</article>; })}{!data.subscriptions.length && <Empty title="No renewable subscriptions" note="Only active subscriptions with renewal enabled can be requested." />}</div><section className="panel history-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR REQUESTS</span><h2>Renewal request history</h2></div></div>{data.requests.length ? <div className="table-scroll"><table><thead><tr><th>Subscription</th><th>Plan</th><th>Requested</th><th>Note</th><th>Status</th></tr></thead><tbody>{data.requests.map((request) => <tr key={request.id}><td>{request.subscription_number}</td><td>{request.plan_name}</td><td>{dateLabel(request.created_at)}</td><td>{request.note || '—'}</td><td><Status value={request.status} /></td></tr>)}</tbody></table></div> : <p className="quiet-empty">No renewal requests yet.</p>}</section></>}</>;
}

const faqs = [
  ['Where can I find my invoices?', 'Open My invoices from the navigation. You can filter by status and date, inspect line items, then download a PDF or print.'],
  ['How do I renew a subscription?', 'Go to Renew subscription and submit a request for any eligible active plan. The request status appears in the history below.'],
  ['When will my payment appear?', 'Payments are shown as soon as they have been recorded against your account. Contact support if something looks incorrect.'],
  ['Can I change my billing email?', 'Your sign-in email is read-only in the portal. Contact our support team to request an email change.'],
];
function Support({ notify }) {
  const [refresh, setRefresh] = useState(0); const tickets = useResource('/support', refresh); const [open, setOpen] = useState(0); const [form, setForm] = useState({ subject: '', category: 'Billing', message: '' }); const [busy, setBusy] = useState(false);
  const send = async (event) => { event.preventDefault(); setBusy(true); try { await api('/support', { method: 'POST', body: JSON.stringify(form) }); setForm({ subject: '', category: 'Billing', message: '' }); notify('Support request sent.'); setRefresh((v) => v + 1); } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); } };
  return <><PageTitle eyebrow="WE'RE HERE FOR YOU" title="Support" /><div className="support-layout"><section className="panel support-form-panel"><div className="section-heading"><span className="support-bubble"><Headphones size={18} /></span><div><h2>Send us a message</h2><p>Our customer team will get back to you.</p></div></div><form className="form-stack" onSubmit={send}><label>Subject<input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required minLength="3" maxLength="160" placeholder="How can we help?" /></label><label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option>Billing</option><option>Subscription</option><option>Technical</option><option>Account</option><option>Other</option></select></label><label>Message<textarea rows="5" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required minLength="10" maxLength="5000" placeholder="Tell us a little more..." /></label><button className="button primary-button" disabled={busy}>{busy ? 'Sending...' : 'Send message'}<ArrowRight size={15} /></button></form><div className="contact-details"><span><strong>Email</strong> support@brightloop.example</span><span><strong>Phone</strong> +1 (800) 555-0148</span></div></section><div className="support-side"><section className="panel faq-panel"><div className="panel-heading"><div><span className="eyebrow">QUICK ANSWERS</span><h2>Frequently asked</h2></div></div><div className="faq-list">{faqs.map(([question, answer], index) => <div className={`faq-item ${open === index ? 'faq-open' : ''}`} key={question}><button onClick={() => setOpen(open === index ? -1 : index)} aria-expanded={open === index}><span>{question}</span><Plus size={16} /></button>{open === index && <p>{answer}</p>}</div>)}</div></section><section className="panel ticket-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR SUPPORT</span><h2>Recent tickets</h2></div></div>{tickets.loading ? <Skeleton rows={2} /> : tickets.error ? <p className="quiet-empty">{tickets.error}</p> : tickets.data?.length ? <div className="ticket-list">{tickets.data.map((ticket) => <div className="ticket-row" key={ticket.id}><span className="ticket-icon"><Headphones size={15} /></span><div><strong>{ticket.subject}</strong><span>{ticket.category} · {dateLabel(ticket.created_at)}</span></div><Status value={ticket.status} /></div>)}</div> : <p className="quiet-empty">No support tickets yet.</p>}</section></div></div></>;
}