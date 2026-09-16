import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

/** Liveness check for uptime monitors: 200 when the function and database respond. */
export const GET: RequestHandler = async () => {
	await getDb().run(sql`SELECT 1`);
	return new Response('ok', { headers: { 'cache-control': 'no-store' } });
};
