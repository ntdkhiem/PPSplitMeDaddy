import ExcelJS from 'exceljs';
import { dollarsToCents, parseMoney } from '$lib/money';
import { createExpense } from './services/expenses';
import { isNull, eq, and } from 'drizzle-orm';
import { expenses } from './db/schema';
import type { DB } from './db';

export interface ParsedRow {
	/** 1-based spreadsheet row number */
	row: number;
	description: string;
	amountCents: number;
	/** header names of checked participant columns */
	participantNames: string[];
}

export interface ParsedSheet {
	sheetName: string;
	/** sheet name minus the trailing " Bills" */
	payerName: string;
	rows: ParsedRow[];
	/** human-readable notes about skipped rows, e.g. "Row 2: skipped example row" */
	skipped: string[];
}

export interface ParsedWorkbook {
	sheets: ParsedSheet[];
	/** distinct person names seen as payers or participant column headers, in first-seen order */
	people: string[];
}

type CellValue = ExcelJS.CellValue;

/** Extracts plain text from a cell value shape (string, number, rich text, formula/result). */
function cellText(value: CellValue): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number') return String(value);
	if (typeof value === 'boolean') return String(value);
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'object') {
		if ('richText' in value && Array.isArray((value as ExcelJS.CellRichTextValue).richText)) {
			return (value as ExcelJS.CellRichTextValue).richText
				.map((r) => r.text)
				.join('')
				.trim();
		}
		if ('text' in value && (value as { text?: unknown }).text !== undefined) {
			return cellText((value as { text: CellValue }).text);
		}
		if ('result' in value) {
			return cellText((value as { result: CellValue }).result);
		}
	}
	return String(value).trim();
}

/** Extracts a checkbox-ish boolean from a cell value (boolean, 1/0, "TRUE"/"FALSE", formula result). */
function cellBool(value: CellValue): boolean {
	if (value === null || value === undefined) return false;
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	if (typeof value === 'string') {
		const s = value.trim().toLowerCase();
		return s === 'true' || s === '1';
	}
	if (typeof value === 'object' && 'result' in value) {
		return cellBool((value as { result: CellValue }).result);
	}
	return false;
}

/** Extracts a money amount in integer cents from a cost cell, or null if missing/non-numeric. */
function cellCostCents(value: CellValue): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'number') return dollarsToCents(value);
	if (typeof value === 'string') {
		const s = value.trim();
		if (s === '') return null;
		return parseMoney(s);
	}
	if (typeof value === 'object') {
		if ('richText' in value && Array.isArray((value as ExcelJS.CellRichTextValue).richText)) {
			const text = (value as ExcelJS.CellRichTextValue).richText
				.map((r) => r.text)
				.join('')
				.trim();
			return text === '' ? null : parseMoney(text);
		}
		if ('result' in value) {
			const result = (value as { result: CellValue }).result;
			if (typeof result === 'number') return dollarsToCents(result);
			if (typeof result === 'string') {
				const s = result.trim();
				return s === '' ? null : parseMoney(s);
			}
			return null;
		}
	}
	return null;
}

interface HeaderColumn {
	col: number;
	name: string;
}

/** Person columns from C until an empty header or a header named "Split Cost" (case-insensitive). */
function readHeaderColumns(headerRow: ExcelJS.Row): HeaderColumn[] {
	const columns: HeaderColumn[] = [];
	let col = 3; // C
	for (;;) {
		const name = cellText(headerRow.getCell(col).value);
		if (name === '' || name.toLowerCase() === 'split cost') break;
		columns.push({ col, name });
		col++;
	}
	return columns;
}

function parseSheet(worksheet: ExcelJS.Worksheet, payerName: string): ParsedSheet {
	const headerRow = worksheet.getRow(1);
	const headerColumns = readHeaderColumns(headerRow);
	const rows: ParsedRow[] = [];
	const skipped: string[] = [];

	const lastRow = worksheet.actualRowCount;
	for (let r = 2; r <= lastRow; r++) {
		const row = worksheet.getRow(r);
		const description = cellText(row.getCell(1).value);
		const costCents = cellCostCents(row.getCell(2).value);
		const hasCost = costCents !== null && costCents !== 0;

		if (description.toLowerCase() === 'example') {
			skipped.push(`Row ${r}: skipped example row`);
			continue;
		}

		if (description === '' && !hasCost) {
			// Fully blank row: silently ignored even if checkboxes are ticked.
			continue;
		}

		if (description === '' || !hasCost) {
			skipped.push(`Row ${r}: skipped row with empty description or invalid cost`);
			continue;
		}

		const participantNames = headerColumns
			.filter((h) => cellBool(row.getCell(h.col).value))
			.map((h) => h.name);

		if (participantNames.length === 0) {
			skipped.push(`Row ${r}: skipped row with no participants checked`);
			continue;
		}

		rows.push({ row: r, description, amountCents: costCents!, participantNames });
	}

	return { sheetName: worksheet.name, payerName, rows, skipped };
}

/**
 * Parses every sheet whose name ends with " Bills" (case-insensitive).
 * Row 1 is the header: A=description, B=cost, then person columns from C until an empty header or
 * a header named "Split Cost". Data rows: description = trimmed A; cost = B's value, or the cached
 * formula result for formula cells; checkbox cells may be boolean, 1/0, or "TRUE"/"FALSE".
 * Skips (and records in `skipped`) rows whose description is "Example" (case-insensitive), rows with
 * an empty description or missing/zero/non-numeric cost, and rows with no checked participants.
 * Silently ignores fully blank rows (no description and no cost), even if checkboxes are ticked.
 */
export async function parseWorkbook(data: ArrayBuffer | Buffer): Promise<ParsedWorkbook> {
	const workbook = new ExcelJS.Workbook();
	const buffer = Buffer.isBuffer(data) ? data : Buffer.from(new Uint8Array(data));
	// exceljs's bundled types declare `load`'s parameter as its own broken local `Buffer` shape
	// (`extends ArrayBuffer`), which a real Node Buffer never structurally satisfies.
	await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

	const sheets: ParsedSheet[] = [];
	const people: string[] = [];
	const seen = new Set<string>();
	const addPerson = (name: string) => {
		if (name !== '' && !seen.has(name)) {
			seen.add(name);
			people.push(name);
		}
	};

	for (const worksheet of workbook.worksheets) {
		const name = worksheet.name.trim();
		const match = /^(.*)\s+Bills$/i.exec(name);
		if (!match) continue;
		const payerName = match[1].trim();

		const parsed = parseSheet(worksheet, payerName);
		sheets.push(parsed);

		addPerson(payerName);
		const headerColumns = readHeaderColumns(worksheet.getRow(1));
		for (const h of headerColumns) addPerson(h.name);
	}

	return { sheets, people };
}

/** name from the workbook -> member id, or null to drop that person */
export type PersonMapping = Record<string, string | null>;

export interface ImportResult {
	created: number;
	skipped: string[];
}

/**
 * Creates one posted, equal-split expense per parsed row (via services/expenses.createExpense)
 * in a single transaction. Payer and participants are resolved through `mapping`.
 * Participants mapped to null are dropped; rows whose payer is unmapped or that end up with no
 * participants are skipped and reported. Every expense gets `date` and
 * notes = "Imported from <sheetName> row <row>". If `skipExisting` is true, rows whose notes already
 * exist on a non-deleted expense are skipped (makes re-importing the same file safe).
 */
export function commitImport(
	db: DB,
	parsed: ParsedWorkbook,
	mapping: PersonMapping,
	options: { date: string; createdBy: string | null; skipExisting?: boolean }
): ImportResult {
	return db.transaction((tx) => {
		let created = 0;
		const skipped: string[] = [];

		for (const sheet of parsed.sheets) {
			const payerId = mapping[sheet.payerName];
			if (!payerId) {
				if (sheet.rows.length > 0) {
					skipped.push(
						`Sheet ${sheet.sheetName}: skipped ${sheet.rows.length} row(s), payer "${sheet.payerName}" is unmapped`
					);
				}
				continue;
			}

			for (const row of sheet.rows) {
				const notes = `Imported from ${sheet.sheetName} row ${row.row}`;

				if (options.skipExisting) {
					const existing = tx
						.select({ id: expenses.id })
						.from(expenses)
						.where(and(eq(expenses.notes, notes), isNull(expenses.deletedAt)))
						.get();
					if (existing) {
						skipped.push(`${notes}: already imported`);
						continue;
					}
				}

				const participantIds: string[] = [];
				for (const name of row.participantNames) {
					const memberId = mapping[name];
					if (memberId) participantIds.push(memberId);
				}

				if (participantIds.length === 0) {
					skipped.push(`${notes}: no mapped participants`);
					continue;
				}

				createExpense(
					tx,
					{
						description: row.description,
						amountCents: row.amountCents,
						date: options.date,
						payerId,
						splitMode: 'equal',
						participants: participantIds.map((memberId) => ({ memberId })),
						notes,
						status: 'posted'
					},
					options.createdBy
				);
				created++;
			}
		}

		return { created, skipped };
	});
}
