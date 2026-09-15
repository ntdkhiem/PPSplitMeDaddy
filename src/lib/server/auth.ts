import type { Cookies } from '@sveltejs/kit';
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { dev } from '$app/environment';
import type { DB } from './db';
import { invites, members, sessions } from './db/schema';
import { toView, type MemberView } from './services/members';

export const SESSION_COOKIE = 'ppsmd_session';
/** 30 days; renewed when less than 15 days remain. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

export type AuthErrorCode = 'invalid_invite' | 'email_taken' | 'invalid_email' | 'weak_password';

/** Thrown by auth functions for expected, user-facing failures. */
export class AuthError extends Error {
	constructor(
		public code: AuthErrorCode,
		message: string
	) {
		super(message);
		this.name = 'AuthError';
	}
}

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function generateToken(): string {
	return randomBytes(32).toString('base64url');
}

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** argon2id hash via @node-rs/argon2. */
export async function hashPassword(password: string): Promise<string> {
	// @node-rs/argon2 defaults to argon2id.
	return hash(password);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
	try {
		return await verify(hash, password);
	} catch {
		return false;
	}
}

let dummyHash: Promise<string> | undefined;
/** A throwaway hash used to equalize login timing when the email is unknown. */
export function getDummyHash(): Promise<string> {
	dummyHash ??= hashPassword(generateToken());
	return dummyHash;
}

/** Random 32-byte token (base64url); stores sha256(token) as the session id. */
export function createSession(db: DB, memberId: string): { token: string; expiresAt: Date } {
	const token = generateToken();
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
	db.insert(sessions)
		.values({ id: hashToken(token), memberId, expiresAt })
		.run();
	return { token, expiresAt };
}

/**
 * Looks up the session by sha256(token). Returns null if missing, expired (and deletes it),
 * or the member is inactive/has no login. Extends expiry (sliding) when under half the TTL remains.
 */
export function validateSessionToken(
	db: DB,
	token: string
): { member: MemberView; expiresAt: Date } | null {
	if (!token) return null;
	const id = hashToken(token);
	const row = db
		.select({ session: sessions, member: members })
		.from(sessions)
		.innerJoin(members, eq(sessions.memberId, members.id))
		.where(eq(sessions.id, id))
		.get();
	if (!row) return null;

	const now = Date.now();
	if (row.session.expiresAt.getTime() <= now) {
		db.delete(sessions).where(eq(sessions.id, id)).run();
		return null;
	}
	if (!row.member.active || row.member.passwordHash === null) return null;

	let expiresAt = row.session.expiresAt;
	if (expiresAt.getTime() - now < SESSION_TTL_MS / 2) {
		expiresAt = new Date(now + SESSION_TTL_MS);
		db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id)).run();
	}
	return { member: toView(row.member), expiresAt };
}

export function invalidateSession(db: DB, token: string): void {
	db.delete(sessions)
		.where(eq(sessions.id, hashToken(token)))
		.run();
}

export function invalidateMemberSessions(db: DB, memberId: string): void {
	db.delete(sessions).where(eq(sessions.memberId, memberId)).run();
}

/**
 * Secure cookies in production. Set COOKIE_SECURE=false only when serving over plain HTTP
 * (e.g. a home server on the LAN without TLS); browsers drop Secure cookies on non-localhost http.
 */
const secureCookies = () => !dev && process.env.COOKIE_SECURE !== 'false';

/** httpOnly, sameSite=lax, path=/, secure (see secureCookies). */
export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date): void {
	cookies.set(SESSION_COOKIE, token, {
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
		secure: secureCookies(),
		expires: expiresAt
	});
}

export function deleteSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, {
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
		secure: secureCookies()
	});
}

/**
 * Creates a one-time invite for an existing member; returns the raw token for the link /invite/<token>.
 * Any earlier unused invites for the member are revoked, so only the newest link works.
 */
export function createInvite(db: DB, memberId: string): string {
	const token = generateToken();
	db.transaction((tx) => {
		tx.delete(invites)
			.where(and(eq(invites.memberId, memberId), isNull(invites.usedAt)))
			.run();
		tx.insert(invites)
			.values({ id: hashToken(token), memberId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) })
			.run();
	});
	return token;
}

function findValidInvite(db: DB, token: string) {
	if (!token) return undefined;
	return db
		.select({ invite: invites, member: members })
		.from(invites)
		.innerJoin(members, eq(invites.memberId, members.id))
		.where(
			and(
				eq(invites.id, hashToken(token)),
				isNull(invites.usedAt),
				gt(invites.expiresAt, new Date())
			)
		)
		.get();
}

/** Returns the member for a valid, unused, unexpired invite token, else null. Does not consume. */
export function getInviteMember(db: DB, token: string): MemberView | null {
	const row = findValidInvite(db, token);
	return row ? toView(row.member) : null;
}

/** Sets email + password for the invite's member, marks invite used. Throws on invalid invite. */
export async function acceptInvite(
	db: DB,
	token: string,
	input: { email: string; password: string }
): Promise<MemberView> {
	const email = normalizeEmail(input.email);
	if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new AuthError('invalid_email', 'Enter a valid email');
	if (input.password.length < MIN_PASSWORD_LENGTH) {
		throw new AuthError(
			'weak_password',
			`Password must be at least ${MIN_PASSWORD_LENGTH} characters`
		);
	}
	if (!findValidInvite(db, token))
		throw new AuthError('invalid_invite', 'Invalid or expired invite');

	// Hash outside the (synchronous) transaction, then re-check everything inside it.
	const passwordHash = await hashPassword(input.password);
	return db.transaction((tx) => {
		const row = findValidInvite(tx as unknown as DB, token);
		if (!row) throw new AuthError('invalid_invite', 'Invalid or expired invite');
		const taken = tx.select({ id: members.id }).from(members).where(eq(members.email, email)).get();
		if (taken && taken.id !== row.member.id) {
			throw new AuthError('email_taken', 'That email is already in use');
		}
		tx.update(members).set({ email, passwordHash }).where(eq(members.id, row.member.id)).run();
		tx.update(invites).set({ usedAt: new Date() }).where(eq(invites.id, row.invite.id)).run();
		// Acts as a password reset too: drop any existing sessions.
		tx.delete(sessions).where(eq(sessions.memberId, row.member.id)).run();
		const updated = tx.select().from(members).where(eq(members.id, row.member.id)).get()!;
		return toView(updated);
	});
}

/** Deletes expired sessions and expired or used invites. Returns rows removed. */
export function purgeExpiredAuth(db: DB, now: Date = new Date()): number {
	const s = db.delete(sessions).where(lte(sessions.expiresAt, now)).run();
	const i = db
		.delete(invites)
		.where(or(lte(invites.expiresAt, now), isNotNull(invites.usedAt)))
		.run();
	return s.changes + i.changes;
}
