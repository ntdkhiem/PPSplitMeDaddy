import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listTemplates, generateDueExpenses } from '$lib/server/recurring';
import { listMembers } from '$lib/server/services/members';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const [templates, members] = await Promise.all([
		listTemplates(db),
		listMembers(db, { includeInactive: true })
	]);
	return { templates, members };
};

export const actions: Actions = {
	generate: async () => {
		const db = getDb();
		const created = await generateDueExpenses(db);
		return { generated: created };
	}
};
