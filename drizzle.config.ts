import { defineConfig } from 'drizzle-kit';

// Config for the drizzle-kit CLI only (not loaded by the app):
//   npm run db:generate  diff schema.ts against ./drizzle and write a new SQL migration
//   npm run db:studio    browse the local database in a web UI
// The app applies migrations itself on startup (src/lib/server/db/open.ts).
export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	dbCredentials: { url: process.env.DATABASE_URL ?? 'local.db' },
	verbose: true,
	strict: true
});
