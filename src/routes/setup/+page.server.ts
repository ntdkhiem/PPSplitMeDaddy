import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { getDb, type DB } from '$lib/server/db';
import {
	createSession,
	hashPassword,
	MIN_PASSWORD_LENGTH,
	normalizeEmail,
	setSessionCookie
} from '$lib/server/auth';
import { countMembers, createMember } from '$lib/server/services/members';
import { isSetupAllowed } from '$lib/server/setup-token';

const schema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(60, 'Name is too long'),
	email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
	password: z
		.string()
		.min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
	others: z.string().max(2000).default('')
});

type Errors = Partial<Record<'name' | 'email' | 'password' | 'others' | 'form', string>>;

/** 404s unless the request carries `?token=<SETUP_TOKEN>` (see `isSetupAllowed`). */
function requireSetupToken(url: URL) {
	const production = process.env.NODE_ENV === 'production';
	if (!isSetupAllowed(url.searchParams.get('token'), process.env.SETUP_TOKEN, production)) {
		error(404, 'Not found');
	}
}

export const load: PageServerLoad = async ({ url }) => {
	if ((await countMembers(getDb())) > 0) redirect(303, '/login');
	requireSetupToken(url);
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const db = getDb();
		if ((await countMembers(db)) > 0) redirect(303, '/login');
		requireSetupToken(url);

		const form = Object.fromEntries(await request.formData());
		const values = {
			name: String(form.name ?? ''),
			email: String(form.email ?? ''),
			others: String(form.others ?? '')
		};
		const parsed = schema.safeParse(form);
		const errors: Errors = {};
		if (!parsed.success) {
			for (const issue of parsed.error.issues) {
				const key = issue.path[0] as keyof Errors;
				errors[key] ??= issue.message;
			}
			return fail(400, { errors, values });
		}

		const { name, email, password } = parsed.data;
		const others = parsed.data.others
			.split(/\r?\n/)
			.map((n) => n.trim())
			.filter(Boolean);
		const seen = new Set([name.toLowerCase()]);
		for (const other of others) {
			if (other.length > 60) {
				errors.others = `"${other.slice(0, 20)}…" is too long`;
				break;
			}
			if (seen.has(other.toLowerCase())) {
				errors.others = `Duplicate name: ${other}`;
				break;
			}
			seen.add(other.toLowerCase());
		}
		if (errors.others) return fail(400, { errors, values });

		const passwordHash = await hashPassword(password);
		let adminId: string;
		try {
			adminId = await db.transaction(async (tx) => {
				const t = tx as unknown as DB;
				if ((await countMembers(t)) > 0) throw new Error('already set up');
				const admin = await createMember(t, {
					name,
					email: normalizeEmail(email),
					passwordHash,
					role: 'admin'
				});
				for (const other of others) await createMember(t, { name: other });
				return admin.id;
			});
		} catch {
			// Someone else finished setup concurrently.
			redirect(303, '/login');
		}

		const session = await createSession(db, adminId);
		setSessionCookie(cookies, session.token, session.expiresAt);
		redirect(303, '/');
	}
};
