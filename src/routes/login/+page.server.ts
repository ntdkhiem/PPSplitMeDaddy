import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import {
	createSession,
	getDummyHash,
	normalizeEmail,
	setSessionCookie,
	verifyPassword
} from '$lib/server/auth';
import { getMemberByEmail } from '$lib/server/services/members';

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
/** key "email|ip" -> failure timestamps (in-memory; resets on restart). */
const failures = new Map<string, number[]>();

function recentFailures(key: string, now: number): number[] {
	const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
	if (list.length) failures.set(key, list);
	else failures.delete(key);
	return list;
}

function recordFailure(key: string, now: number) {
	failures.set(key, [...recentFailures(key, now), now]);
	// Opportunistic cleanup so the map can't grow without bound.
	if (failures.size > 5000) {
		for (const k of failures.keys()) recentFailures(k, now);
	}
}

/** Only allow same-origin relative paths like "/expenses?x=1". */
function safeRedirect(target: string | null): string {
	// Browsers treat "/\evil.com" like "//evil.com", so reject backslashes too.
	if (!target || !target.startsWith('/') || target.startsWith('//') || target.includes('\\')) {
		return '/';
	}
	return target;
}

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.member) redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const email = normalizeEmail(String(form.get('email') ?? ''));
		const password = String(form.get('password') ?? '');
		const values = { email };

		const now = Date.now();
		const key = `${email}|${getClientAddress()}`;
		if (recentFailures(key, now).length >= MAX_FAILURES) {
			return fail(429, {
				error: 'Too many failed attempts. Try again in 15 minutes.',
				values
			});
		}

		const invalid = () => {
			recordFailure(key, now);
			return fail(400, { error: 'Invalid email or password', values });
		};
		if (!email || !password || password.length > 1024) return invalid();

		const db = getDb();
		const member = getMemberByEmail(db, email);
		if (!member || !member.passwordHash || !member.active) {
			// Burn comparable time so unknown emails aren't distinguishable by timing.
			await verifyPassword(await getDummyHash(), password);
			return invalid();
		}
		if (!(await verifyPassword(member.passwordHash, password))) return invalid();

		failures.delete(key);
		const session = createSession(db, member.id);
		setSessionCookie(cookies, session.token, session.expiresAt);
		redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
	}
};
