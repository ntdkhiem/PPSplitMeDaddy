/**
 * Parse a user-entered money string ("$1,234.5", "-3", "19.09") into integer cents.
 * Returns null if it is not a valid amount with at most 2 decimals.
 */
export function parseMoney(input: string): number | null {
	const s = input.trim().replace(/[$,\s]/g, '');
	const m = /^(-)?(\d+)(?:\.(\d{0,2}))?$|^(-)?\.(\d{1,2})$/.exec(s);
	if (!m) return null;
	const neg = m[1] ?? m[4];
	const whole = m[2] ?? '0';
	const frac = (m[3] ?? m[5] ?? '').padEnd(2, '0');
	const cents = Number(whole) * 100 + Number(frac);
	if (!Number.isSafeInteger(cents)) return null;
	return neg && cents !== 0 ? -cents : cents;
}

/** Round a JS number of dollars (e.g. from a spreadsheet) to integer cents. */
export function dollarsToCents(dollars: number): number {
	return Math.round(dollars * 100);
}

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Format integer cents as "$1,234.56" / "-$3.00". */
export function formatMoney(cents: number): string {
	return fmt.format(cents / 100);
}

/** Format cents for an <input> value: "1234.56". */
export function centsToInput(cents: number): string {
	return (cents / 100).toFixed(2);
}

/** Today's date as YYYY-MM-DD in local time. */
export function today(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
