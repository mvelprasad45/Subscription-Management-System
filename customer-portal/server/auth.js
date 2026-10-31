import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from './db.js';

export const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'brightloop-local-development-secret-change-before-deploy');

export const passwordSchema = z.string()
  .min(9, 'Password must be more than 8 characters')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[^A-Za-z0-9]/, 'Password must include a special character');

export function createToken(user, customerId) {
  return jwt.sign({ sub: user.id, customerId, role: user.role }, jwtSecret, { expiresIn: '12h' });
}

export function requireCustomer(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
  try {
    const claims = jwt.verify(token, jwtSecret);
    if (claims.role !== 'customer' || !Number.isInteger(claims.customerId)) {
      return res.status(403).json({ error: 'Customer access is required.' });
    }
    req.userId = Number(claims.sub);
    req.customerId = claims.customerId;
    next();
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}

export function customerForUser(userId) {
  return db.prepare('SELECT id FROM customers WHERE user_id = ?').get(userId)?.id;
}