import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createTestDb, type DB } from './db';
import { invites, sessions } from './db/schema';
import { createMember, updateMember } from './services/members';
import {
	acceptInvite,
	AuthError,
	createInvite,
	createSession,
	getInviteMember,
	hashPassword,
	invalidateMemberSessions,
	invalidateSession,
	purgeExpiredAuth,
	SESSION_TTL_MS,
	validateSessionToken,
	verifyPassword
} from './auth';

const sha = (t: string) => createHash('sha256').update(t).digest('hex');

async function memberWithLogin(db: DB, name = 'Alice') {
	return createMember(db, {
		name,
		email: `${name.toLowerCase()}@example.com`,
		passwordHash: await hashPassword('password123')
	});
}

describe('passwords', () => {
	it('hashes and verifies', async () => {
		const h = await hashPassword('correct horse');
		expect(h).toMatch(/^\$argon2id\$/);
		expect(await verifyPassword(h, 'correct horse')).toBe(true);
		expect(await verifyPassword(h, 'wrong horse')).toBe(false);
		expect(await verifyPassword('garbage', 'x')).toBe(false);
	});
});

describe('sessions', () => {
	it('creates and validates, storing only the token hash', async () => {
		const db = createTestDb();
		const m = await memberWithLogin(db);
		const { token, expiresAt } = createSession(db, m.id);
		expect(Buffer.from(token, 'base64url')).toHaveLength(32);
		const row = db.select().from(sessions).get()!;
		expect(row.id).toBe(sha(token));
		const v = validateSessionToken(db, token)!;
		expect(v.member.id).toBe(m.id);
		expect(v.member).not.toHaveProperty('passwordHash');
		expect(v.expiresAt.getTime()).toBe(expiresAt.getTime());
		expect(validateSessionToken(db, 'nope')).toBeNull();
	});

	it('deletes expired sessions', async () => {
		const db = createTestDb();
		const m = await memberWithLogin(db);
		const { token } = createSession(db, m.id);
		db.update(sessions)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.run();
		expect(validateSessionToken(db, token)).toBeNull();
		expect(db.select().from(sessions).all()).toHaveLength(0);
	});

	it('slides expiry when under half the TTL remains', async () => {
		const db = createTestDb();
		const m = await memberWithLogin(db);
		const { token } = createSession(db, m.id);
		const near = new Date(Date.now() + SESSION_TTL_MS / 2 - 60_000);
		db.update(sessions).set({ expiresAt: near }).run();
		const v = validateSessionToken(db, token)!;
		expect(v.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 60_000);
		expect(db.select().from(sessions).get()!.expiresAt.getTime()).toBe(v.expiresAt.getTime());

		// More than half remaining: unchanged.
		const far = new Date(Date.now() + SESSION_TTL_MS / 2 + 60_000);
		db.update(sessions).set({ expiresAt: far }).run();
		expect(validateSessionToken(db, token)!.expiresAt.getTime()).toBe(far.getTime());
	});

	it('invalidates one session or all of a member', async () => {
		const db = createTestDb();
		const m = await memberWithLogin(db);
		const a = createSession(db, m.id);
		const b = createSession(db, m.id);
		invalidateSession(db, a.token);
		expect(validateSessionToken(db, a.token)).toBeNull();
		expect(validateSessionToken(db, b.token)).not.toBeNull();
		invalidateMemberSessions(db, m.id);
		expect(validateSessionToken(db, b.token)).toBeNull();
	});

	it('rejects inactive members and members without a login', async () => {
		const db = createTestDb();
		const m = await memberWithLogin(db);
		const { token } = createSession(db, m.id);
		updateMember(db, m.id, { active: false });
		expect(validateSessionToken(db, token)).toBeNull();
		updateMember(db, m.id, { active: true, passwordHash: null });
		expect(validateSessionToken(db, token)).toBeNull();
	});
});

describe('invites', () => {
	it('accepts a valid invite once', async () => {
		const db = createTestDb();
		const m = createMember(db, { name: 'Bob' });
		const token = createInvite(db, m.id);
		expect(db.select().from(invites).get()!.id).toBe(sha(token));
		expect(getInviteMember(db, token)?.id).toBe(m.id);
		expect(getInviteMember(db, token)?.id).toBe(m.id); // not consumed

		const view = await acceptInvite(db, token, {
			email: ' Bob@Example.com ',
			password: 'hunter2hunter2'
		});
		expect(view.email).toBe('bob@example.com');
		expect(view.hasLogin).toBe(true);
		expect(getInviteMember(db, token)).toBeNull();
		await expect(
			acceptInvite(db, token, { email: 'bob@example.com', password: 'another-pass' })
		).rejects.toMatchObject({ code: 'invalid_invite' });

		const { token: s } = createSession(db, m.id);
		expect(validateSessionToken(db, s)?.member.id).toBe(m.id);
	});

	it('rejects expired invites', async () => {
		const db = createTestDb();
		const m = createMember(db, { name: 'Bob' });
		const token = createInvite(db, m.id);
		db.update(invites)
			.set({ expiresAt: new Date(Date.now() - 1) })
			.where(eq(invites.memberId, m.id))
			.run();
		expect(getInviteMember(db, token)).toBeNull();
		await expect(
			acceptInvite(db, token, { email: 'bob@example.com', password: 'password123' })
		).rejects.toBeInstanceOf(AuthError);
	});

	it('rejects taken emails and short passwords without consuming the invite', async () => {
		const db = createTestDb();
		await memberWithLogin(db, 'Alice');
		const m = createMember(db, { name: 'Bob' });
		const token = createInvite(db, m.id);
		await expect(
			acceptInvite(db, token, { email: 'ALICE@example.com', password: 'password123' })
		).rejects.toMatchObject({ code: 'email_taken' });
		await expect(
			acceptInvite(db, token, { email: 'bob@example.com', password: 'short' })
		).rejects.toMatchObject({ code: 'weak_password' });
		expect(getInviteMember(db, token)?.id).toBe(m.id);
	});

	it('revokes older unused invites and resets sessions on accept', async () => {
		const db = createTestDb();
		const m = await memberWithLogin(db, 'Carol');
		const { token: session } = createSession(db, m.id);
		const first = createInvite(db, m.id);
		const second = createInvite(db, m.id);
		expect(getInviteMember(db, first)).toBeNull();
		await acceptInvite(db, second, { email: 'carol@example.com', password: 'newpassword' });
		expect(validateSessionToken(db, session)).toBeNull();
	});
});

describe('purgeExpiredAuth', () => {
	it('removes expired sessions and used/expired invites only', async () => {
		const { createTestDb } = await import('./db');
		const { createMember } = await import('./services/members');
		const { sessions: s, invites: inv } = await import('./db/schema');
		const db = createTestDb();
		const m = createMember(db, { name: 'P', passwordHash: 'x' });
		createSession(db, m.id);
		db.insert(s)
			.values({ id: 'old', memberId: m.id, expiresAt: new Date(Date.now() - 1000) })
			.run();
		createInvite(db, m.id);
		db.insert(inv)
			.values({
				id: 'used',
				memberId: m.id,
				expiresAt: new Date(Date.now() + 1e6),
				usedAt: new Date()
			})
			.run();
		expect(purgeExpiredAuth(db)).toBe(2);
		expect(db.select().from(s).all()).toHaveLength(1);
		expect(db.select().from(inv).all()).toHaveLength(1);
	});
});
