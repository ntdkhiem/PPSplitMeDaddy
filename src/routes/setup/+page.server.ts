import { fail, redirect } from '@sveltejs/kit';
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

const schema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(60, 'Name is too long'),
	email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
	password: z
		.string()
		.min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
	others: z.string().max(2000).default('')
});

type Errors = Partial<Record<'name' | 'email' | 'password' | 'others' | 'form', string>>;

export const load: PageServerLoad = () => {
	if (countMembers(getDb()) > 0) redirect(303, '/login');
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const db = getDb();
		if (countMembers(db) > 0) redirect(303, '/login');

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
			adminId = db.transaction((tx) => {
				const t = tx as unknown as DB;
				if (countMembers(t) > 0) throw new Error('already set up');
				const admin = createMember(t, {
					name,
					email: normalizeEmail(email),
					passwordHash,
					role: 'admin'
				});
				for (const other of others) createMember(t, { name: other });
				return admin.id;
			});
		} catch {
			// Someone else finished setup concurrently.
			redirect(303, '/login');
		}

		const session = createSession(db, adminId);
		setSessionCookie(cookies, session.token, session.expiresAt);
		redirect(303, '/');
	}
};
