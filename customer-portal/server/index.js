import 'dotenv/config';
import { app } from './app.js';
import './db.js';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
	throw new Error('JWT_SECRET must be set in production.');
}

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.info(`Brightloop API listening on http://localhost:${port}`));