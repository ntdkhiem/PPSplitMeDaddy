import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { purgeExpiredAuth } from '$lib/server/auth';
import { isCronAuthorized } from '$lib/server/cron';
import { generateDueExpenses } from '$lib/server/recurring';

/**
 * Daily job (Vercel Cron, see vercel.json): creates due recurring expenses and purges expired
 * sessions/invites. Vercel sends `Authorization: Bearer $CRON_SECRET`. Also keeps the Turso free-tier
 * database from being archived for inactivity.
 */
export const GET: RequestHandler = async ({ request }) => {
	if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
		error(401, 'Unauthorized');
	}
	const db = getDb();
	const created = await generateDueExpenses(db);
	const purged = await purgeExpiredAuth(db);
	return json({ created, purged });
};
