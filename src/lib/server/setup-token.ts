import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Whether a first-run `/setup` request may proceed.
 * - `expected` set: `provided` must match it (constant-time).
 * - `expected` unset: allowed in dev, refused in production so a fresh public deploy can't be claimed
 *   by whoever finds it first.
 */
export function isSetupAllowed(
	provided: string | null,
	expected: string | undefined,
	production: boolean
): boolean {
	if (!expected) return !production;
	if (!provided) return false;
	const digest = (s: string) => createHash('sha256').update(s).digest();
	return timingSafeEqual(digest(provided), digest(expected));
}
