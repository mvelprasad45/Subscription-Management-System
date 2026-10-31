import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const databasePath = path.join(os.tmpdir(), `brightloop-security-${process.pid}.sqlite`);
process.env.DATABASE_FILE = databasePath;
process.env.JWT_SECRET = 'test-secret-with-enough-entropy-123456789';
process.env.APP_URL = 'http://localhost:5173';

let app;
let db;
let firstToken;
let secondToken;
let firstCustomerId;
let secondCustomerId;
let secondSubscriptionId;
let secondInvoiceId;
let firstInvoiceId;
let firstTicketId;

before(async () => {
  ({ app } = await import('./app.js'));
  ({ db } = await import('./db.js'));
  const createCustomer = (name, email) => {
    const user = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)').run(name, email, bcrypt.hashSync('PassWord!123', 4), 'customer');
    const customer = db.prepare('INSERT INTO customers (user_id) VALUES (?)').run(user.lastInsertRowid);
    return { userId: Number(user.lastInsertRowid), customerId: Number(customer.lastInsertRowid) };
  };
  const first = createCustomer('First Customer', 'first@example.test');
  const second = createCustomer('Second Customer', 'second@example.test');
  firstCustomerId = first.customerId;
  secondCustomerId = second.customerId;
  firstToken = jwt.sign({ sub: first.userId, customerId: first.customerId, role: 'customer' }, process.env.JWT_SECRET);
  secondToken = jwt.sign({ sub: second.userId, customerId: second.customerId, role: 'customer' }, process.env.JWT_SECRET);
  const product = Number(db.prepare('INSERT INTO products (name) VALUES (?)').run('Test product').lastInsertRowid);
  const plan = Number(db.prepare('INSERT INTO plans (product_id,name,price,billing_period,available_from,available_to) VALUES (?,?,?,?,?,?)').run(product,'Test plan',100,'monthly','2020-01-01','2099-12-31').lastInsertRowid);
  const sub = db.prepare('INSERT INTO subscriptions (customer_id,plan_id,number,start_date,expiry_date,status) VALUES (?,?,?,?,?,?)');
  const firstSubscription = Number(sub.run(first.customerId,plan,'SUB-FIRST','2025-01-01','2026-01-01','Active').lastInsertRowid);
  secondSubscriptionId = Number(sub.run(second.customerId,plan,'SUB-SECOND','2025-01-01','2026-01-01','Active').lastInsertRowid);
  const invoice = db.prepare('INSERT INTO invoices (customer_id,subscription_id,number,date,due_date,status) VALUES (?,?,?,?,?,?)');
  firstInvoiceId = Number(invoice.run(first.customerId,firstSubscription,'INV-FIRST','2025-01-01','2025-02-01','Paid').lastInsertRowid);
  secondInvoiceId = Number(invoice.run(second.customerId,secondSubscriptionId,'INV-SECOND','2025-01-01','2025-02-01','Paid').lastInsertRowid);
  db.prepare('INSERT INTO invoice_lines (invoice_id,product,quantity,unit_price) VALUES (?,?,?,?)').run(firstInvoiceId,'Private item',1,100);
  db.prepare('INSERT INTO invoice_lines (invoice_id,product,quantity,unit_price) VALUES (?,?,?,?)').run(secondInvoiceId,'Other private item',1,999);
  db.prepare('INSERT INTO payments (customer_id,invoice_id,date,method,amount) VALUES (?,?,?,?,?)').run(first.customerId,firstInvoiceId,'2025-01-02','Card',100);
  db.prepare('INSERT INTO payments (customer_id,invoice_id,date,method,amount) VALUES (?,?,?,?,?)').run(second.customerId,secondInvoiceId,'2025-01-02','Card',999);
  db.prepare('INSERT INTO renewal_requests (customer_id,subscription_id,note) VALUES (?,?,?)').run(second.customerId,secondSubscriptionId,'Private renewal note');
  firstTicketId = Number(db.prepare('INSERT INTO support_tickets (customer_id,subject,category,message) VALUES (?,?,?,?)').run(first.customerId,'First ticket','Billing','My invoice is incorrect').lastInsertRowid);
  db.prepare('INSERT INTO support_tickets (customer_id,subject,category,message) VALUES (?,?,?,?)').run(second.customerId,'Second private ticket','Account','Do not reveal this ticket');
});

after(() => {
  db?.close();
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${databasePath}${suffix}`;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test('customer cannot access another customer subscription or invoice, including PDF', async () => {
  const subscription = await request(app).get(`/api/customer/subscriptions/${secondSubscriptionId}`).set('Authorization', `Bearer ${firstToken}`);
  const invoice = await request(app).get(`/api/customer/invoices/${secondInvoiceId}`).set('Authorization', `Bearer ${firstToken}`);
  const pdf = await request(app).get(`/api/customer/invoices/${secondInvoiceId}/pdf`).set('Authorization', `Bearer ${firstToken}`);
  assert.equal(subscription.status, 404);
  assert.equal(invoice.status, 404);
  assert.equal(pdf.status, 404);
});

test('list endpoints return only the authenticated customer data', async () => {
  const invoices = await request(app).get('/api/customer/invoices').set('Authorization', `Bearer ${firstToken}`);
  const payments = await request(app).get('/api/customer/payments').set('Authorization', `Bearer ${firstToken}`);
  const renewals = await request(app).get('/api/customer/renewals').set('Authorization', `Bearer ${firstToken}`);
  const tickets = await request(app).get('/api/customer/support').set('Authorization', `Bearer ${firstToken}`);
  assert.deepEqual(invoices.body.items.map((item) => item.number), ['INV-FIRST']);
  assert.deepEqual(payments.body.items.map((item) => item.invoice_number), ['INV-FIRST']);
  assert.equal(renewals.body.requests.length, 0);
  assert.deepEqual(tickets.body.map((item) => item.id), [firstTicketId]);
  assert.equal(invoices.body.items.some((item) => item.id === secondInvoiceId), false);
});

test('JWT customer ID cannot be overridden by request parameters and non-customer role is blocked', async () => {
  const response = await request(app).get(`/api/customer/subscriptions?customerId=${secondCustomerId}`).set('Authorization', `Bearer ${firstToken}`);
  assert.deepEqual(response.body.map((item) => item.number), ['SUB-FIRST']);
  const adminToken = jwt.sign({ sub: 500, customerId: secondCustomerId, role: 'admin' }, process.env.JWT_SECRET);
  const blocked = await request(app).get('/api/customer/profile').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(blocked.status, 403);
});