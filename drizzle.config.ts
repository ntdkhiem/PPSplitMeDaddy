import { defineConfig } from 'drizzle-kit';

// Don't let a Vercel build silently migrate a throwaway local file instead of Turso.
if (process.env.VERCEL && !process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set for this Vercel environment');
}

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'turso',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? 'file:data/app.db',
		authToken: process.env.DATABASE_AUTH_TOKEN || undefined
	},
	strict: true,
	verbose: true
});
