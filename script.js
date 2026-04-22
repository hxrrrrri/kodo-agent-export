const products = [
    { id: 1, name: "Sharp Stone", price: 10, category: "stone", emoji: "🪨" },
    { id: 2, name: "Heavy Rock", price: 20, category: "stone", emoji: "🌑" },
    { id: 3, name: "Wooden Club", price: 15, category: "wood", emoji: "🪵" },
    { id: 4, name: "Bamboo Spear", price: 25, category: "wood", emoji: "🎋" },
    { id: 5, name: "Bone Needle", price: 5, category: "bone", emoji: "🦴" },
    { id: 6, name: "Mammoth Tooth", price: 50, category: "bone", emoji: "🦷" },
    { id: 7, name: "Flint Axe", price: 30, category: "stone", emoji: "🪓" },
    { id: 8, name: "Dry Branch", price: 2, category: "wood", emoji: "🌿" },
];

let cart = [];

function renderProducts(filter = 'all') {
    const grid = document.getElementById('product-grid');
    grid.innerHTML = '';

    const filtered = filter === 'all' 
        ? products 
        : products.filter(p => p.category === filter);

    filtered.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="product-img">${p.emoji}</div>
            <div class="product-info">
                <h3>${p.name}</h3>
                <p class="product-price">${p.price} shells</p>
                <button class="add-btn" onclick="addToCart(${p.id})">Grab Loot</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function filterProducts(cat) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if(btn.innerText.toLowerCase() === cat) btn.classList.add('active');
        if(cat === 'all' && btn.innerText === 'All') btn.classList.add('active');
    });
    renderProducts(cat);
}

function addToCart(id) {
    const product = products.find(p => p.id === id);
    cart.push(product);
    updateCart();
}

function updateCart() {
    const count = document.getElementById('cart-count');
    const itemsDiv = document.getElementById('cart-items');
    const totalSpan = document.getElementById('cart-total');

    count.innerText = cart.length;
    itemsDiv.innerHTML = '';

    let total = 0;
    cart.forEach((item, index) => {
        total += item.price;
        const itemEl = document.createElement('div');
        itemEl.className = 'cart-item';
        itemEl.innerHTML = `
            <span>${item.name}</span>
            <span>${item.price} shells <button onclick="removeFromCart(${index})">❌</button></span>
        `;
        itemsDiv.appendChild(itemEl);
    });

    totalSpan.innerText = total;
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCart();
}

function toggleCart() {
    document.getElementById('cart-sidebar').classList.toggle('open');
}

// Init
renderProducts();
