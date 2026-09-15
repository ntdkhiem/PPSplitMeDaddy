import { error } from '@sveltejs/kit';
import { readReceipt } from '$lib/server/receipts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.member) error(401);

	const receipt = await readReceipt(params.file);
	if (!receipt) error(404);

	return new Response(new Uint8Array(receipt.data), {
		headers: {
			'Content-Type': receipt.contentType,
			'Cache-Control': 'private, max-age=86400',
			'X-Content-Type-Options': 'nosniff',
			'Content-Disposition': 'inline'
		}
	});
};
