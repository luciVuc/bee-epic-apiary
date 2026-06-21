import { describe, it, expect } from 'vitest';
import { buildCommNotificationHtml, buildCommNotificationText, buildCommNotificationMarkdown } from '../../src/contact/comm-template';
import type { ICommTemplateData } from '../../src/types';

const sampleData: ICommTemplateData = {
	name: 'John Doe',
	email: 'john@example.com',
	subject: 'Test Subject',
	message: 'Hello, this is a test message.',
};

const xssData: ICommTemplateData = {
	name: '<script>alert("xss")</script>',
	email: 'hack@example.com">',
	subject: '<b>bold subject</b>',
	message: 'Message with <script> injection',
};

describe('buildCommNotificationHtml', () => {
	it('returns HTML with escaped values for normal input', () => {
		const result = buildCommNotificationHtml(sampleData);
		expect(result).toContain('John Doe');
		expect(result).toContain('john@example.com');
		expect(result).toContain('Test Subject');
		expect(result).toContain('Hello, this is a test message.');
		expect(result).toContain('mailto:');
	});

	it('escapes XSS in all fields', () => {
		const result = buildCommNotificationHtml(xssData);
		expect(result).not.toContain('<script>');
		expect(result).not.toContain('alert("xss")');
		expect(result).toContain('&lt;script&gt;');
		expect(result).toContain('&quot;');
	});

	it('converts newlines to <br> in message', () => {
		const data: ICommTemplateData = {
			...sampleData,
			message: 'Line 1\nLine 2\nLine 3',
		};
		const result = buildCommNotificationHtml(data);
		expect(result).toContain('Line 1<br>Line 2<br>Line 3');
	});
});

describe('buildCommNotificationText', () => {
	it('returns pipe-separated plain text format', () => {
		const result = buildCommNotificationText(sampleData);
		expect(result).toContain('From: John Doe');
		expect(result).toContain('john@example.com');
		expect(result).toContain('Test Subject');
		expect(result).toContain('Hello, this is a test message.');
	});

	it('does not escape HTML in text mode', () => {
		const result = buildCommNotificationText(xssData);
		expect(result).toContain('<script>');
	});
});

describe('buildCommNotificationMarkdown', () => {
	it('returns markdown with mailto: links', () => {
		const result = buildCommNotificationMarkdown(sampleData);
		expect(result).toContain('[John Doe](mailto:john@example.com)');
		expect(result).toContain('Test Subject');
		expect(result).toContain('Hello, this is a test message.');
	});

	it('escapes HTML in markdown fields', () => {
		const result = buildCommNotificationMarkdown(xssData);
		expect(result).not.toContain('<script>');
		expect(result).toContain('&lt;script&gt;');
	});

	it('escapes parentheses in email for markdown link safety', () => {
		const data: ICommTemplateData = {
			...sampleData,
			email: 'user(with)parens@example.com',
		};
		const result = buildCommNotificationMarkdown(data);
		expect(result).toContain('mailto:user%28with%29parens@example.com');
	});

	it('includes automatic footer', () => {
		const result = buildCommNotificationMarkdown(sampleData);
		expect(result).toContain('sent automatically');
	});
});
