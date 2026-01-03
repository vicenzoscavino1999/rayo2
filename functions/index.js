/**
 * GNews API Proxy - Firebase Cloud Function
 * Keeps API key secure on server side
 */

const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

// Define secret for API key (set via firebase functions:secrets:set GNEWS_API_KEY)
const gnewsApiKey = defineSecret("GNEWS_API_KEY");

// Global options for cost control
setGlobalOptions({ maxInstances: 10 });

/**
 * GNews Proxy Function
 * Proxies requests to GNews API with server-side API key
 * 
 * Query params:
 * - category: 'technology' | 'entertainment' (required)
 * - lang: language code (default: 'es')
 * - country: country code (default: 'mx')
 * - max: max results (default: 5)
 */
exports.gnewsProxy = onRequest(
    {
        cors: true,
        secrets: [gnewsApiKey]
    },
    async (req, res) => {
        try {
            // Only allow GET
            if (req.method !== "GET") {
                res.status(405).json({ error: "Method not allowed" });
                return;
            }

            // Get params
            const category = req.query.category || "technology";
            const lang = req.query.lang || "es";
            const country = req.query.country || "mx";
            const max = Math.min(parseInt(req.query.max) || 5, 10); // Cap at 10

            // Validate category
            if (!["technology", "entertainment", "general"].includes(category)) {
                res.status(400).json({ error: "Invalid category" });
                return;
            }

            // Get API key from secret
            const apiKey = gnewsApiKey.value();
            if (!apiKey) {
                logger.error("GNEWS_API_KEY secret not configured");
                res.status(500).json({ error: "API key not configured" });
                return;
            }

            // Build GNews URL
            const gnewsUrl = `https://gnews.io/api/v4/top-headlines?category=${category}&lang=${lang}&country=${country}&max=${max}&apikey=${apiKey}`;

            // Fetch from GNews
            const response = await fetch(gnewsUrl);

            if (!response.ok) {
                logger.error("GNews API error", { status: response.status });
                res.status(response.status).json({ error: "GNews API error" });
                return;
            }

            const data = await response.json();

            // Return articles
            res.json(data);

        } catch (error) {
            logger.error("Proxy error", { error: error.message });
            res.status(500).json({ error: "Internal server error" });
        }
    }
);
