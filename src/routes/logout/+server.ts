import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { deleteSessionCookie, invalidateSession, SESSION_COOKIE } from '$lib/server/auth';

/** POST-only: logging out via a GET link would allow CSRF logouts. */
export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	if (token) await invalidateSession(getDb(), token);
	deleteSessionCookie(cookies);
	redirect(303, '/login');
};
