// TODO(wave1-D): implement. Keep these signatures.

import sharp from 'sharp';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

const STORED_NAME_RE = /^[0-9a-f-]{36}\.(webp|pdf)$/;

type DetectedType = 'jpeg' | 'png' | 'webp' | 'pdf' | 'heic';

/** Sniffs the file type from magic bytes. Ignores the browser-supplied MIME type. */
function detectType(buf: Buffer): DetectedType | null {
	if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
	if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
		return 'png';
	if (
		buf.length >= 12 &&
		buf.toString('ascii', 0, 4) === 'RIFF' &&
		buf.toString('ascii', 8, 12) === 'WEBP'
	)
		return 'webp';
	if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'pdf';
	if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
		const brand = buf.toString('ascii', 8, 12).trim();
		if (['heic', 'heix', 'mif1', 'msf1', 'heif'].includes(brand)) return 'heic';
	}
	return null;
}

/** Directory for receipt files: RECEIPTS_DIR env or ./data/receipts (created on demand). */
export function receiptsDir(): string {
	return resolve(process.env.RECEIPTS_DIR ?? 'data/receipts');
}

/**
 * Validates and stores an uploaded receipt. Accepts JPEG/PNG/WebP/HEIC/HEIF images (re-encoded with
 * sharp to WebP, auto-rotated, max 2000px long edge, metadata stripped) and PDF (stored as-is).
 * Detects type from file content, not just the declared MIME. Returns the stored file name
 * (random uuid + extension). Throws ReceiptError with a user-friendly message on invalid input.
 */
export async function saveReceipt(file: File): Promise<string> {
	if (!file || file.size === 0) throw new ReceiptError('The file is empty');
	if (file.size > MAX_RECEIPT_BYTES)
		throw new ReceiptError(
			`Files must be under ${Math.floor(MAX_RECEIPT_BYTES / (1024 * 1024))} MB`
		);

	const buf = Buffer.from(await file.arrayBuffer());
	if (buf.length === 0) throw new ReceiptError('The file is empty');

	const type = detectType(buf);
	if (!type)
		throw new ReceiptError(
			'Unsupported file type. Please upload a JPEG, PNG, WebP, HEIC or PDF file.'
		);

	const dir = receiptsDir();
	await mkdir(dir, { recursive: true });

	if (type === 'pdf') {
		const name = `${crypto.randomUUID()}.pdf`;
		await writeFile(join(dir, name), buf);
		return name;
	}

	let output: Buffer;
	try {
		output = await sharp(buf)
			.rotate()
			.resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
			.webp({ quality: 82 })
			.toBuffer();
	} catch {
		if (type === 'heic')
			throw new ReceiptError('HEIC photos are not supported; please upload JPEG or PNG');
		throw new ReceiptError('Could not read this image file');
	}

	const name = `${crypto.randomUUID()}.webp`;
	await writeFile(join(dir, name), output);
	return name;
}

/** Reads a stored receipt. Returns null if the name is invalid (path traversal etc.) or missing. */
export async function readReceipt(
	fileName: string
): Promise<{ data: Buffer; contentType: string } | null> {
	if (!STORED_NAME_RE.test(fileName)) return null;
	try {
		const data = await readFile(join(receiptsDir(), fileName));
		const contentType = fileName.endsWith('.pdf') ? 'application/pdf' : 'image/webp';
		return { data, contentType };
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw err;
	}
}

/** Deletes a stored receipt if it exists; ignores invalid names. */
export async function deleteReceipt(fileName: string): Promise<void> {
	if (!STORED_NAME_RE.test(fileName)) return;
	try {
		await unlink(join(receiptsDir(), fileName));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
	}
}

export class ReceiptError extends Error {}
