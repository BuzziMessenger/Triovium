/**
 * Triovium Data Service - Geïntegreerd met API Service
 *
 * Dit bestand fungeert nu als bridge tussen de API service en de UI.
 * Alle productdata komt nu van de Bol.com API via de apiService.
 */

// Haal alle producten op van de API service
async function getAllProducts() {
    try {
        // Controleer of de API service beschikbaar is
        if (typeof window.TrioviumApiService === 'undefined') {
            console.warn('API Service niet beschikbaar, gebruik fallback data');
            return getFallbackProducts();
        }

        // Haal producten op van de API
        const products = await window.TrioviumApiService.getProducts();
        console.log(`API producten geladen: ${products.length} producten`);
        return products;
    } catch (error) {
        console.error('Fout bij laden producten via API:', error.message);
        // Gebruik fallback data als de API niet werkt
        return getFallbackProducts();
    }
}

/**
 * Zoek producten via de API
 */
async function searchProducts(query) {
    try {
        if (typeof window.TrioviumApiService === 'undefined') {
            return getFallbackProducts().filter(product =>
                product.name.toLowerCase().includes(query.toLowerCase())
            );
        }

        const products = await window.TrioviumApiService.searchProducts(query);
        return products;
    } catch (error) {
        console.error('Fout bij zoeken via API:', error.message);
        return getFallbackProducts().filter(product =>
            product.name.toLowerCase().includes(query.toLowerCase())
        );
    }
}

/**
 * Fallback producten voor wanneer de API niet beschikbaar is
 */
function getFallbackProducts() {
    console.warn('Gebruik fallback productdata');
    return [
        {
            name: "Product laden...",
            price: 0,
            shop: "Bol.com",
            affiliateUrl: "#",
            image: "placeholder.jpg",
            loading: true
        }
    ];
}

/**
 * Wis alle gecachte data
 */
function clearCache() {
    if (typeof window.TrioviumApiService !== 'undefined') {
        window.TrioviumApiService.clearCache();
    }
    console.log('Cache gewist');
}

// Exporteer functies voor gebruik in andere modules
window.DataService = {
    getAllProducts,
    searchProducts,
    clearCache
};

// Log voor debug doeleinden
console.log('Triovium Data Service geïnitialiseerd (API-modus)');
