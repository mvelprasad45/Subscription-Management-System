import bcrypt from 'bcryptjs';
import { db } from './db.js';

const existing = db.prepare('SELECT id FROM users WHERE email=?').get('demo@brightloop.com');
if (existing) {
  console.info('Demo customer already seeded.');
  process.exit(0);
}

const today = new Date();
const date = (offsetDays) => {
  const value = new Date(today);
  value.setDate(value.getDate() + offsetDays);
  return value.toISOString().slice(0, 10);
};
const month = (offset) => {
  const value = new Date(today.getFullYear(), today.getMonth() + offset, 12);
  return value.toISOString().slice(0, 10);
};
const seed = db.transaction(() => {
  const user = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)').run('Alex Morgan', 'demo@brightloop.com', bcrypt.hashSync('DemoPass!123', 12), 'customer');
  const customer = db.prepare('INSERT INTO customers (user_id,phone,company,billing_address) VALUES (?,?,?,?)').run(user.lastInsertRowid, '+1 (415) 555-0132', 'Northstar Studio', '421 Market Street, San Francisco, CA 94105');
  db.prepare('INSERT INTO products (name,description) VALUES (?,?)').run('Brightloop Business Suite', 'A connected toolkit for growing teams.');
  const productId = Number(db.prepare('SELECT id FROM products WHERE name=?').get('Brightloop Business Suite').id);
  db.prepare('INSERT INTO product_variants (product_id,name,price_delta) VALUES (?,?,?)').run(productId, 'Odoo', 560);
  db.prepare('INSERT INTO product_variants (product_id,name,price_delta) VALUES (?,?,?)').run(productId, 'Standard', 0);
  const plan = db.prepare('INSERT INTO plans (product_id,name,price,billing_period,minimum_quantity,available_from,available_to,features,allows_renewal,status) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const planIds = [
    Number(plan.run(productId,'Growth Annual',1290,'yearly',1,date(-365),date(365),JSON.stringify(['Unlimited projects','Priority support','Advanced analytics']),1,'Open').lastInsertRowid),
    Number(plan.run(productId,'Team Monthly',149,'monthly',3,date(-365),date(365),JSON.stringify(['Team collaboration','Usage insights','Email support']),1,'Open').lastInsertRowid),
    Number(plan.run(productId,'Launch Weekly',45,'weekly',1,date(-365),date(365),JSON.stringify(['Core workspace','Community access']),0,'Closed').lastInsertRowid),
  ];
  const sub = db.prepare('INSERT INTO subscriptions (customer_id,plan_id,number,start_date,expiry_date,payment_terms,status) VALUES (?,?,?,?,?,?,?)');
  const sub1 = Number(sub.run(customer.lastInsertRowid,planIds[0],'SUB-2025-0182',date(-230),date(135),'Net 30','Active').lastInsertRowid);
  const sub2 = Number(sub.run(customer.lastInsertRowid,planIds[1],'SUB-2025-0264',date(-60),date(30),'Due on receipt','Confirmed').lastInsertRowid);
  const subLine = db.prepare('INSERT INTO subscription_lines (subscription_id,product,quantity,unit_price,tax_rate,discount_rate) VALUES (?,?,?,?,?,?)');
  subLine.run(sub1,'Brightloop Business Suite - Odoo',1,1850,8,10);
  subLine.run(sub2,'Brightloop Business Suite',3,149,8,0);
  const invoice = db.prepare('INSERT INTO invoices (customer_id,subscription_id,number,date,due_date,status,note) VALUES (?,?,?,?,?,?,?)');
  const invoiceIds = [];
  const records = [
    ['INV-2025-001',date(-150),date(-120),'Paid',sub1],
    ['INV-2025-002',date(-110),date(-80),'Paid',sub1],
    ['INV-2025-003',date(-65),date(-35),'Paid',sub2],
    ['INV-2025-004',date(-30),date(-10),'Overdue',sub1],
    ['INV-2025-005',date(-4),date(26),'Confirmed',sub2],
  ];
  for (const [number, issued, due, status, subscriptionId] of records) invoiceIds.push(Number(invoice.run(customer.lastInsertRowid,subscriptionId,number,issued,due,status,'Thank you for choosing Brightloop.').lastInsertRowid));
  const line = db.prepare('INSERT INTO invoice_lines (invoice_id,product,quantity,unit_price,tax_rate,discount_rate) VALUES (?,?,?,?,?,?)');
  line.run(invoiceIds[0],'Business Suite annual license',1,1850,8,10);
  line.run(invoiceIds[1],'Business Suite annual license',1,1850,8,10);
  line.run(invoiceIds[2],'Team monthly seats',3,149,8,0);
  line.run(invoiceIds[3],'Business Suite annual license',1,1850,8,10);
  line.run(invoiceIds[4],'Team monthly seats',3,149,8,5);
  const payment = db.prepare('INSERT INTO payments (customer_id,invoice_id,date,method,amount,note) VALUES (?,?,?,?,?,?)');
  payment.run(customer.lastInsertRowid,invoiceIds[0],date(-148),'Card',1798.20,'Visa ending in 4242');
  payment.run(customer.lastInsertRowid,invoiceIds[1],date(-108),'Bank transfer',1798.20,'ACH transfer');
  payment.run(customer.lastInsertRowid,invoiceIds[2],date(-63),'Card',483.76,'Visa ending in 4242');
  payment.run(customer.lastInsertRowid,invoiceIds[4],date(-2),'Card',100.00,'Partial payment');
  db.prepare('INSERT INTO discounts (name,percentage) VALUES (?,?)').run('Loyalty discount',10);
  db.prepare('INSERT INTO taxes (name,rate) VALUES (?,?)').run('Sales tax',8);
  db.prepare('INSERT INTO support_tickets (customer_id,subject,category,message,status) VALUES (?,?,?,?,?)').run(customer.lastInsertRowid,'Question about my renewal','Subscription','Could you confirm the renewal date for my annual plan?','In progress');
});

seed();
console.info('Demo data created. Login: demo@brightloop.com / DemoPass!123');