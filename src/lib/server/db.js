import mysql from 'mysql2/promise';
import { env } from '$env/dynamic/private';

// One pool for the whole app: Better Auth and your own queries (db.execute('SELECT ...', [params]))
export const db = mysql.createPool({ uri: env.DATABASE_URL });
