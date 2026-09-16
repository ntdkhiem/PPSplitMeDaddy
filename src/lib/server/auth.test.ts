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
		const db = await createTestDb();
		const m = await memberWithLogin(db);
		const { token, expiresAt } = await createSession(db, m.id);
		expect(Buffer.from(token, 'base64url')).toHaveLength(32);
		const row = (await db.select().from(sessions).get())!;
		expect(row.id).toBe(sha(token));
		const v = (await validateSessionToken(db, token))!;
		expect(v.member.id).toBe(m.id);
		expect(v.member).not.toHaveProperty('passwordHash');
		expect(v.expiresAt.getTime()).toBe(expiresAt.getTime());
		expect(await validateSessionToken(db, 'nope')).toBeNull();
	});

	it('deletes expired sessions', async () => {
		const db = await createTestDb();
		const m = await memberWithLogin(db);
		const { token } = await createSession(db, m.id);
		await db
			.update(sessions)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.run();
		expect(await validateSessionToken(db, token)).toBeNull();
		expect(await db.select().from(sessions).all()).toHaveLength(0);
	});

	it('slides expiry when under half the TTL remains', async () => {
		const db = await createTestDb();
		const m = await memberWithLogin(db);
		const { token } = await createSession(db, m.id);
		const near = new Date(Date.now() + SESSION_TTL_MS / 2 - 60_000);
		await db.update(sessions).set({ expiresAt: near }).run();
		const v = (await validateSessionToken(db, token))!;
		expect(v.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 60_000);
		expect((await db.select().from(sessions).get())!.expiresAt.getTime()).toBe(
			v.expiresAt.getTime()
		);

		// More than half remaining: unchanged.
		const far = new Date(Date.now() + SESSION_TTL_MS / 2 + 60_000);
		await db.update(sessions).set({ expiresAt: far }).run();
		expect((await validateSessionToken(db, token))!.expiresAt.getTime()).toBe(far.getTime());
	});

	it('invalidates one session or all of a member', async () => {
		const db = await createTestDb();
		const m = await memberWithLogin(db);
		const a = await createSession(db, m.id);
		const b = await createSession(db, m.id);
		await invalidateSession(db, a.token);
		expect(await validateSessionToken(db, a.token)).toBeNull();
		expect(await validateSessionToken(db, b.token)).not.toBeNull();
		await invalidateMemberSessions(db, m.id);
		expect(await validateSessionToken(db, b.token)).toBeNull();
	});

	it('rejects inactive members and members without a login', async () => {
		const db = await createTestDb();
		const m = await memberWithLogin(db);
		const { token } = await createSession(db, m.id);
		await updateMember(db, m.id, { active: false });
		expect(await validateSessionToken(db, token)).toBeNull();
		await updateMember(db, m.id, { active: true, passwordHash: null });
		expect(await validateSessionToken(db, token)).toBeNull();
	});
});

describe('invites', () => {
	it('accepts a valid invite once', async () => {
		const db = await createTestDb();
		const m = await createMember(db, { name: 'Bob' });
		const token = await createInvite(db, m.id);
		expect((await db.select().from(invites).get())!.id).toBe(sha(token));
		expect((await getInviteMember(db, token))?.id).toBe(m.id);
		expect((await getInviteMember(db, token))?.id).toBe(m.id); // not consumed

		const view = await acceptInvite(db, token, {
			email: ' Bob@Example.com ',
			password: 'hunter2hunter2'
		});
		expect(view.email).toBe('bob@example.com');
		expect(view.hasLogin).toBe(true);
		expect(await getInviteMember(db, token)).toBeNull();
		await expect(
			acceptInvite(db, token, { email: 'bob@example.com', password: 'another-pass' })
		).rejects.toMatchObject({ code: 'invalid_invite' });

		const { token: s } = await createSession(db, m.id);
		expect((await validateSessionToken(db, s))?.member.id).toBe(m.id);
	});

	it('rejects expired invites', async () => {
		const db = await createTestDb();
		const m = await createMember(db, { name: 'Bob' });
		const token = await createInvite(db, m.id);
		await db
			.update(invites)
			.set({ expiresAt: new Date(Date.now() - 1) })
			.where(eq(invites.memberId, m.id))
			.run();
		expect(await getInviteMember(db, token)).toBeNull();
		await expect(
			acceptInvite(db, token, { email: 'bob@example.com', password: 'password123' })
		).rejects.toBeInstanceOf(AuthError);
	});

	it('rejects taken emails and short passwords without consuming the invite', async () => {
		const db = await createTestDb();
		await memberWithLogin(db, 'Alice');
		const m = await createMember(db, { name: 'Bob' });
		const token = await createInvite(db, m.id);
		await expect(
			acceptInvite(db, token, { email: 'ALICE@example.com', password: 'password123' })
		).rejects.toMatchObject({ code: 'email_taken' });
		await expect(
			acceptInvite(db, token, { email: 'bob@example.com', password: 'short' })
		).rejects.toMatchObject({ code: 'weak_password' });
		expect((await getInviteMember(db, token))?.id).toBe(m.id);
	});

	it('revokes older unused invites and resets sessions on accept', async () => {
		const db = await createTestDb();
		const m = await memberWithLogin(db, 'Carol');
		const { token: session } = await createSession(db, m.id);
		const first = await createInvite(db, m.id);
		const second = await createInvite(db, m.id);
		expect(await getInviteMember(db, first)).toBeNull();
		await acceptInvite(db, second, { email: 'carol@example.com', password: 'newpassword' });
		expect(await validateSessionToken(db, session)).toBeNull();
	});
});

describe('purgeExpiredAuth', () => {
	it('removes expired sessions and used/expired invites only', async () => {
		const { createTestDb } = await import('./db');
		const { createMember } = await import('./services/members');
		const { sessions: s, invites: inv } = await import('./db/schema');
		const db = await createTestDb();
		const m = await createMember(db, { name: 'P', passwordHash: 'x' });
		await createSession(db, m.id);
		await db
			.insert(s)
			.values({ id: 'old', memberId: m.id, expiresAt: new Date(Date.now() - 1000) })
			.run();
		await createInvite(db, m.id);
		await db
			.insert(inv)
			.values({
				id: 'used',
				memberId: m.id,
				expiresAt: new Date(Date.now() + 1e6),
				usedAt: new Date()
			})
			.run();
		expect(await purgeExpiredAuth(db)).toBe(2);
		expect(await db.select().from(s).all()).toHaveLength(1);
		expect(await db.select().from(inv).all()).toHaveLength(1);
	});
});
