import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { eq, and, isNull } from 'drizzle-orm';
import { createTestDb } from './db';
import { expenses, expenseShares } from './db/schema';
import { createMember } from './services/members';
import { parseWorkbook, commitImport, type ParsedWorkbook } from './import-xlsx';

const xlsxPath = fileURLToPath(new URL('../../../1008 Ravenscourt Bills.xlsx', import.meta.url));

async function loadRealWorkbook(): Promise<ParsedWorkbook> {
	const buffer = readFileSync(xlsxPath);
	return parseWorkbook(buffer);
}

describe('parseWorkbook (real file)', () => {
	it('parses only the " Bills" sheets with the expected row counts', async () => {
		const wb = await loadRealWorkbook();
		const names = wb.sheets.map((s) => s.sheetName);
		expect(names).toEqual(['Tyler Bills', 'Khiem Bills', 'BLANK Bills']);

		const byName = Object.fromEntries(wb.sheets.map((s) => [s.sheetName, s]));
		expect(byName['Tyler Bills'].rows).toHaveLength(15);
		expect(byName['Khiem Bills'].rows).toHaveLength(8);
		expect(byName['BLANK Bills'].rows).toHaveLength(0);
	});

	it('skips and records the Example row on every sheet', async () => {
		const wb = await loadRealWorkbook();
		for (const sheet of wb.sheets) {
			expect(sheet.skipped.some((s) => /row 2/i.test(s) && /example/i.test(s))).toBe(true);
		}
	});

	it('keeps cached formula results, rounded to cents', async () => {
		const wb = await loadRealWorkbook();
		const tyler = wb.sheets.find((s) => s.sheetName === 'Tyler Bills')!;
		const detergent = tyler.rows.find((r) => r.description.toLowerCase().includes('detergent'));
		const polo = tyler.rows.find((r) => r.description.toLowerCase().includes('polo'));
		expect(detergent?.amountCents).toBe(3049);
		expect(polo?.amountCents).toBe(2131);
	});

	it('checks the right participants, including a payer-not-a-participant row', async () => {
		const wb = await loadRealWorkbook();
		const tyler = wb.sheets.find((s) => s.sheetName === 'Tyler Bills')!;
		const khiem = wb.sheets.find((s) => s.sheetName === 'Khiem Bills')!;

		const slippers = tyler.rows.find((r) => r.description.toLowerCase() === 'slippers');
		expect(slippers?.participantNames).toEqual(['Khiem']);

		const miniVac = khiem.rows.find((r) => r.description.toLowerCase() === 'refunded mini vac');
		expect(miniVac?.participantNames).toEqual(['Tyler']);
	});

	it('silently ignores fully-blank rows even when a stray checkbox is ticked', async () => {
		const wb = await loadRealWorkbook();
		const khiem = wb.sheets.find((s) => s.sheetName === 'Khiem Bills')!;
		// Rows 33-41 have Tyler checked but no description/cost; they must not appear as rows
		// nor be recorded as skipped (they are silently ignored).
		expect(khiem.rows.some((r) => r.row >= 33 && r.row <= 41)).toBe(false);
		expect(khiem.skipped.some((s) => /row (3[3-9]|4[01])\b/.test(s))).toBe(false);
	});

	it('collects distinct people in first-seen order', async () => {
		const wb = await loadRealWorkbook();
		expect(wb.people).toEqual(['Tyler', 'Khiem', 'VOID', 'BLANK']);
	});
});

describe('commitImport (real file into a test db)', () => {
	it('imports all mapped rows, is idempotent with skipExisting, and balances the ledger', async () => {
		const wb = await loadRealWorkbook();
		const db = createTestDb();
		const tyler = createMember(db, { name: 'Tyler' });
		const khiem = createMember(db, { name: 'Khiem' });
		const mapping = { Tyler: tyler.id, Khiem: khiem.id, VOID: null, BLANK: null };

		const first = commitImport(db, wb, mapping, { date: '2026-01-01', createdBy: null });
		expect(first.created).toBe(23);

		const second = commitImport(db, wb, mapping, {
			date: '2026-01-01',
			createdBy: null,
			skipExisting: true
		});
		expect(second.created).toBe(0);

		// Independently derive each member's net balance straight from the tables and check it
		// zero-sums (every expense's shares must sum to its amount, and only Tyler/Khiem are mapped).
		function netBalance(memberId: string): number {
			const paid = db
				.select()
				.from(expenses)
				.where(and(eq(expenses.payerId, memberId), isNull(expenses.deletedAt)))
				.all()
				.reduce((sum, e) => sum + e.amountCents, 0);
			const owed = db
				.select()
				.from(expenseShares)
				.where(eq(expenseShares.memberId, memberId))
				.all()
				.reduce((sum, s) => sum + s.amountCents, 0);
			return paid - owed;
		}

		const tylerBalance = netBalance(tyler.id);
		const khiemBalance = netBalance(khiem.id);
		expect(tylerBalance + khiemBalance).toBe(0);
		// Golden value derived from the real workbook (see agent report), guards against regressions.
		expect(tylerBalance).toBe(7375);
	});

	it('skips rows whose payer is not in the mapping, and reports why', async () => {
		const wb = await loadRealWorkbook();
		const db = createTestDb();
		const tyler = createMember(db, { name: 'Tyler' });
		// Khiem intentionally left unmapped.
		const mapping = { Tyler: tyler.id, VOID: null, BLANK: null };

		const result = commitImport(db, wb, mapping, { date: '2026-01-01', createdBy: null });
		// 15 Tyler Bills rows minus the 6 Khiem-only rows (slippers, deodorant, polo shirts,
		// com tam, popeyes, Lion Market), which end up with no mapped participants.
		expect(result.created).toBe(9);
		expect(result.skipped.some((s) => /Khiem/.test(s) && /unmapped/.test(s))).toBe(true);
	});
});

describe('parseWorkbook (synthetic workbook)', () => {
	async function buildWorkbook(): Promise<Buffer> {
		const wb = new ExcelJS.Workbook();
		const sheet = wb.addWorksheet('Test Bills');
		sheet.addRow(['Utility', 'Cost', 'Tyler', 'Khiem', 'Split Cost', 'Extra']);
		sheet.addRow(['Example', 30, true, true, null, null]);
		sheet.addRow(['Blank row', null, false, false, null, null]); // invalid cost -> skipped
		sheet.addRow([null, null, false, false, null, null]); // fully blank -> silently ignored
		sheet.addRow(['Dollar string cost', '$12.50', 'TRUE', 'FALSE', null, null]);
		sheet.addRow(['No participants', 5, 'FALSE', 'FALSE', null, null]); // skipped
		sheet.addRow(['Zero cost', 0, true, true, null, null]); // skipped
		const buf = await wb.xlsx.writeBuffer();
		return Buffer.from(buf);
	}

	it('stops person columns at "Split Cost" and handles string/boolean-string cells', async () => {
		const buffer = await buildWorkbook();
		const parsed = await parseWorkbook(buffer);
		expect(parsed.sheets).toHaveLength(1);
		const sheet = parsed.sheets[0];
		expect(sheet.payerName).toBe('Test');

		expect(sheet.rows).toHaveLength(1);
		const row = sheet.rows[0];
		expect(row.description).toBe('Dollar string cost');
		expect(row.amountCents).toBe(1250);
		expect(row.participantNames).toEqual(['Tyler']);

		expect(sheet.skipped.some((s) => /row 2/i.test(s) && /example/i.test(s))).toBe(true);
		expect(sheet.skipped.some((s) => /row 3/i.test(s))).toBe(true); // blank row description, invalid cost
		expect(sheet.skipped.some((s) => /row 4/i.test(s))).toBe(false); // fully blank: silently ignored
		expect(sheet.skipped.some((s) => /row 6/i.test(s))).toBe(true); // no participants
		expect(sheet.skipped.some((s) => /row 7/i.test(s))).toBe(true); // zero cost

		expect(parsed.people).toEqual(['Test', 'Tyler', 'Khiem']);
	});
});
