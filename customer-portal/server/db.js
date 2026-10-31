import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();
const root = path.dirname(fileURLToPath(import.meta.url));
const configuredPath = process.env.DATABASE_FILE || './data/brightloop.sqlite';
const databasePath = path.resolve(root, '..', configuredPath.replace(/^\.\//, ''));
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('admin','staff','customer')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '',
  billing_address TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES products(id),
  name TEXT NOT NULL, price_delta REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES products(id),
  name TEXT NOT NULL, price REAL NOT NULL, billing_period TEXT NOT NULL,
  minimum_quantity INTEGER NOT NULL DEFAULT 1, available_from TEXT NOT NULL, available_to TEXT NOT NULL,
  features TEXT NOT NULL DEFAULT '[]', allows_renewal INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'Open'
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL REFERENCES customers(id),
  plan_id INTEGER NOT NULL REFERENCES plans(id), number TEXT NOT NULL UNIQUE,
  start_date TEXT NOT NULL, expiry_date TEXT NOT NULL, payment_terms TEXT NOT NULL DEFAULT 'Due on receipt',
  status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS subscription_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT, subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  product TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, tax_rate REAL NOT NULL DEFAULT 0,
  discount_rate REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL REFERENCES customers(id),
  subscription_id INTEGER REFERENCES subscriptions(id), number TEXT NOT NULL UNIQUE, date TEXT NOT NULL,
  due_date TEXT NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS invoice_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL,
  tax_rate REAL NOT NULL DEFAULT 0, discount_rate REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL REFERENCES customers(id),
  invoice_id INTEGER NOT NULL REFERENCES invoices(id), date TEXT NOT NULL, method TEXT NOT NULL,
  amount REAL NOT NULL, note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS discounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, percentage REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS taxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, rate REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS renewal_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL REFERENCES customers(id),
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id), note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL REFERENCES customers(id),
  subject TEXT NOT NULL, category TEXT NOT NULL, message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_date ON invoices(customer_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_customer_date ON payments(customer_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_reset_token_hash ON password_reset_tokens(token_hash);
`);

export function invoiceTotal(invoiceId) {
  const rows = db.prepare('SELECT quantity, unit_price, tax_rate, discount_rate FROM invoice_lines WHERE invoice_id = ?').all(invoiceId);
  return rows.reduce((total, row) => {
    const net = row.quantity * row.unit_price * (1 - row.discount_rate / 100);
    return total + net * (1 + row.tax_rate / 100);
  }, 0);
}

export function invoiceWithLines(invoice) {
  const lines = db.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ?').all(invoice.id);
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
  const discount = lines.reduce((sum, line) => sum + line.quantity * line.unit_price * line.discount_rate / 100, 0);
  const tax = lines.reduce((sum, line) => sum + line.quantity * line.unit_price * (1 - line.discount_rate / 100) * line.tax_rate / 100, 0);
  return { ...invoice, lines, subtotal, discount, tax, total: subtotal - discount + tax };
}