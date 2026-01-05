import { describe, it, expect } from 'vitest';
import { sanitizeHTML, safeUrl, safeAttr, formatNumber, getTimeAgo } from '../utils.js';

describe('Utility Functions', () => {

    describe('sanitizeHTML', () => {
        it('should return empty string for empty input', () => {
            expect(sanitizeHTML('')).toBe('');
            expect(sanitizeHTML(null)).toBe('');
        });

        it('should escape HTML tags', () => {
            const input = '<script>alert("xss")</script>';
            const output = sanitizeHTML(input);
            expect(output).not.toContain('<script>');
            expect(output).toContain('&lt;script&gt;');
        });

        it('should preserve text content', () => {
            const input = 'Hello World';
            expect(sanitizeHTML(input)).toBe('Hello World');
        });
    });

    describe('safeUrl', () => {
        it('should allow valid https URLs', () => {
            expect(safeUrl('https://google.com')).toBe('https://google.com');
        });

        it('should reject javascript: URLs', () => {
            expect(safeUrl('javascript:alert(1)')).toBe('');
        });

        it('should use fallback for invalid URLs', () => {
            expect(safeUrl('invalid-url', 'fallback.png')).toBe('fallback.png');
        });
    });

    describe('formatNumber', () => {
        it('should format thousands with K', () => {
            expect(formatNumber(1500)).toBe('1.5K');
            expect(formatNumber(1000)).toBe('1.0K');
        });

        it('should format millions with M', () => {
            expect(formatNumber(1500000)).toBe('1.5M');
        });

        it('should return regular numbers as string for small values', () => {
            expect(formatNumber(500)).toBe('500');
        });
    });
});
