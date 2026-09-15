import { z } from 'zod';
import type { ShareInput, SplitMode } from '$lib/types';

const shareInputSchema = z.object({
	memberId: z.string().min(1),
	weight: z.number().int().positive().optional(),
	amountCents: z.number().int().optional()
});

/**
 * Parses the `splitMode` + `participants` hidden fields emitted by SplitEditor.svelte.
 * Returns an error string instead of throwing so actions can `fail(400, ...)`.
 * Split validity against the amount is checked later by splitAmount (SplitError).
 */
export function parseSplitFields(
	form: FormData,
	validMemberIds: Set<string>
): { ok: true; splitMode: SplitMode; participants: ShareInput[] } | { ok: false; error: string } {
	const mode = z.enum(['equal', 'shares', 'exact']).safeParse(form.get('splitMode'));
	if (!mode.success) return { ok: false, error: 'Choose how to split' };

	let raw: unknown;
	try {
		raw = JSON.parse(String(form.get('participants') ?? '[]'));
	} catch {
		return { ok: false, error: 'Invalid participants' };
	}
	const parsed = z.array(shareInputSchema).safeParse(raw);
	if (!parsed.success) return { ok: false, error: 'Invalid participants' };
	if (parsed.data.length === 0) return { ok: false, error: 'Pick at least one person' };
	if (parsed.data.some((p) => !validMemberIds.has(p.memberId)))
		return { ok: false, error: 'Unknown participant' };

	return { ok: true, splitMode: mode.data, participants: parsed.data };
}

/** Trimmed string or null for empty/missing form values. */
export function optionalText(form: FormData, name: string): string | null {
	const v = form.get(name);
	if (typeof v !== 'string') return null;
	const t = v.trim();
	return t === '' ? null : t;
}
