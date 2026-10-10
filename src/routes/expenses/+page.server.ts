import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listExpenses, type ExpenseFilter } from '$lib/server/services/expenses';
import { listMembers } from '$lib/server/services/members';
import { groupByMonth } from '$lib/components/expenses/months';

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

	const groups = groupByMonth(posted);

	return {
		drafts,
		groups,
		members,
		meId: locals.member!.id,
		filters: { search, member, status: statusParam }
	};
};
