import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { deleteReceipt, MAX_RECEIPT_BYTES, readReceipt, saveReceipt } from './receipts';

describe('receipts', () => {
	let dir: string;
	let originalEnv: string | undefined;

	beforeEach(async () => {
		originalEnv = process.env.RECEIPTS_DIR;
		dir = await mkdtemp(join(tmpdir(), 'ppos-receipts-'));
		process.env.RECEIPTS_DIR = dir;
	});

	afterEach(async () => {
		process.env.RECEIPTS_DIR = originalEnv;
		await rm(dir, { recursive: true, force: true });
	});

	it('stores an oversized PNG as a resized webp', async () => {
		const png = await sharp({
			create: { width: 3000, height: 1000, channels: 3, background: '#ffffff' }
		})
			.png()
			.toBuffer();
		const file = new File([png], 'receipt.png', { type: 'image/png' });

		const name = await saveReceipt(file);
		expect(name).toMatch(/^[0-9a-f-]{36}\.webp$/);

		const stored = await readReceipt(name);
		expect(stored).not.toBeNull();
		expect(stored!.contentType).toBe('image/webp');

		const meta = await sharp(stored!.data).metadata();
		expect(meta.format).toBe('webp');
		expect(meta.width).toBe(2000);
		expect(meta.height).toBe(667);
	});

	it('stores a PDF as-is', async () => {
		const pdf = Buffer.from('%PDF-1.4\n%mock pdf content\n%%EOF');
		const file = new File([pdf], 'receipt.pdf', { type: 'application/pdf' });

		const name = await saveReceipt(file);
		expect(name).toMatch(/^[0-9a-f-]{36}\.pdf$/);

		const stored = await readReceipt(name);
		expect(stored).not.toBeNull();
		expect(stored!.contentType).toBe('application/pdf');
		expect(stored!.data.equals(pdf)).toBe(true);
	});

	it('rejects a text file (unrecognized magic bytes)', async () => {
		const file = new File([Buffer.from('hello world, this is not an image')], 'notes.txt', {
			type: 'text/plain'
		});
		await expect(saveReceipt(file)).rejects.toThrow();
	});

	it('rejects an empty file', async () => {
		const file = new File([], 'empty.png', { type: 'image/png' });
		await expect(saveReceipt(file)).rejects.toThrow(/empty/i);
	});

	it('rejects an oversize file', async () => {
		const big = new Uint8Array(MAX_RECEIPT_BYTES + 1);
		// give it a valid PNG signature so size is the only failure reason
		big[0] = 0x89;
		big[1] = 0x50;
		big[2] = 0x4e;
		big[3] = 0x47;
		const file = new File([big], 'huge.png', { type: 'image/png' });
		await expect(saveReceipt(file)).rejects.toThrow();
	});

	it('returns null for invalid/path-traversal names', async () => {
		expect(await readReceipt('../x')).toBeNull();
		expect(await readReceipt('not-a-uuid.webp')).toBeNull();
		expect(await readReceipt('..%2f..%2fetc%2fpasswd.pdf')).toBeNull();
		expect(await readReceipt(`${crypto.randomUUID()}.exe`)).toBeNull();
	});

	it('deletes a stored receipt', async () => {
		const pdf = Buffer.from('%PDF-1.4\nx');
		const file = new File([pdf], 'r.pdf', { type: 'application/pdf' });
		const name = await saveReceipt(file);

		expect(await readReceipt(name)).not.toBeNull();
		await deleteReceipt(name);
		expect(await readReceipt(name)).toBeNull();

		// deleting again / deleting an invalid name should not throw
		await expect(deleteReceipt(name)).resolves.toBeUndefined();
		await expect(deleteReceipt('../x')).resolves.toBeUndefined();
	});
});
