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
 * Safe text for attributes (escapes quotes and special characters)
 * @param {string} str - The string to make safe
 * @returns {string} Safe string for use in attributes
 */
export function safeAttr(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Validate and sanitize URL for use in src/href attributes
 * Only allows https://, http://, and valid data: URLs
 * @param {string} url - The URL to validate
 * @param {string} fallback - Fallback URL if invalid
 * @returns {string} Safe URL or fallback
 */
export function safeUrl(url, fallback = '') {
    if (!url || typeof url !== 'string') return fallback;

    const trimmed = url.trim();

    // Allow https and http URLs
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
        return safeAttr(trimmed);
    }

    // Allow data: URLs only for images and videos
    if (trimmed.startsWith('data:image/') || trimmed.startsWith('data:video/')) {
        return trimmed; // data URLs are already encoded
    }

    // Everything else is rejected
    return fallback;
}

// Legacy alias
export const safeText = safeAttr;

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

/**
 * Get Cloudinary signature from Cloud Function (Secure)
 * @param {string} idToken - Firebase ID token for authentication
 * @returns {Promise<{signature: string, timestamp: number}>}
 */
export async function getCloudinarySignature(idToken) {
    const timestamp = Math.round(Date.now() / 1000);

    try {
        const response = await fetch('https://us-central1-rayo-app-47718.cloudfunctions.net/generateCloudinarySignature', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ timestamp })
        });

        if (!response.ok) {
            throw new Error('Signature generation failed');
        }

        const data = await response.json();
        return {
            signature: data.signature,
            timestamp: data.timestamp
        };
    } catch (error) {
        console.error('Error getting Cloudinary signature:', error);
        throw error;
    }
}
