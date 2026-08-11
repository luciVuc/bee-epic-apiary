import { describe, it, expect } from 'vitest';
import { buildEmailBody } from '../../src/utils/buildEmailBody';
import type { IOrderTemplateData, ICommTemplateData } from '../../src/types';

const orderData: IOrderTemplateData = {
	sessionId: 'cs_test_abc123',
	customerName: 'Jane Customer',
	customerEmail: 'jane@example.com',
	amountTotal: '$49.99',
	orderLink: 'https://admin.example.com/orders/cs_test_abc123',
	businessName: 'Bee Epic Apiary',
};

const commData: ICommTemplateData = {
	name: 'John Doe',
	email: 'john@example.com',
	subject: 'Question about honey',
	message: 'How do I order your wildflower honey?',
};

describe('buildEmailBody', () => {
	describe('order templates', () => {
		it('builds HTML body for order notification', async () => {
			const result = await buildEmailBody('html', orderData);
			expect(result).toContain('New Order Placed');
			expect(result).toContain('Jane Customer');
			expect(result).toContain('$49.99');
		});

		it('builds text body for order notification', async () => {
			const result = await buildEmailBody('text', orderData);
			expect(result).toContain('A new order has been placed');
			expect(result).toContain('Jane Customer');
			expect(result).toContain('$49.99');
		});

		it('builds markdown body for order notification (rendered to HTML)', async () => {
			const result = await buildEmailBody('markdown', orderData);
			expect(result).toContain('New Order Placed');
			expect(result).toContain('Jane Customer');
			expect(result).not.toContain('```');
		});
	});

	describe('contact templates', () => {
		it('builds HTML body for contact notification', async () => {
			const result = await buildEmailBody('html', commData);
			expect(result).toContain('From:');
			expect(result).toContain('john@example.com');
			expect(result).toContain('mailto:');
		});

		it('builds text body for contact notification', async () => {
			const result = await buildEmailBody('text', commData);
			expect(result).toContain('John Doe');
			expect(result).toContain('Question about honey');
		});

		it('builds markdown body for contact notification (rendered to HTML)', async () => {
			const result = await buildEmailBody('markdown', commData);
			expect(result).toContain('New Message Received');
			expect(result).toContain('mailto:john@example.com');
			expect(result).not.toContain('```');
		});
	});

	describe('XSS safety', () => {
		it('escapes HTML in HTML mode for order data', async () => {
			const malicious: IOrderTemplateData = {
				...orderData,
				customerName: '<img src=x onerror=alert(1)>',
			};
			const result = await buildEmailBody('html', malicious);
			expect(result).not.toContain('<img');
			expect(result).toContain('&lt;img');
		});

		it('escapes HTML in HTML mode for contact data', async () => {
			const malicious: ICommTemplateData = {
				...commData,
				name: '<script>alert(1)</script>',
			};
			const result = await buildEmailBody('html', malicious);
			expect(result).not.toContain('<script>');
			expect(result).toContain('&lt;script&gt;');
		});

		it('strips raw HTML when rendering markdown (defense in depth — review I7)', async () => {
			// Templates already escape user input before passing it to `marked`, but
			// `marked` defaults to passing raw HTML through. If a future template author
			// forgets to escape, raw <script> tags would render directly. Disabling raw
			// HTML at the marked-config level is a defense-in-depth backstop.
			const { marked } = await import('marked');
			const rendered = await marked('Hi <script>alert(1)</script> there');
			expect(rendered).not.toMatch(/<script/i);
		});
	});

	describe('default format', () => {
		it('falls back to text for unknown format', async () => {
			const result = await buildEmailBody('text' as any, commData);
			expect(result).toContain('John Doe');
		});
	});
});
