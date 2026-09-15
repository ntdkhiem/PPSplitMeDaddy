import { redirect, type Handle } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import {
	deleteSessionCookie,
	purgeExpiredAuth,
	SESSION_COOKIE,
	setSessionCookie,
	validateSessionToken
} from '$lib/server/auth';
import { countMembers } from '$lib/server/services/members';
import { startRecurringScheduler } from '$lib/server/recurring';
import { building } from '$app/environment';

/** Routes reachable without a session. */
const PUBLIC_PREFIXES = ['/login', '/setup', '/invite/'];

if (!building && process.env.NODE_ENV !== 'test') {
	const db = getDb();
	startRecurringScheduler(db);
	const g = globalThis as typeof globalThis & { __ppSplitMeDaddyPurge?: NodeJS.Timeout };
	if (!g.__ppSplitMeDaddyPurge) {
		purgeExpiredAuth(db);
		g.__ppSplitMeDaddyPurge = setInterval(() => purgeExpiredAuth(db), 24 * 60 * 60 * 1000);
		g.__ppSplitMeDaddyPurge.unref();
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	const db = getDb();
	const path = event.url.pathname;
	event.locals.member = null;

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const session = validateSessionToken(db, token);
		if (session) {
			event.locals.member = session.member;
			setSessionCookie(event.cookies, token, session.expiresAt);
		} else {
			deleteSessionCookie(event.cookies);
		}
	}

	const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p));

	// First run: no members yet -> everyone goes to setup.
	if (countMembers(db) === 0) {
		if (path !== '/setup') redirect(303, '/setup');
	} else if (!event.locals.member && !isPublic) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(path + event.url.search)}`);
	}

	return resolve(event);
};
