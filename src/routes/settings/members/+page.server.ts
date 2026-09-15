import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { getDb } from '$lib/server/db';
import { createInvite, invalidateMemberSessions } from '$lib/server/auth';
import {
	countActiveAdmins,
	createMember,
	getMember,
	getMemberByName,
	listMembers,
	updateMember
} from '$lib/server/services/members';

const nameSchema = z.string().trim().min(1, 'Name is required').max(60, 'Name is too long');
const idSchema = z.string().min(1);

function requireAdmin(event: RequestEvent) {
	const me = event.locals.member;
	if (!me) error(401, 'Not logged in');
	if (me.role !== 'admin') error(403, 'Only admins can manage members');
	return me;
}

async function readForm(request: Request) {
	return Object.fromEntries(await request.formData()) as Record<string, unknown>;
}

function loadTarget(id: unknown) {
	const parsed = idSchema.safeParse(id);
	const member = parsed.success ? getMember(getDb(), parsed.data) : undefined;
	if (!member) error(404, 'Member not found');
	return member;
}

export const load: PageServerLoad = ({ locals }) => {
	return {
		members: listMembers(getDb(), { includeInactive: true }),
		isAdmin: locals.member?.role === 'admin',
		meId: locals.member?.id ?? null
	};
};

export const actions: Actions = {
	add: async (event) => {
		requireAdmin(event);
		const form = await readForm(event.request);
		const parsed = nameSchema.safeParse(form.name);
		const values = { name: String(form.name ?? '') };
		if (!parsed.success) {
			return fail(400, { action: 'add', error: parsed.error.issues[0].message, values });
		}
		const db = getDb();
		if (getMemberByName(db, parsed.data)) {
			return fail(400, { action: 'add', error: 'A member with that name already exists', values });
		}
		createMember(db, { name: parsed.data });
		return { action: 'add', success: `Added ${parsed.data}` };
	},

	rename: async (event) => {
		requireAdmin(event);
		const form = await readForm(event.request);
		const target = loadTarget(form.id);
		const parsed = nameSchema.safeParse(form.name);
		if (!parsed.success) {
			return fail(400, {
				action: 'rename',
				memberId: target.id,
				error: parsed.error.issues[0].message
			});
		}
		const db = getDb();
		const existing = getMemberByName(db, parsed.data);
		if (existing && existing.id !== target.id) {
			return fail(400, {
				action: 'rename',
				memberId: target.id,
				error: 'A member with that name already exists'
			});
		}
		updateMember(db, target.id, { name: parsed.data });
		return { action: 'rename', memberId: target.id, success: 'Renamed' };
	},

	setActive: async (event) => {
		const me = requireAdmin(event);
		const form = await readForm(event.request);
		const target = loadTarget(form.id);
		const active = form.active === 'true';
		const db = getDb();
		if (!active) {
			if (target.id === me.id) {
				return fail(400, {
					action: 'setActive',
					memberId: target.id,
					error: "You can't deactivate yourself"
				});
			}
			if (target.role === 'admin' && target.active && countActiveAdmins(db) <= 1) {
				return fail(400, {
					action: 'setActive',
					memberId: target.id,
					error: "Can't deactivate the last active admin"
				});
			}
		}
		updateMember(db, target.id, { active });
		if (!active) invalidateMemberSessions(db, target.id);
		return {
			action: 'setActive',
			memberId: target.id,
			success: active ? 'Activated' : 'Deactivated'
		};
	},

	setRole: async (event) => {
		const me = requireAdmin(event);
		const form = await readForm(event.request);
		const target = loadTarget(form.id);
		const role = z.enum(['admin', 'member']).safeParse(form.role);
		if (!role.success) {
			return fail(400, { action: 'setRole', memberId: target.id, error: 'Invalid role' });
		}
		const db = getDb();
		if (role.data === 'member' && target.role === 'admin') {
			if (target.id === me.id) {
				return fail(400, {
					action: 'setRole',
					memberId: target.id,
					error: "You can't demote yourself"
				});
			}
			if (target.active && countActiveAdmins(db) <= 1) {
				return fail(400, {
					action: 'setRole',
					memberId: target.id,
					error: "Can't demote the last active admin"
				});
			}
		}
		updateMember(db, target.id, { role: role.data });
		return { action: 'setRole', memberId: target.id, success: 'Role updated' };
	},

	invite: async (event) => {
		requireAdmin(event);
		const form = await readForm(event.request);
		const target = loadTarget(form.id);
		if (!target.active) {
			return fail(400, {
				action: 'invite',
				memberId: target.id,
				error: 'Activate this member first'
			});
		}
		const token = createInvite(getDb(), target.id);
		return {
			action: 'invite',
			memberId: target.id,
			invite: {
				name: target.name,
				url: `${event.url.origin}/invite/${token}`,
				reset: target.passwordHash !== null
			}
		};
	}
};
