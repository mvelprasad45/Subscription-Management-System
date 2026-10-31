import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { db, invoiceWithLines } from './db.js';
import { createToken, customerForUser, passwordSchema, requireCustomer } from './auth.js';

export const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.APP_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '32kb' }));
app.use('/api/customer/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

const emailSchema = z.string().trim().email().max(254);
const signUpSchema = z.object({ name: z.string().trim().min(2).max(100), email: emailSchema, password: passwordSchema, confirmPassword: z.string() }).refine((data) => data.password === data.confirmPassword, { message: 'Passwords do not match.', path: ['confirmPassword'] });
const money = (value) => Number(value || 0);
const fail = (res, message, status = 400) => res.status(status).json({ error: message });
const ownSubscription = (id, customerId) => db.prepare('SELECT s.*, p.name AS plan_name, p.allows_renewal, p.status AS plan_status, p.billing_period FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.id=? AND s.customer_id=?').get(id, customerId);
const ownInvoice = (id, customerId) => db.prepare('SELECT * FROM invoices WHERE id=? AND customer_id=?').get(id, customerId);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/customer/auth/signup', (req, res) => {
  const parsed = signUpSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error.issues[0].message);
  const { name, email, password } = parsed.data;
  try {
    const transaction = db.transaction(() => {
      const result = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)').run(name, email, bcrypt.hashSync(password, 12), 'customer');
      const customer = db.prepare('INSERT INTO customers (user_id) VALUES (?)').run(result.lastInsertRowid);
      return { user: { id: Number(result.lastInsertRowid), name, email, role: 'customer' }, customerId: Number(customer.lastInsertRowid) };
    });
    const created = transaction();
    res.status(201).json({ token: createToken(created.user, created.customerId), user: created.user });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return fail(res, 'An account with this email already exists.', 409);
    throw error;
  }
});

app.post('/api/customer/auth/login', (req, res) => {
  const parsed = z.object({ email: emailSchema, password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 'Enter a valid email and password.');
  const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(parsed.data.email);
  if (!user || !bcrypt.compareSync(parsed.data.password, user.password_hash)) return fail(res, 'Email or password is incorrect.', 401);
  if (user.role !== 'customer') return fail(res, 'Customer access is required.', 403);
  const customerId = customerForUser(user.id);
  if (!customerId) return fail(res, 'Customer account is unavailable.', 403);
  res.json({ token: createToken(user, customerId), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/customer/auth/forgot-password', async (req, res) => {
  const parsed = z.object({ email: emailSchema }).safeParse(req.body);
  if (!parsed.success) return fail(res, 'Enter a valid email address.');
  const user = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE AND role='customer'").get(parsed.data.email);
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO password_reset_tokens (user_id,token_hash,expires_at) VALUES (?,?,?)').run(user.id, tokenHash, expiresAt);
    const link = `${process.env.APP_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
      await transport.sendMail({ from: process.env.SMTP_FROM, to: parsed.data.email, subject: 'Reset your Brightloop password', text: `This link expires in one hour: ${link}` });
    } else if (process.env.NODE_ENV !== 'production') {
      console.info(`[password reset] ${parsed.data.email}: ${link}`);
    }
  }
  res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
});

app.post('/api/customer/auth/reset-password', (req, res) => {
  const parsed = z.object({ token: z.string().min(32), password: passwordSchema }).safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error.issues[0].message);
  const tokenHash = crypto.createHash('sha256').update(parsed.data.token).digest('hex');
  const record = db.prepare('SELECT * FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at > ?').get(tokenHash, new Date().toISOString());
  if (!record) return fail(res, 'This reset link is invalid or has expired.', 400);
  const transaction = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash=? WHERE id=? AND role=?').run(bcrypt.hashSync(parsed.data.password, 12), record.user_id, 'customer');
    db.prepare('UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=?').run(record.id);
    db.prepare('UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL').run(record.user_id);
  });
  transaction();
  res.json({ message: 'Password updated. You can now sign in.' });
});

app.use('/api/customer', requireCustomer);

app.get('/api/customer/profile', (req, res) => {
  const profile = db.prepare('SELECT u.name,u.email,c.phone,c.company,c.billing_address FROM customers c JOIN users u ON u.id=c.user_id WHERE c.id=? AND c.user_id=?').get(req.customerId, req.userId);
  if (!profile) return fail(res, 'Customer profile not found.', 404);
  res.json(profile);
});

app.put('/api/customer/profile', (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(100), phone: z.string().trim().max(40).optional().default(''), company: z.string().trim().max(120).optional().default(''), billing_address: z.string().trim().max(500).optional().default('') }).safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error.issues[0].message);
  db.prepare('UPDATE users SET name=? WHERE id=? AND role=?').run(parsed.data.name, req.userId, 'customer');
  db.prepare('UPDATE customers SET phone=?,company=?,billing_address=? WHERE id=? AND user_id=?').run(parsed.data.phone, parsed.data.company, parsed.data.billing_address, req.customerId, req.userId);
  res.json({ message: 'Profile updated.' });
});

app.put('/api/customer/profile/password', (req, res) => {
  const parsed = z.object({ currentPassword: z.string().min(1), password: passwordSchema }).safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error.issues[0].message);
  const user = db.prepare('SELECT password_hash FROM users WHERE id=? AND role=?').get(req.userId, 'customer');
  if (!user || !bcrypt.compareSync(parsed.data.currentPassword, user.password_hash)) return fail(res, 'Current password is incorrect.', 400);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(parsed.data.password, 12), req.userId);
  res.json({ message: 'Password changed.' });
});

app.get('/api/customer/dashboard', (req, res) => {
  const active = db.prepare("SELECT s.*,p.name AS plan_name FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.customer_id=? AND s.status='Active'").all(req.customerId);
  const invoices = db.prepare('SELECT * FROM invoices WHERE customer_id=? ORDER BY date DESC,id DESC').all(req.customerId).map((invoice) => ({ ...invoice, amount: invoiceWithLines(invoice).total, paid: money(db.prepare('SELECT SUM(amount) AS total FROM payments WHERE invoice_id=? AND customer_id=?').get(invoice.id, req.customerId)?.total) }));
  const payments = db.prepare('SELECT p.date,p.amount FROM payments p WHERE p.customer_id=? ORDER BY p.date DESC').all(req.customerId);
  const today = new Date();
  const chart = Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1);
    const key = monthDate.toISOString().slice(0, 7);
    const paid = payments.filter((payment) => payment.date.startsWith(key)).reduce((sum, payment) => sum + payment.amount, 0);
    return { month: monthDate.toLocaleString('en', { month: 'short' }), amount: paid };
  });
  const nextRenewal = active.map((item) => item.expiry_date).sort()[0] || null;
  const outstanding = invoices.filter((invoice) => !['Paid','Draft'].includes(invoice.status)).reduce((sum, invoice) => sum + Math.max(0, invoice.amount - invoice.paid), 0);
  const paidTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const overdue = invoices.filter((invoice) => invoice.status !== 'Paid' && invoice.due_date < today.toISOString().slice(0, 10));
  const paidCount = invoices.filter((invoice) => invoice.status === 'Paid').length;
  res.json({ name: db.prepare('SELECT name FROM users WHERE id=?').get(req.userId)?.name, activeCount: active.length, nextRenewal, outstanding, paidTotal, chart, invoices: invoices.slice(0, 4), paidCount, unpaidCount: invoices.length - paidCount, overdueCount: overdue.length, overdueAmount: overdue.reduce((sum, invoice) => sum + Math.max(0, invoice.amount - invoice.paid), 0), upcomingSubscription: active.sort((a,b) => a.expiry_date.localeCompare(b.expiry_date))[0] || null });
});

app.get('/api/customer/plans', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const plans = db.prepare('SELECT p.*,pr.name AS product_name,pr.description FROM plans p JOIN products pr ON pr.id=p.product_id WHERE p.status=? AND p.available_from<=? AND p.available_to>=? ORDER BY p.price').all('Open', today, today);
  res.json(plans.map((plan) => ({ ...plan, features: JSON.parse(plan.features), variants: db.prepare('SELECT id,name,price_delta FROM product_variants WHERE product_id=? ORDER BY id').all(plan.product_id) })));
});

app.post('/api/customer/plans/:id/request', (req, res) => {
  const planId = Number(req.params.id);
  const today = new Date().toISOString().slice(0, 10);
  const plan = db.prepare('SELECT * FROM plans WHERE id=? AND status=? AND available_from<=? AND available_to>=?').get(planId, 'Open', today, today);
  if (!plan) return fail(res, 'This plan is not currently available.', 404);
  const count = Math.max(plan.minimum_quantity, Number(req.body.quantity || plan.minimum_quantity));
  if (!Number.isInteger(count) || count > 1000) return fail(res, 'Enter a valid quantity.');
  const variant = req.body.variantId ? db.prepare('SELECT * FROM product_variants WHERE id=? AND product_id=?').get(Number(req.body.variantId), plan.product_id) : null;
  if (req.body.variantId && !variant) return fail(res, 'That product option is not available.');
  const now = new Date();
  const expiry = new Date(now);
  if (plan.billing_period === 'yearly') expiry.setFullYear(expiry.getFullYear() + 1);
  else if (plan.billing_period === 'monthly') expiry.setMonth(expiry.getMonth() + 1);
  else if (plan.billing_period === 'weekly') expiry.setDate(expiry.getDate() + 7);
  else expiry.setDate(expiry.getDate() + 1);
  const transaction = db.transaction(() => {
    const number = `SUB-${Date.now().toString().slice(-8)}`;
    const result = db.prepare('INSERT INTO subscriptions (customer_id,plan_id,number,start_date,expiry_date,payment_terms,status) VALUES (?,?,?,?,?,?,?)').run(req.customerId, plan.id, number, now.toISOString().slice(0, 10), expiry.toISOString().slice(0, 10), 'Due on receipt', 'Draft');
    const product = db.prepare('SELECT name FROM products WHERE id=?').get(plan.product_id);
    db.prepare('INSERT INTO subscription_lines (subscription_id,product,quantity,unit_price,tax_rate,discount_rate) VALUES (?,?,?,?,?,?)').run(result.lastInsertRowid, variant ? `${product.name} - ${variant.name}` : product.name, count, plan.price + (variant?.price_delta || 0), 0, 0);
    return Number(result.lastInsertRowid);
  });
  res.status(201).json({ message: 'Plan request submitted.', id: transaction() });
});

app.get('/api/customer/subscriptions', (req, res) => {
  const rows = db.prepare('SELECT s.*,p.name AS plan_name,p.allows_renewal,p.status AS plan_status,p.billing_period FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.customer_id=? ORDER BY s.start_date DESC').all(req.customerId);
  res.json(rows);
});

app.get('/api/customer/subscriptions/:id', (req, res) => {
  const subscription = ownSubscription(Number(req.params.id), req.customerId);
  if (!subscription) return fail(res, 'Subscription not found.', 404);
  const lines = db.prepare('SELECT * FROM subscription_lines WHERE subscription_id=?').all(subscription.id).map((line) => ({ ...line, amount: line.quantity * line.unit_price * (1 - line.discount_rate / 100) * (1 + line.tax_rate / 100) }));
  res.json({ ...subscription, lines, total: lines.reduce((sum,line) => sum + line.amount, 0) });
});

app.get('/api/customer/invoices', (req, res) => {
  const { status, from, to, search = '', page = '1', limit = '10' } = req.query;
  const pageNumber = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(limit) || 10));
  const predicates = ['customer_id=?'];
  const params = [req.customerId];
  if (status) { predicates.push('status=?'); params.push(String(status)); }
  if (from) { predicates.push('date>=?'); params.push(String(from)); }
  if (to) { predicates.push('date<=?'); params.push(String(to)); }
  if (search) { predicates.push('number LIKE ?'); params.push(`%${String(search).slice(0, 80)}%`); }
  const where = predicates.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS count FROM invoices WHERE ${where}`).get(...params).count;
  const rows = db.prepare(`SELECT * FROM invoices WHERE ${where} ORDER BY date DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (pageNumber - 1) * pageSize);
  res.json({ items: rows.map((invoice) => ({ ...invoice, ...invoiceWithLines(invoice) })), total, page: pageNumber, pages: Math.ceil(total / pageSize) });
});

app.get('/api/customer/invoices/:id', (req, res) => {
  const invoice = ownInvoice(Number(req.params.id), req.customerId);
  if (!invoice) return fail(res, 'Invoice not found.', 404);
  res.json(invoiceWithLines(invoice));
});

app.get('/api/customer/invoices/:id/pdf', (req, res) => {
  const invoice = ownInvoice(Number(req.params.id), req.customerId);
  if (!invoice) return fail(res, 'Invoice not found.', 404);
  const detail = invoiceWithLines(invoice);
  const profile = db.prepare('SELECT u.name,u.email,c.company,c.billing_address FROM customers c JOIN users u ON u.id=c.user_id WHERE c.id=?').get(req.customerId);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.number}.pdf"`);
  const pdf = new PDFDocument({ margin: 52 });
  pdf.pipe(res);
  pdf.fontSize(22).fillColor('#713de2').text('BRIGHTLOOP SOFTWARE');
  pdf.moveDown().fontSize(18).fillColor('#222').text('INVOICE');
  pdf.fontSize(10).text(`${invoice.number}   |   ${invoice.date}   |   Due ${invoice.due_date}`);
  pdf.moveDown().text(`${profile.name}\n${profile.company}\n${profile.billing_address}\n${profile.email}`);
  pdf.moveDown().fontSize(10).text('ITEM                                      QTY        UNIT       DISCOUNT        TAX         AMOUNT');
  detail.lines.forEach((line) => {
    const amount = line.quantity * line.unit_price * (1 - line.discount_rate / 100) * (1 + line.tax_rate / 100);
    pdf.moveDown(0.5).text(`${line.product.slice(0, 30).padEnd(34)} ${String(line.quantity).padStart(3)}   $${line.unit_price.toFixed(2)}     ${line.discount_rate}%       ${line.tax_rate}%      $${amount.toFixed(2)}`);
  });
  pdf.moveDown().text(`Subtotal: $${detail.subtotal.toFixed(2)}\nDiscount: -$${detail.discount.toFixed(2)}\nTax: $${detail.tax.toFixed(2)}\nTotal: $${detail.total.toFixed(2)}`, { align: 'right' });
  pdf.end();
});

app.get('/api/customer/payments', (req, res) => {
  const { from, to, method } = req.query;
  const predicates = ['p.customer_id=?'];
  const params = [req.customerId];
  if (from) { predicates.push('p.date>=?'); params.push(String(from)); }
  if (to) { predicates.push('p.date<=?'); params.push(String(to)); }
  if (method) { predicates.push('p.method=?'); params.push(String(method)); }
  const rows = db.prepare(`SELECT p.*,i.number AS invoice_number FROM payments p JOIN invoices i ON i.id=p.invoice_id AND i.customer_id=p.customer_id WHERE ${predicates.join(' AND ')} ORDER BY p.date DESC`).all(...params);
  const outstanding = db.prepare("SELECT i.id FROM invoices i WHERE i.customer_id=? AND i.status!='Paid'").all(req.customerId).reduce((sum, invoice) => {
    const data = db.prepare('SELECT * FROM invoices WHERE id=? AND customer_id=?').get(invoice.id, req.customerId);
    const paid = db.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE invoice_id=? AND customer_id=?').get(invoice.id, req.customerId).total;
    return sum + Math.max(0, invoiceWithLines(data).total - paid);
  }, 0);
  res.json({ items: rows, paidTotal: rows.reduce((sum, row) => sum + row.amount, 0), outstanding });
});

app.post('/api/customer/renewals', (req, res) => {
  const parsed = z.object({ subscriptionId: z.coerce.number().int().positive(), note: z.string().trim().max(1000).optional().default('') }).safeParse(req.body);
  if (!parsed.success) return fail(res, 'Choose a valid subscription.');
  const subscription = ownSubscription(parsed.data.subscriptionId, req.customerId);
  if (!subscription) return fail(res, 'Subscription not found.', 404);
  if (!subscription.allows_renewal || subscription.plan_status !== 'Open') return fail(res, 'This plan is closed or does not allow renewal.', 400);
  if (!['Active','Confirmed'].includes(subscription.status)) return fail(res, 'Only active subscriptions can be renewed.', 400);
  const result = db.prepare('INSERT INTO renewal_requests (customer_id,subscription_id,note) VALUES (?,?,?)').run(req.customerId, subscription.id, parsed.data.note);
  res.status(201).json({ message: 'Renewal request submitted.', id: Number(result.lastInsertRowid) });
});

app.get('/api/customer/renewals', (req, res) => {
  const rows = db.prepare('SELECT r.*,s.number AS subscription_number,p.name AS plan_name,s.expiry_date,p.allows_renewal,p.status AS plan_status FROM renewal_requests r JOIN subscriptions s ON s.id=r.subscription_id AND s.customer_id=r.customer_id JOIN plans p ON p.id=s.plan_id WHERE r.customer_id=? ORDER BY r.created_at DESC').all(req.customerId);
  const renewable = db.prepare("SELECT s.id,s.number,s.expiry_date,s.status,p.name AS plan_name,p.allows_renewal,p.status AS plan_status FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.customer_id=? AND s.status IN ('Active','Confirmed') ORDER BY s.expiry_date").all(req.customerId);
  res.json({ requests: rows, subscriptions: renewable });
});

app.post('/api/customer/support', (req, res) => {
  const parsed = z.object({ subject: z.string().trim().min(3).max(160), category: z.enum(['Billing','Subscription','Technical','Account','Other']), message: z.string().trim().min(10).max(5000) }).safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error.issues[0].message);
  const result = db.prepare('INSERT INTO support_tickets (customer_id,subject,category,message) VALUES (?,?,?,?)').run(req.customerId, parsed.data.subject, parsed.data.category, parsed.data.message);
  res.status(201).json({ message: 'Your support ticket was sent.', id: Number(result.lastInsertRowid) });
});

app.get('/api/customer/support', (req, res) => {
  res.json(db.prepare('SELECT id,subject,category,status,created_at FROM support_tickets WHERE customer_id=? ORDER BY created_at DESC').all(req.customerId));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});