import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import {
	acceptInvite,
	AuthError,
	createSession,
	getInviteMember,
	MIN_PASSWORD_LENGTH,
	setSessionCookie
} from '$lib/server/auth';

const schema = z
	.object({
		email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
		password: z
			.string()
			.min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
			.max(1024, 'Password is too long'),
		confirm: z.string()
	})
	.refine((v) => v.password === v.confirm, {
		path: ['confirm'],
		message: 'Passwords do not match'
	});

type Errors = Partial<Record<'email' | 'password' | 'confirm' | 'form', string>>;

export const load: PageServerLoad = async ({ params }) => {
	const member = await getInviteMember(getDb(), params.token);
	return {
		invite: member ? { name: member.name, email: member.email, hasLogin: member.hasLogin } : null
	};
};

export const actions: Actions = {
	default: async ({ params, request, cookies }) => {
		const db = getDb();
		const form = Object.fromEntries(await request.formData());
		const values = { email: String(form.email ?? '') };
		const errors: Errors = {};

		const parsed = schema.safeParse(form);
		if (!parsed.success) {
			for (const issue of parsed.error.issues) {
				const key = issue.path[0] as keyof Errors;
				errors[key] ??= issue.message;
			}
			return fail(400, { errors, values });
		}

		let memberId: string;
		try {
			const member = await acceptInvite(db, params.token, parsed.data);
			memberId = member.id;
		} catch (e) {
			if (e instanceof AuthError) {
				if (e.code === 'email_taken' || e.code === 'invalid_email') errors.email = e.message;
				else if (e.code === 'weak_password') errors.password = e.message;
				else errors.form = 'This invite link is invalid, expired or already used.';
				return fail(400, { errors, values });
			}
			throw e;
		}

		const session = await createSession(db, memberId);
		setSessionCookie(cookies, session.token, session.expiresAt);
		redirect(303, '/');
	}
};
