import { DATABASE_URL } from '$app/env/private';
import { openDb } from './open';

// The app-wide database handle, opened once when the server starts.
// Kept apart from open.ts because tests can't read SvelteKit's $app/env.
export const db = openDb(DATABASE_URL);
