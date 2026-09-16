import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import {
	listExpenses,
	type ExpenseFilter,
	type ExpenseWithShares
} from '$lib/server/services/expenses';
import { listMembers } from '$lib/server/services/members';

interface MonthGroup {
	key: string;
	label: string;
	totalCents: number;
	expenses: ExpenseWithShares[];
}

function monthLabel(key: string): string {
	const [y, m] = key.split('-').map(Number);
	return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const db = getDb();

	const search = url.searchParams.get('search')?.trim() ?? '';
	const member = url.searchParams.get('member') ?? '';
	const statusParam = url.searchParams.get('status') ?? 'all';

	const filter: ExpenseFilter = {};
	if (search) filter.search = search;
	if (member) filter.memberId = member;
	if (statusParam === 'posted' || statusParam === 'draft') filter.status = statusParam;

	const [all, members] = await Promise.all([
		listExpenses(db, filter),
		listMembers(db, { includeInactive: true })
	]);
	const drafts = all.filter((e) => e.status === 'draft');
	const posted = all.filter((e) => e.status === 'posted');

	const groups: MonthGroup[] = [];
	for (const e of posted) {
		const key = e.date.slice(0, 7);
		let group = groups.at(-1);
		if (!group || group.key !== key) {
			group = { key, label: monthLabel(key), totalCents: 0, expenses: [] };
			groups.push(group);
		}
		group.totalCents += e.amountCents;
		group.expenses.push(e);
	}

	return {
		drafts,
		groups,
		members,
		meId: locals.member!.id,
		filters: { search, member, status: statusParam }
	};
};
