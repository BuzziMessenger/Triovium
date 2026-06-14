/**
 * Triovium API Service - Bol.com Marketing Catalog API Integratie
 *
 * Deze service haalt live productdata op van de Bol.com API met:
 * - OAuth2 authenticatie
 * - 1-uurs caching in localStorage
 * - Automatische fallback bij API fouten
 * - Fouttolerantie en retry mechanismen
 */

class TrioviumApiService {
    constructor() {
        // Configuratie - VUL HIER UW BOL.COM API CREDENTIALS IN
        this.config = {
            clientId: 'UW_BOL_CLIENT_ID',          // Vervang door uw Client ID uit Bol dashboard
            clientSecret: 'UW_BOL_CLIENT_SECRET',  // Vervang door uw Client Secret
            apiBaseUrl: 'https://api.bol.com/catalog/v4',
            tokenUrl: 'https://login.bol.com/token',
            cacheExpiryMinutes: 60,                // Cache duur: 1 uur
            maxRetries: 2,                         // Maximaal aantal retry pogingen
            retryDelay: 1000                      // Vertraging tussen retries (ms)
        };

        // Huidige access token
        this.accessToken = null;
        this.tokenExpiry = null;

        // Cache sleutels voor localStorage
        this.cacheKeys = {
            products: 'triovium_products_cache',
            token: 'triovium_api_token',
            timestamp: 'triovium_cache_timestamp'
        };
    }

    /**
     * Initialiseer de API service
     */
    initialize() {
        console.log('Triovium API Service geïnitialiseerd');
        this.loadCachedToken();
    }

    /**
     * Laad opgeslagen token uit localStorage
     */
    loadCachedToken() {
        try {
            const cachedToken = localStorage.getItem(this.cacheKeys.token);
            const tokenExpiry = localStorage.getItem('triovium_token_expiry');

            if (cachedToken && tokenExpiry) {
                const expiryTime = parseInt(tokenExpiry);
                if (expiryTime > Date.now()) {
                    this.accessToken = cachedToken;
                    this.tokenExpiry = expiryTime;
                    console.log('Gebruik gecachte access token (verloopt op:', new Date(expiryTime).toLocaleString() + ')');
                }
            }
        } catch (error) {
            console.error('Fout bij laden gecachte token:', error.message);
        }
    }

    /**
     * Haal een nieuw access token op via OAuth2 Client Credentials flow
     */
    async getAccessToken() {
        // Als we al een geldige token hebben, gebruik die
        if (this.accessToken && this.tokenExpiry && this.tokenExpiry > Date.now()) {
            return this.accessToken;
        }

        try {
            console.log('Nieuwe access token aanvragen bij Bol.com...');

            // Base64 encode van client credentials
            const authString = btoa(`${this.config.clientId}:${this.config.clientSecret}`);
            const params = new URLSearchParams();
            params.append('grant_type', 'client_credentials');

            const response = await fetch(this.config.tokenUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${authString}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params
            });

            if (!response.ok) {
                throw new Error(`Token aanvraag mislukt: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // Sla token op met vervaldatum (Bol tokens zijn meestal 1 uur geldig)
            this.accessToken = data.access_token;
            this.tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;

            // Sla token op in localStorage voor hergebruik
            localStorage.setItem(this.cacheKeys.token, this.accessToken);
            localStorage.setItem('triovium_token_expiry', this.tokenExpiry.toString());

            console.log('Nieuwe access token ontvangen (verloopt over:', data.expires_in, 'seconden)');
            return this.accessToken;
        } catch (error) {
            console.error('Fout bij aanvragen access token:', error.message);
            throw error;
        }
    }

    /**
     * Haal producten op van de Bol.com API met caching
     *
     * @param {Object} params - Zoekparameters (optioneel)
     * @param {boolean} forceRefresh - Forceer vernieuwen van cache
     * @returns {Promise<Array>} Array van producten
     */
    async getProducts(params = {}, forceRefresh = false) {
        // Controleer of we gecachte data hebben die nog geldig is
        const cachedData = this.getCachedProducts();
        if (cachedData && !forceRefresh) {
            console.log('Gebruik gecachte productdata');
            return cachedData;
        }

        try {
            // Haal access token op
            const token = await this.getAccessToken();

            // Bouw API URL met parameters
            const url = new URL(`${this.config.apiBaseUrl}/products`);
            Object.keys(params).forEach(key => {
                if (params[key]) {
                    url.searchParams.append(key, params[key]);
                }
            });

            console.log('Producten ophalen van Bol.com API:', url.toString());

            // Voer API request uit met retry logica
            let response;
            for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
                try {
                    response = await fetch(url.toString(), {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/vnd.retailer.v4+json'
                        }
                    });

                    if (response.ok) {
                        break; // Succes, verlaat de retry loop
                    }

                    if (attempt < this.config.maxRetries) {
                        console.warn(`Poging ${attempt} mislukt, wacht ${this.config.retryDelay}ms voor retry...`);
                        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                    }
                } catch (error) {
                    if (attempt === this.config.maxRetries) {
                        throw error;
                    }
                    console.warn(`Poging ${attempt} mislukt:`, error.message);
                    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                }
            }

            if (!response.ok) {
                throw new Error(`API request mislukt: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const products = this.transformBolProducts(data.products || []);

            // Sla producten op in cache
            this.cacheProducts(products);

            return products;
        } catch (error) {
            console.error('Fout bij ophalen producten van Bol.com API:', error.message);

            // Als we gecachte data hebben, gebruik die als fallback
            if (cachedData) {
                console.log('Gebruik gecachte data als fallback');
                return cachedData;
            }

            // Als er helemaal geen data is, gooi een fout
            throw new Error('Kon geen productdata ophalen en geen cache beschikbaar');
        }
    }

    /**
     * Transformeer Bol.com API producten naar Triovium formaat
     */
    transformBolProducts(bolProducts) {
        return bolProducts.map(product => ({
            name: product.title,
            price: product.offerData.offers[0]?.price || 0,
            shop: 'Bol.com',
            affiliateUrl: product.urls[0]?.value || '#',
            image: product.images[0]?.url || 'placeholder.jpg',
            productId: product.id,
            ean: product.ean,
            category: product.categoryPath?.join(' > ') || 'Onbekend',
            rating: product.reviews?.rating?.average || 0,
            stock: product.offerData.offers[0]?.stock || 0
        }));
    }

    /**
     * Haal gecachte producten uit localStorage
     */
    getCachedProducts() {
        try {
            const cachedProducts = localStorage.getItem(this.cacheKeys.products);
            const cacheTimestamp = localStorage.getItem(this.cacheKeys.timestamp);

            if (cachedProducts && cacheTimestamp) {
                const cacheTime = parseInt(cacheTimestamp);
                const currentTime = Date.now();
                const cacheAgeMinutes = (currentTime - cacheTime) / (1000 * 60);

                if (cacheAgeMinutes < this.config.cacheExpiryMinutes) {
                    console.log(`Gecachte data is nog geldig (${cacheAgeMinutes.toFixed(1)} van ${this.config.cacheExpiryMinutes} minuten)`);
                    return JSON.parse(cachedProducts);
                } else {
                    console.log(`Gecachte data is verlopen (${cacheAgeMinutes.toFixed(1)} van ${this.config.cacheExpiryMinutes} minuten)`);
                }
            }
        } catch (error) {
            console.error('Fout bij laden gecachte producten:', error.message);
        }

        return null;
    }

    /**
     * Sla producten op in localStorage cache
     */
    cacheProducts(products) {
        try {
            const cacheData = JSON.stringify(products);
            localStorage.setItem(this.cacheKeys.products, cacheData);
            localStorage.setItem(this.cacheKeys.timestamp, Date.now().toString());
            console.log(`Producten gecached (${products.length} producten, geldig voor ${this.config.cacheExpiryMinutes} minuten)`);
        } catch (error) {
            console.error('Fout bij cachen van producten:', error.message);
        }
    }

    /**
     * Wis alle gecachte data
     */
    clearCache() {
        try {
            localStorage.removeItem(this.cacheKeys.products);
            localStorage.removeItem(this.cacheKeys.timestamp);
            localStorage.removeItem(this.cacheKeys.token);
            localStorage.removeItem('triovium_token_expiry');
            this.accessToken = null;
            this.tokenExpiry = null;
            console.log('Alle cache data gewist');
        } catch (error) {
            console.error('Fout bij wissen cache:', error.message);
        }
    }

    /**
     * Zoek producten op basis van zoekterm
     */
    async searchProducts(query, params = {}) {
        const searchParams = {
            q: query,
            limit: 24,
            ...params
        };

        return this.getProducts(searchParams);
    }

    /**
     * Haal producten uit een specifieke categorie
     */
    async getCategoryProducts(categoryId, params = {}) {
        const categoryParams = {
            categoryId: categoryId,
            limit: 24,
            ...params
        };

        return this.getProducts(categoryParams);
    }
}

// Exporteer de API service
const apiService = new TrioviumApiService();
apiService.initialize();

// Maak beschikbaar voor andere modules
window.TrioviumApiService = apiService;

// Log voor debug doeleinden
console.log('Triovium API Service is klaar voor gebruik');