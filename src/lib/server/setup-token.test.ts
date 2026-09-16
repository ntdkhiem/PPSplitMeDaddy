import { describe, expect, it } from 'vitest';
import { isSetupAllowed } from './setup-token';

describe('isSetupAllowed', () => {
	it('allows setup without a token in dev when none is configured', () => {
		expect(isSetupAllowed(null, undefined, false)).toBe(true);
		expect(isSetupAllowed(null, '', false)).toBe(true);
	});

	it('refuses setup in production when no token is configured', () => {
		expect(isSetupAllowed(null, undefined, true)).toBe(false);
		expect(isSetupAllowed('anything', '', true)).toBe(false);
	});

	it('requires the configured token to match', () => {
		expect(isSetupAllowed('s3cret', 's3cret', true)).toBe(true);
		expect(isSetupAllowed('s3cret', 's3cret', false)).toBe(true);
		expect(isSetupAllowed(null, 's3cret', false)).toBe(false);
		expect(isSetupAllowed('', 's3cret', true)).toBe(false);
		expect(isSetupAllowed('wrong', 's3cret', true)).toBe(false);
		expect(isSetupAllowed('s3cret-longer', 's3cret', true)).toBe(false);
	});
});
