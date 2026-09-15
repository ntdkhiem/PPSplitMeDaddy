import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listTemplates, generateDueExpenses } from '$lib/server/recurring';
import { listMembers } from '$lib/server/services/members';

export const load: PageServerLoad = () => {
	const db = getDb();
	return {
		templates: listTemplates(db),
		members: listMembers(db, { includeInactive: true })
	};
};

export const actions: Actions = {
	generate: async () => {
		const db = getDb();
		const created = generateDueExpenses(db);
		return { generated: created };
	}
};
