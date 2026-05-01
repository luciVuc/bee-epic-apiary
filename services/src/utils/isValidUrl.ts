/**
 * Validates if a string is a valid HTTP or HTTPS URL.
 * Uses the URL constructor to parse and validate the URL format.
 *
 * @param {string} url - String to validate as URL
 * @returns {boolean} true if valid HTTP/HTTPS URL, false otherwise
 *
 * @example
 * isValidUrl('https://example.com'); // returns true
 * isValidUrl('http://localhost:3000'); // returns true
 * isValidUrl('ftp://example.com'); // returns false
 * isValidUrl('not-a-url'); // returns false
 */
export function isValidUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch {
		return false;
	}
}

export default isValidUrl;
