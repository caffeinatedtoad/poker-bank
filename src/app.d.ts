// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// What hooks.server.ts puts on `event.locals` for each request (like values in a Go context.Context).
		interface Locals {
			/** Signed-in user's email, lowercased. Always set: requests without one get a 401. */
			user: string;
		}
	}
}

export {};
