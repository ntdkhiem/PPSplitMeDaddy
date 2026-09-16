import { redirect, type Handle } from '@sveltejs/kit';
import { ensureMigrated, getDb } from '$lib/server/db';
import {
	deleteSessionCookie,
	SESSION_COOKIE,
	setSessionCookie,
	validateSessionToken
} from '$lib/server/auth';
import { countMembers } from '$lib/server/services/members';

/** Routes reachable without a session. `/api/cron` authenticates with CRON_SECRET instead. */
const PUBLIC_PREFIXES = ['/login', '/setup', '/invite/', '/healthz', '/api/cron'];

export const handle: Handle = async ({ event, resolve }) => {
	await ensureMigrated();
	const db = getDb();
	const path = event.url.pathname;
	event.locals.member = null;

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const session = await validateSessionToken(db, token);
		if (session) {
			event.locals.member = session.member;
			setSessionCookie(event.cookies, token, session.expiresAt);
		} else {
			deleteSessionCookie(event.cookies);
		}
	}

	const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p));

	// First run: no members yet -> everyone goes to setup (which 404s without the setup token).
	// Only checked when nobody is logged in: a valid session implies members exist.
	if (!event.locals.member && (await countMembers(db)) === 0) {
		if (path !== '/setup' && path !== '/healthz' && path !== '/api/cron') redirect(303, '/setup');
	} else if (!event.locals.member && !isPublic) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(path + event.url.search)}`);
	}

	return resolve(event);
};
