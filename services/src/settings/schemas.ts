import { z } from 'zod';

export const categorySchema = z.array(
	z.object({
		id: z.string(),
		label: z.string(),
	}),
);

export const siteContentSchema = z
	.object({
		businessName: z.string(),
		logo: z.string(),
		tagline: z.string(),
		heroHeadline: z.string(),
		heroSubheadline: z.string(),
		aboutTitle: z.string(),
		aboutText: z.array(z.string()),
		aboutImages: z.array(z.string()),
		processTitle: z.string(),
		processSubtitle: z.string(),
		productsTitle: z.string(),
		productsSubtitle: z.string(),
		testimonialsTitle: z.string(),
		testimonialsSubtitle: z.string(),
		contactTitle: z.string(),
		contactSubtitle: z.string(),
		noProductsFound: z.string(),
		footerTagline: z.string(),
		yearsExperience: z.string(),
		yearsExperienceLabel: z.string(),
		rawNatural: z.string(),
		rawNaturalLabel: z.string(),
		californiaProud: z.string(),
		californiaProudLabel: z.string(),
		sinceYear: z.string(),
		sinceYearLabel: z.string(),
		navLinks: z.array(z.object({ id: z.string(), label: z.string() })),
		orderConfirmed: z.string(),
		orderConfirmationMessage: z.string(),
		questionsContact: z.string(),
		continueShopping: z.string(),
		categories: z.array(z.object({ id: z.string(), label: z.string() })),
		checkoutCancelledTitle: z.string().optional(),
		checkoutCancelledMessage: z.string().optional(),
		email: z.string(),
		phone: z.string(),
		location: z.string(),
		lat: z.number().optional(),
		lng: z.number().optional(),
		socialLinks: z.object({
			instagram: z.string().optional(),
			facebook: z.string().optional(),
			etsy: z.string().optional(),
			twitter: z.string().optional(),
			youtube: z.string().optional(),
		}),
	})
	.passthrough();

export const processStepsSchema = z.array(
	z.object({
		id: z.string(),
		step: z.number(),
		title: z.string(),
		description: z.string(),
		icon: z.string(),
	}),
);

export const testimonialsSchema = z.array(
	z.object({
		id: z.string(),
		name: z.string(),
		location: z.string(),
		rating: z.number().min(1).max(5),
		text: z.string(),
		date: z.string(),
	}),
);
