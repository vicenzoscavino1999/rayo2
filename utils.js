// utils.js - Shared Utility Functions for Rayo ⚡
// This module contains common functions used across the application

/**
 * Prevent XSS attacks by escaping HTML characters
 * @param {string} str - The string to sanitize
 * @returns {string} Sanitized HTML string
 */
export function sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Get relative time ago string
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Human-readable time ago string
 */
export function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'ahora';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd';
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/**
 * Format large numbers with K/M suffix
 * @param {number} num - The number to format
 * @returns {string} Formatted number string
 */
export function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

/**
 * Format date for display (Hoy, Ayer, or full date)
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted date string
 */
export function formatDate(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return 'Hoy';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Ayer';
    } else {
        return date.toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
    }
}

/**
 * Format time for display
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted time string (HH:MM)
 */
export function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Safe text for attributes (escapes special characters)
 * @param {string} str - The string to make safe
 * @returns {string} Safe string for use in attributes
 */
export function safeText(str) {
    if (!str) return '';
    return sanitizeHTML(str);
}

/**
 * Cloudinary configuration from environment variables
 */
/**
 * Cloudinary configuration from environment variables
 * IMPORTANT: Do not hardcode credentials here - use .env file
 */
export const cloudinaryConfig = {
    cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
    uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
};

/**
 * Check if Cloudinary is properly configured
 * @returns {boolean} True if config is valid
 */
export function isCloudinaryConfigured() {
    return !!(cloudinaryConfig.cloudName && cloudinaryConfig.uploadPreset);
}

/**
 * Get Cloudinary upload URL
 * @returns {string} Cloudinary upload API URL
 */
export function getCloudinaryUploadUrl() {
    return `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`;
}
