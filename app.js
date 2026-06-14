/**
 * Triovium Main Application - API Edition
 * Beheert het filteren, sorteren en renderen van producten via Bol.com API
 */

// Wacht tot de DOM volledig is geladen
document.addEventListener('DOMContentLoaded', function() {
    // DOM elementen
    const productGrid = document.getElementById('product-grid');
    const shopFilter = document.getElementById('shop-filter');
    const sortSelect = document.getElementById('sort-by');
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');

    // Huidige staat
    let currentProducts = [];
    let currentFilter = 'all';
    let currentSort = 'price-asc';
    let currentSearch = '';

    /**
     * Filter producten op basis van geselecteerde winkel en zoekterm
     */
    function filterProducts() {
        let filteredProducts = currentProducts;

        // Filter op winkel
        if (currentFilter !== 'all') {
            filteredProducts = filteredProducts.filter(product =>
                product.shop.toLowerCase() === currentFilter.toLowerCase()
            );
        }

        // Filter op zoekterm
        if (currentSearch) {
            const searchTerm = currentSearch.toLowerCase();
            filteredProducts = filteredProducts.filter(product =>
                product.name.toLowerCase().includes(searchTerm) ||
                (product.category && product.category.toLowerCase().includes(searchTerm)) ||
                product.shop.toLowerCase().includes(searchTerm)
            );
        }

        return filteredProducts;
    }

    /**
     * Sorteer producten op basis van geselecteerde optie
     */
    function sortProducts(products) {
        return [...products].sort((a, b) => {
            switch(currentSort) {
                case 'price-asc':
                    return a.price - b.price;
                case 'price-desc':
                    return b.price - a.price;
                case 'name-asc':
                    return a.name.localeCompare(b.name);
                case 'name-desc':
                    return b.name.localeCompare(a.name);
                default:
                    return 0;
            }
        });
    }

    /**
     * Render de producten in het grid
     */
    function renderProducts() {
        // Filter en sorteer producten
        let productsToRender = filterProducts();
        productsToRender = sortProducts(productsToRender);

        // Leeg het grid
        productGrid.innerHTML = '';

        if (productsToRender.length === 0) {
            productGrid.innerHTML = '<p class="no-products">Geen producten gevonden die aan uw criteria voldoen.</p>';
            return;
        }

        // Maak productkaarten
        productsToRender.forEach(product => {
            const productCard = document.createElement('div');
            productCard.className = 'product-card';
            productCard.innerHTML = `
                <div class="product-image">
                    <span>Afbeelding: ${product.image}</span>
                </div>
                <div class="product-info">
                    <h3 class="product-name">${product.name}</h3>
                    <div class="product-price">€ ${product.price.toFixed(2).replace('.', ',')}</div>
                    <div class="product-shop shop-${product.shop.toLowerCase()}">${product.shop}</div>
                    <a href="${product.affiliateUrl}" class="deal-button" target="_blank" rel="noopener noreferrer">Bekijk deal</a>
                </div>
            `;
            productGrid.appendChild(productCard);
        });
    }

    /**
     * Event handlers voor filters en sortering
     */
    shopFilter.addEventListener('change', function() {
        currentFilter = this.value;
        renderProducts();
    });

    sortSelect.addEventListener('change', function() {
        currentSort = this.value;
        renderProducts();
    });

    // Event handler voor zoeken - update voor API
    searchButton.addEventListener('click', async function() {
        currentSearch = searchInput.value.trim();
        if (currentSearch) {
            try {
                currentProducts = await DataService.searchProducts(currentSearch);
                renderProducts();
            } catch (error) {
                console.error('Fout bij zoeken:', error.message);
            }
        } else {
            // Als zoekveld leeg is, laad alle producten
            initializeApp();
        }
    });

    // Event handler voor Enter-toets in zoekveld - update voor API
    searchInput.addEventListener('keypress', async function(e) {
        if (e.key === 'Enter') {
            currentSearch = searchInput.value.trim();
            if (currentSearch) {
                try {
                    currentProducts = await DataService.searchProducts(currentSearch);
                    renderProducts();
                } catch (error) {
                    console.error('Fout bij zoeken:', error.message);
                }
            } else {
                initializeApp();
            }
        }
    });

    // Initialiseer de applicatie
    async function initializeApp() {
        try {
            console.log('Triovium applicatie initialiseren (API-modus)...');

            // Laad producten van de API
            currentProducts = await DataService.getAllProducts();
            renderProducts();

            console.log('Triovium applicatie geladen');
            console.log('Totaal beschikbare producten:', currentProducts.length);
        } catch (error) {
            console.error('Fout bij initialiseren applicatie:', error.message);
            // Toon foutmelding aan gebruiker
            productGrid.innerHTML = `
                <div class="error-message">
                    <h3>Fout bij laden producten</h3>
                    <p>Er is een fout opgetreden bij het ophalen van productdata.</p>
                    <p>Controleer uw internetverbinding of probeer later opnieuw.</p>
                    <button id="retry-button" class="deal-button">Opnieuw proberen</button>
                </div>
            `;

            // Voeg retry functionaliteit toe
            document.getElementById('retry-button')?.addEventListener('click', initializeApp);
        }
    }

    // Start de applicatie
    initializeApp();
});