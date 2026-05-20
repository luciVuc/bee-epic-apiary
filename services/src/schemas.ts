import { z } from 'zod';

// Schema for category data validation
export const categorySchema = z.object({
	id: z.string().optional(),
	name: z.string().min(1, 'Category name is required'),
	description: z.string().optional(),
	order: z.number().int().positive().optional(),
});

export type Category = z.infer<typeof categorySchema>;
