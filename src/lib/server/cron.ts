import { createHash, timingSafeEqual } from 'node:crypto';

/** Whether an `Authorization` header is `Bearer <secret>` (constant-time). No secret configured -> false. */
export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
	if (!secret || !header) return false;
	const digest = (s: string) => createHash('sha256').update(s).digest();
	return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
