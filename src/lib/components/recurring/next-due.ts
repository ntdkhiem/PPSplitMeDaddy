/**
 * Computes the next due date (YYYY-MM-DD) for a recurring template.
 * It's the first period (YYYY-MM) >= max(startPeriod, current month) whose due date
 * (period + dayOfMonth) is >= today; if that period's due date has already passed,
 * the answer is the following month's due date.
 */
export function nextDueDate(
	template: { startPeriod: string; dayOfMonth: number },
	today: string
): string {
	const currentPeriod = today.slice(0, 7);
	const basePeriod = template.startPeriod > currentPeriod ? template.startPeriod : currentPeriod;
	const dd = String(template.dayOfMonth).padStart(2, '0');
	const dueDate = `${basePeriod}-${dd}`;
	if (dueDate >= today) return dueDate;
	return `${nextPeriod(basePeriod)}-${dd}`;
}

function nextPeriod(period: string): string {
	const [y, m] = period.split('-').map(Number);
	return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
