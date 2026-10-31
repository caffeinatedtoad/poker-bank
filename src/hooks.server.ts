import { dev } from '$app/env';
import { AUTH_EMAIL_HEADER, DEV_USER } from '$app/env/private';
import type { Handle } from '@sveltejs/kit/hooks';

// Middleware: runs before every request. `resolve(event)` is calling `next.ServeHTTP`.
//
// Pangolin signs the user in and forwards their email in a header. The app trusts that header,
// so it must only be reachable through Pangolin. See the k8s Service (ClusterIP, never exposed directly).
export const handle: Handle = ({ event, resolve }) => {
	const fromHeader = event.request.headers.get(AUTH_EMAIL_HEADER);
	const user = (fromHeader ?? (dev ? DEV_USER : undefined))?.trim().toLowerCase();

	if (!user) {
		return new Response(`Not signed in: missing the "${AUTH_EMAIL_HEADER}" header from Pangolin.`, {
			status: 401
		});
	}

	event.locals.user = user;
	return resolve(event);
};
