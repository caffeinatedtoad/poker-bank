import type { LayoutServerLoad } from './$types';

// Layout data is available to every page, so the header can show who's signed in.
export const load: LayoutServerLoad = ({ locals }) => {
	return { user: locals.user };
};
