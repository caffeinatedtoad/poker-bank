import { defineEnvVars } from '@sveltejs/kit/env';

// Every env var the app reads, validated when the server starts. Read them via `$app/env/private`.
// A `schema` function makes a variable optional or gives it a default.
export const variables = defineEnvVars({
	DATABASE_URL: { description: 'Path to the SQLite file, e.g. local.db or /data/poker.db.' },
	AUTH_EMAIL_HEADER: {
		description: 'Request header Pangolin uses to forward the signed-in user’s email.',
		schema: (value) => (value || 'remote-email').toLowerCase()
	},
	DEV_USER: {
		description: 'Email to act as when the auth header is missing. Only honoured by `npm run dev`.',
		schema: (value) => value || undefined
	}
});
