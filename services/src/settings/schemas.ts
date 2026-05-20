import { z } from 'zod';

export const categorySchema = z.array(
	z.object({
		id: z.string(),
		label: z.string(),
	}),
);
