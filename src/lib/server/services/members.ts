import { and, asc, count, eq } from 'drizzle-orm';
import type { DB } from '../db';
import { members, type Member } from '../db/schema';

/** Public member shape (never exposes passwordHash). */
export type MemberView = Omit<Member, 'passwordHash'> & { hasLogin: boolean };

export function toView(m: Member): MemberView {
	const { passwordHash, ...rest } = m;
	return { ...rest, hasLogin: passwordHash !== null };
}

export async function listMembers(
	db: DB,
	opts: { includeInactive?: boolean } = {}
): Promise<MemberView[]> {
	const rows = await db.select().from(members).orderBy(asc(members.name)).all();
	return rows.filter((m) => opts.includeInactive || m.active).map(toView);
}

export async function getMember(db: DB, id: string): Promise<Member | undefined> {
	return db.select().from(members).where(eq(members.id, id)).get();
}

export async function countMembers(db: DB): Promise<number> {
	const row = await db.select({ n: count() }).from(members).get();
	return row?.n ?? 0;
}

export async function createMember(
	db: DB,
	input: {
		name: string;
		email?: string | null;
		passwordHash?: string | null;
		role?: 'admin' | 'member';
	}
): Promise<Member> {
	const row = {
		id: crypto.randomUUID(),
		name: input.name.trim(),
		email: input.email?.trim().toLowerCase() || null,
		passwordHash: input.passwordHash ?? null,
		role: input.role ?? 'member'
	};
	return db.insert(members).values(row).returning().get();
}

export async function updateMember(
	db: DB,
	id: string,
	patch: Partial<Pick<Member, 'name' | 'email' | 'passwordHash' | 'role' | 'active'>>
): Promise<void> {
	await db.update(members).set(patch).where(eq(members.id, id)).run();
}

/** Finds a member by (normalized) email. */
export async function getMemberByEmail(db: DB, email: string): Promise<Member | undefined> {
	return db.select().from(members).where(eq(members.email, email.trim().toLowerCase())).get();
}

/** Case-insensitive name lookup (names are unique). */
export async function getMemberByName(db: DB, name: string): Promise<Member | undefined> {
	// Compared in JS: SQLite's lower() only folds ASCII.
	const n = name.trim().toLowerCase();
	const rows = await db.select().from(members).all();
	return rows.find((m) => m.name.toLowerCase() === n);
}

/** Number of active admins. */
export async function countActiveAdmins(db: DB): Promise<number> {
	const row = await db
		.select({ n: count() })
		.from(members)
		.where(and(eq(members.active, true), eq(members.role, 'admin')))
		.get();
	return row?.n ?? 0;
}
