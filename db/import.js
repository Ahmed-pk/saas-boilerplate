// npm run db:import: creates the database from DATABASE_URL if needed, then runs schema.sql.
// Safe to re-run: existing tables are left untouched.
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';

if (!process.env.DATABASE_URL) {
	console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
	process.exit(1);
}

// Connect without the database name, since it may not exist yet
const url = new URL(process.env.DATABASE_URL);
const database = decodeURIComponent(url.pathname.slice(1));
url.pathname = '/';

const db = await mysql.createConnection({ uri: url.href, multipleStatements: true });

try {
	await db.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
	await db.changeUser({ database });
	await db.query(await readFile(new URL('schema.sql', import.meta.url), 'utf8'));
	console.log(`Imported db/schema.sql into "${database}"`);
} finally {
	await db.end();
}
