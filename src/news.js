// src/news.js - GNews API integration for Rayo
// Fetches technology and entertainment news via Firebase Functions proxy

import { getTimeAgo, sanitizeHTML, safeUrl, safeAttr } from '../utils.js';

// Firebase Functions proxy URL (set after deploy)
// Format: https://<region>-<project>.cloudfunctions.net/gnewsProxy
const GNEWS_PROXY_URL = import.meta.env.VITE_GNEWS_PROXY_URL || '';

// SECURITY FIX: Removed direct API fallback to prevent key exposure
// If proxy fails, use fallback news instead of exposing API key

// Cache for news to reduce API calls
let cachedNews = [];
let lastFetchTime = 0;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// Fetch news from GNews API (via proxy or direct)
export async function fetchNews(category = 'technology', maxResults = 10) {
    const now = Date.now();

    // Return cached news if still valid
    if (cachedNews.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
        return cachedNews;
    }

    // SECURITY FIX: Require proxy, no fallback to direct API
    if (!GNEWS_PROXY_URL) {
        console.warn('GNews proxy not configured. Using fallback news.');
        return getFallbackNews();
    }

    try {
        // Fetch both technology and entertainment
        const [techNews, entertainmentNews] = await Promise.all([
            fetchCategory('technology', Math.floor(maxResults / 2)),
            fetchCategory('entertainment', Math.floor(maxResults / 2))
        ]);

        // Merge and shuffle
        cachedNews = shuffleArray([...techNews, ...entertainmentNews]);
        lastFetchTime = now;

        return cachedNews;
    } catch (error) {
        console.error('Error fetching news:', error);
        return getFallbackNews();
    }
}

// Fetch single category (via proxy only)
async function fetchCategory(category, max) {
    // SECURITY FIX: Only use proxy, no direct API access
    const url = `${GNEWS_PROXY_URL}?category=${category}&max=${max}&lang=es&country=mx`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`News API error: ${response.status}`);
    }

    const data = await response.json();

    return (data.articles || []).map(article => ({
        id: 'news-' + hashString(article.url),
        type: 'news',
        category: category === 'technology' ? 'Tecnología' : 'Entretenimiento',
        title: article.title,
        description: article.description,
        content: article.content,
        imageUrl: article.image,
        source: article.source?.name || 'Noticia',
        url: article.url,
        publishedAt: new Date(article.publishedAt).getTime()
    }));
}

// Simple hash function for generating IDs
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

// Shuffle array
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Fallback news when API is not available
function getFallbackNews() {
    return [
        {
            id: 'news-fallback-1',
            type: 'news',
            category: 'Tecnología',
            title: 'La IA está transformando el desarrollo de software',
            description: 'Las herramientas de inteligencia artificial están revolucionando la forma en que los desarrolladores escriben código.',
            imageUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=400',
            source: 'Tech News',
            url: 'https://www.theverge.com/ai-artificial-intelligence',
            publishedAt: Date.now() - 3600000
        },
        {
            id: 'news-fallback-2',
            type: 'news',
            category: 'Entretenimiento',
            title: 'Nuevas películas llegan a las plataformas de streaming',
            description: 'Las principales plataformas anuncian sus estrenos más esperados para este mes.',
            imageUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400',
            source: 'Entertainment Daily',
            url: 'https://www.netflix.com/browse/new-releases',
            publishedAt: Date.now() - 7200000
        },
        {
            id: 'news-fallback-3',
            type: 'news',
            category: 'Tecnología',
            title: 'Apple anuncia nuevas funciones para iPhone',
            description: 'La compañía presenta actualizaciones importantes para su sistema operativo móvil.',
            imageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400',
            source: 'Apple News',
            url: 'https://www.apple.com/newsroom/',
            publishedAt: Date.now() - 10800000
        },
        {
            id: 'news-fallback-4',
            type: 'news',
            category: 'Entretenimiento',
            title: 'Los videojuegos más esperados del año',
            description: 'La industria de los videojuegos se prepara para lanzamientos históricos.',
            imageUrl: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=400',
            source: 'Gaming World',
            url: 'https://www.ign.com/upcoming',
            publishedAt: Date.now() - 14400000
        },
        {
            id: 'news-fallback-5',
            type: 'news',
            category: 'Tecnología',
            title: 'El futuro de las redes sociales',
            description: 'Expertos analizan hacia dónde se dirigen las plataformas sociales en 2025.',
            imageUrl: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400',
            source: 'Social Media Today',
            url: 'https://www.socialmediatoday.com/',
            publishedAt: Date.now() - 18000000
        }
    ];
}

// Create news card element
export function createNewsElement(newsItem) {
    const article = document.createElement('article');
    article.className = 'post news-post';
    article.dataset.newsId = newsItem.id;

    const timeAgo = getTimeAgo(newsItem.publishedAt);
    const categoryIcon = newsItem.category === 'Tecnología' ? 'cpu' : 'film';
    const categoryColor = newsItem.category === 'Tecnología' ? 'tech' : 'entertainment';

    // Sanitize all external API content
    const safeTitle = sanitizeHTML(newsItem.title || '');
    const safeSource = sanitizeHTML(newsItem.source || 'Fuente');
    const safeDescription = sanitizeHTML(newsItem.description || '');
    const safeImageUrl = safeUrl(newsItem.imageUrl, '');
    const safeNewsUrl = safeUrl(newsItem.url, '#');
    const safeCategory = sanitizeHTML(newsItem.category || '');

    article.innerHTML = `
        <div class="news-badge ${categoryColor}">
            <i data-lucide="${categoryIcon}"></i>
            <span>${safeCategory}</span>
        </div>
        <div class="post-layout news-layout">
            <div class="news-source-avatar">
                <i data-lucide="newspaper"></i>
            </div>
            <div class="post-body">
                <header class="post-header">
                    <span class="post-user-name news-source">${safeSource}</span>
                    <span class="post-time">· ${timeAgo}</span>
                </header>
                <div class="post-content news-content">
                    <h3 class="news-title">${safeTitle}</h3>
                    <p class="news-description">${safeDescription}</p>
                </div>
                ${safeImageUrl ? `
                    <div class="post-media news-media">
                        <img src="${safeImageUrl}" alt="${safeAttr(newsItem.title || '')}" loading="lazy">
                    </div>
                ` : ''}
                <footer class="post-footer news-footer">
                    <a href="${safeNewsUrl}" target="_blank" rel="noopener noreferrer" class="news-link">
                        <i data-lucide="external-link"></i>
                        <span>Leer más</span>
                    </a>
                    <div class="post-action action-share" data-url="${safeNewsUrl}">
                        <i data-lucide="share"></i>
                    </div>
                </footer>
            </div>
        </div>
    `;

    return article;
}

// Get cached news
export function getCachedNews() {
    return cachedNews;
}

// Clear news cache
export function clearNewsCache() {
    cachedNews = [];
    lastFetchTime = 0;
}
