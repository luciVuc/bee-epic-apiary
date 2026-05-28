export enum ESettingsType {
	SITE = 'SITE',
	PROCESS = 'PROCESS',
	TESTIMONIALS = 'TESTIMONIALS',
	CATEGORIES = 'CATEGORIES',
}

export type SettingsType = keyof typeof ESettingsType;

export interface IAPIResponseError {
	status?: number;
	statusCode?: number;
	code?: string;
	message?: string;
	stack?: string;
	type?: string;
}
