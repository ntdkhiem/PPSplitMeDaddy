// See https://svelte.dev/docs/kit/types#app.d.ts
import type { MemberView } from '$lib/server/services/members';

declare global {
	namespace App {
		interface Locals {
			/** logged-in member, or null (only possible on public routes) */
			member: MemberView | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
