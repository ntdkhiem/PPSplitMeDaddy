import { asc, eq } from 'drizzle-orm';
import type { DB } from '../db';
import { members, type Member } from '../db/schema';

/** Public member shape (never exposes passwordHash). */
export type MemberView = Omit<Member, 'passwordHash'> & { hasLogin: boolean };

export function toView(m: Member): MemberView {
	const { passwordHash, ...rest } = m;
	return { ...rest, hasLogin: passwordHash !== null };
}

export function listMembers(db: DB, opts: { includeInactive?: boolean } = {}): MemberView[] {
	const rows = db.select().from(members).orderBy(asc(members.name)).all();
	return rows.filter((m) => opts.includeInactive || m.active).map(toView);
}

export function getMember(db: DB, id: string): Member | undefined {
	return db.select().from(members).where(eq(members.id, id)).get();
}

export function countMembers(db: DB): number {
	return db.select().from(members).all().length;
}

export function createMember(
	db: DB,
	input: {
		name: string;
		email?: string | null;
		passwordHash?: string | null;
		role?: 'admin' | 'member';
	}
): Member {
	const row = {
		id: crypto.randomUUID(),
		name: input.name.trim(),
		email: input.email?.trim().toLowerCase() || null,
		passwordHash: input.passwordHash ?? null,
		role: input.role ?? 'member'
	};
	return db.insert(members).values(row).returning().get();
}

export function updateMember(
	db: DB,
	id: string,
	patch: Partial<Pick<Member, 'name' | 'email' | 'passwordHash' | 'role' | 'active'>>
): void {
	db.update(members).set(patch).where(eq(members.id, id)).run();
}

/** Finds a member by (normalized) email. */
export function getMemberByEmail(db: DB, email: string): Member | undefined {
	return db.select().from(members).where(eq(members.email, email.trim().toLowerCase())).get();
}

/** Case-insensitive name lookup (names are unique). */
export function getMemberByName(db: DB, name: string): Member | undefined {
	const n = name.trim().toLowerCase();
	return db
		.select()
		.from(members)
		.all()
		.find((m) => m.name.toLowerCase() === n);
}

/** Number of active admins. */
export function countActiveAdmins(db: DB): number {
	return db
		.select()
		.from(members)
		.all()
		.filter((m) => m.active && m.role === 'admin').length;
}
