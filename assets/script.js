/* script.js - refactored from inline script in index.html
   Organized modules:
   - Background Engine
   - UI Interactions / Reveal / Clock
   - Data Loading
   - Carousel / Swiper inits
   - Viewer & Hotspots / Modal Logic
   Keep global function names & IDs to maintain backward compatibility.
*/

console.log('script.js loaded')

/* -------------------- Theme Config -------------------- */
const CozySpotConfig = window.CozySpot || {}
const CozySpotRoutes = CozySpotConfig.routes || {}
const dataUrl = CozySpotConfig.dataUrl || 'data.json'
const fallbackImage = CozySpotConfig.fallbackImage || ''
const assetBase = CozySpotConfig.assetBase || ''
const currencySymbol = CozySpotConfig.currencySymbol || '$'
const getCollectionsUrl = () => CozySpotRoutes.collections || '/collections'
const getShowcaseUrl = () => CozySpotRoutes.showcase || '#showcase'
const getProductUrl = handle => {
	if (!handle) return '#'
	const base = (CozySpotRoutes.productBase || '/products').replace(/\/$/, '')
	return `${base}/${handle}`
}

const resolveAssetImage = value => {
	if (!value) return fallbackImage
	if (
		value.startsWith('http://') ||
		value.startsWith('https://') ||
		value.startsWith('//') ||
		value.startsWith('/') ||
		value.startsWith('data:')
	) {
		return value
	}
	return assetBase ? `${assetBase}${value}` : value
}

const normalizeDataImages = data => {
	if (!data || typeof data !== 'object') return data
	const fix = obj => {
		if (!obj || typeof obj !== 'object') return
		if (typeof obj.image === 'string')
			obj.image = resolveAssetImage(obj.image)
		if (typeof obj.img === 'string') obj.img = resolveAssetImage(obj.img)
		if (Array.isArray(obj.images)) {
			obj.images = obj.images.map(img => resolveAssetImage(img))
		}
		if (Array.isArray(obj.products)) obj.products.forEach(p => fix(p))
		if (Array.isArray(obj.hotspots)) obj.hotspots.forEach(h => fix(h))
		Object.keys(obj).forEach(key => {
			const val = obj[key]
			if (val && typeof val === 'object') fix(val)
		})
	}
	fix(data)
	return data
}

const formatMoneyFromCents = cents => {
	if (cents === null || cents === undefined) return null
	const value = typeof cents === 'string' ? parseFloat(cents) : cents
	if (Number.isNaN(value)) return null
	return (value / 100).toFixed(2)
}

const mapLiquidProductToPdp = liquidProduct => {
	if (!liquidProduct) return null
	const images = Array.isArray(liquidProduct.images)
		? liquidProduct.images.map(img => resolveAssetImage(img?.src || img))
		: []
	const variants = Array.isArray(liquidProduct.variants)
		? liquidProduct.variants.map(v => ({
				id: v.id,
				title: v.title,
				sku: v.sku,
				available: v.available,
				price: formatMoneyFromCents(v.price),
				image: resolveAssetImage(v.featured_image?.src || v.image),
				options: v.options || v.selectedOptions,
			}))
		: []
	const price = formatMoneyFromCents(liquidProduct.price)
	const oldPrice = formatMoneyFromCents(liquidProduct.compare_at_price)
	return {
		source: 'shopify',
		id: liquidProduct.id,
		handle: liquidProduct.handle,
		title: liquidProduct.title,
		description: liquidProduct.description || '',
		full_description: liquidProduct.description || '',
		vendor: liquidProduct.vendor,
		category: liquidProduct.type,
		tags: liquidProduct.tags || [],
		images: images.length ? images : [fallbackImage],
		price: price || 'N/A',
		old_price: oldPrice || null,
		currency: currencySymbol,
		sku: variants[0]?.sku,
		available: liquidProduct.available,
		quantity_available: null,
		variants,
		options: liquidProduct.options || [],
	}
}

/* -------------------- Background Engine -------------------- */
;(function BackgroundEngine() {
	// Nothing heavy to init here for now; ambient background shapes are CSS-driven.
	// Provide helper to create ambient shooting stars if needed programmatically.
	function createShootingStar(parent) {
		const s = document.createElement('div')
		s.className = 'shooting-star'
		parent.appendChild(s)
		return s
	}
	// expose if needed
	window.BackgroundEngine = { createShootingStar }
})()

/* -------------------- UI Interactions & Reveal -------------------- */
const runReveal = () => {
	const observer = new IntersectionObserver(
		entries => {
			entries.forEach(entry => {
				if (entry.isIntersecting) entry.target.classList.add('active')
			})
		},
		{ threshold: 0.1 },
	)
	document.querySelectorAll('.reveal').forEach(el => observer.observe(el))
}
window.addEventListener('DOMContentLoaded', runReveal)

/* -------------------- Mobile Menu (Event Delegation) -------------------- */
// Using event delegation so it works regardless of when navigation.html loads
// Удалена устаревшая event delegation логика для мобильного меню (см. ниже для актуальной реализации)

// Keep runMenuScripts for backward compatibility (does nothing now)
function runMenuScripts() {
	console.log('runMenuScripts called (event delegation active)')
}

// Smooth scroll to section
function scrollToSection(sectionId) {
	const section = document.getElementById(sectionId)
	if (section) {
		section.scrollIntoView({ behavior: 'smooth', block: 'start' })
	}
}

// Open cart panel (triggers cart button click)
function openCartPanel() {
	const cartBtn =
		document.querySelector('[onclick*="toggleCart"]') ||
		document.getElementById('cart-toggle-btn')
	if (cartBtn) {
		cartBtn.click()
	} else {
		// Fallback: find cart panel and open it
		const cartPanel = document.getElementById('cart-panel')
		if (cartPanel) {
			cartPanel.classList.add('open')
		}
	}
}

// Live clock
setInterval(() => {
	const clock = document.getElementById('live-clock')
	if (clock) clock.textContent = new Date().toTimeString().split(' ')[0]
}, 1000)

// Mouse coords reaction
let _mouseTick = false,
	_mouseX = 0,
	_mouseY = 0
document.addEventListener('mousemove', e => {
	_mouseX = e.clientX
	_mouseY = e.clientY
	if (!_mouseTick) {
		_mouseTick = true
		requestAnimationFrame(() => {
			const x = (_mouseX / window.innerWidth - 0.5) * 60
			const y = (_mouseY / window.innerHeight - 0.5) * 60
			const mainSpot = document.getElementById('main-spot')
			if (mainSpot) mainSpot.style.transform = `translate(${x}px, ${y}px)`
			const coords = document.getElementById('mouse-coords')
			if (coords) coords.textContent = `X: ${_mouseX} // Y: ${_mouseY}`
			_mouseTick = false
		})
	}
})

/* -------------------- Shopify Integration -------------------- */
let shopifyConfig = null
const productCache = new Map() // Кэш товаров по handle

// Публичная загрузка товара через /products/{handle}.js (без токена)
async function fetchPublicProduct(handle) {
	if (!handle) return null

	// Проверяем кэш
	if (productCache.has(handle)) {
		return productCache.get(handle)
	}

	try {
		const response = await fetch(`/products/${handle}.js`)
		if (!response.ok)
			throw new Error(`Public product error: ${response.status}`)
		const product = await response.json()

		const firstVariant = product.variants?.[0] || null
		const currency =
			window?.Shopify?.currency?.active ||
			window?.Shopify?.currency?.default ||
			'USD'
		const toPrice = value =>
			typeof value === 'number' ? (value / 100).toFixed(2) : null

		const formatted = {
			id: product.id,
			handle: product.handle,
			product_name: product.title,
			title: product.title,
			description: product.description || '',
			img: product.featured_image || product.images?.[0] || '',
			images: product.images || [],
			price: firstVariant ? toPrice(firstVariant.price) : null,
			currency,
			compareAtPrice: firstVariant
				? toPrice(firstVariant.compare_at_price)
				: null,
			available: product.available,
			variants:
				product.variants?.map(v => ({
					id: v.id,
					title: v.title,
					price: toPrice(v.price),
					available: v.available,
				})) || [],
			vendor: product.vendor,
			productType: product.type,
			tags: product.tags || [],
		}

		productCache.set(handle, formatted)
		return formatted
	} catch (err) {
		console.error(`Failed to fetch public product "${handle}":`, err)
		return null
	}
}

// Загрузка товара из Shopify по handle
async function fetchShopifyProduct(handle) {
	if (!handle) return null

	// Проверяем кэш
	if (productCache.has(handle)) {
		return productCache.get(handle)
	}

	const canUseStorefront =
		shopifyConfig?.store_domain &&
		shopifyConfig?.storefront_access_token &&
		shopifyConfig.storefront_access_token !== 'PASTE_STOREFRONT_TOKEN_HERE'

	if (!canUseStorefront) {
		return fetchPublicProduct(handle)
	}

	const query = `{
		product(handle: "${handle}") {
			id
			handle
			title
			description
			images(first: 3) {
				edges {
					node {
						url
						altText
					}
				}
			}
			variants(first: 5) {
				edges {
					node {
						id
						title
						price {
							amount
							currencyCode
						}
						compareAtPrice {
							amount
						}
						availableForSale
					}
				}
			}
			vendor
			productType
			tags
		}
	}`

	try {
		const response = await fetch(
			`https://${shopifyConfig.store_domain}/api/2024-01/graphql.json`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Shopify-Storefront-Access-Token':
						shopifyConfig.storefront_access_token,
				},
				body: JSON.stringify({ query }),
			},
		)

		if (!response.ok)
			throw new Error(`Shopify API error: ${response.status}`)

		const data = normalizeDataImages(await response.json())
		const product = data?.data?.product

		if (product) {
			// Преобразуем в удобный формат
			const formatted = {
				id: product.id,
				handle: product.handle,
				product_name: product.title,
				title: product.title,
				description: product.description,
				img: product.images?.edges?.[0]?.node?.url || '',
				images: product.images?.edges?.map(e => e.node.url) || [],
				price:
					product.variants?.edges?.[0]?.node?.price?.amount || null,
				currency:
					product.variants?.edges?.[0]?.node?.price?.currencyCode ||
					'USD',
				compareAtPrice:
					product.variants?.edges?.[0]?.node?.compareAtPrice
						?.amount || null,
				available:
					product.variants?.edges?.[0]?.node?.availableForSale ??
					true,
				variants:
					product.variants?.edges?.map(e => ({
						id: e.node.id,
						title: e.node.title,
						price: e.node.price?.amount,
						available: e.node.availableForSale,
					})) || [],
				vendor: product.vendor,
				productType: product.productType,
				tags: product.tags,
			}

			// Сохраняем в кэш
			productCache.set(handle, formatted)
			return formatted
		}

		return null
	} catch (err) {
		console.error(`Failed to fetch Shopify product "${handle}":`, err)
		return null
	}
}

// Загрузка нескольких товаров параллельно
async function fetchShopifyProducts(handles) {
	const results = await Promise.all(handles.map(h => fetchShopifyProduct(h)))
	return results.filter(Boolean)
}

// Обогащение hotspot данными из Shopify
async function enrichHotspotWithShopify(hotspot) {
	if (!hotspot.shopify_handle || hotspot.shopify_handle === '#') {
		// Нет shopify_handle - используем fallback если есть
		if (hotspot.fallback) {
			return {
				...hotspot,
				...hotspot.fallback,
				source: 'fallback',
				top: hotspot.top,
				left: hotspot.left,
			}
		}
		return hotspot
	}

	// Пытаемся загрузить из Shopify
	const product = await fetchShopifyProduct(hotspot.shopify_handle)

	if (product) {
		// Успешно загрузили из Shopify
		return {
			...hotspot,
			...product,
			source: 'shopify',
			top: hotspot.top,
			left: hotspot.left,
		}
	}

	// Shopify не ответил - используем fallback если есть
	if (hotspot.fallback) {
		return {
			...hotspot,
			...hotspot.fallback,
			source: 'fallback',
			top: hotspot.top,
			left: hotspot.left,
		}
	}

	return hotspot
}

// Обогащение всех hotspots в комнате
async function enrichRoomHotspots(room) {
	if (!room.hotspots || !room.hotspots.length) return room

	const enrichedHotspots = await Promise.all(
		room.hotspots.map(hs => enrichHotspotWithShopify(hs)),
	)

	return {
		...room,
		hotspots: enrichedHotspots,
	}
}

/* -------------------- Data Loading -------------------- */
let rooms = []
async function loadData() {
	const hasTargets =
		document.getElementById('main-wrapper') ||
		document.getElementById('demo-preview-wrapper') ||
		document.getElementById('dynamic-collection-grid') ||
		document.getElementById('global-viewer')
	if (!hasTargets || !dataUrl) return
	try {
		const res = await fetch(dataUrl)
		if (!res.ok) throw new Error(res.statusText)
		const json = normalizeDataImages(await res.json())

		// Сохраняем конфиг Shopify
		shopifyConfig = json.shopify_config || null

		rooms = json && json.gallery_scenes ? json.gallery_scenes : []
		populateMainWrapper()
		renderCollection()
		renderGallery()
		initDemoModule()
		// if swiper exists, update floating products
		if (typeof swiper !== 'undefined' && rooms && rooms.length)
			updateFloatingProducts(rooms[swiper.activeIndex % rooms.length])
	} catch (err) {
		console.error('Failed to load data.json', err)
	}
}

/* -------------------- Carousel / Grid rendering -------------------- */
function populateMainWrapper() {
	const wrapper = document.getElementById('main-wrapper')
	if (!wrapper) return
	wrapper.innerHTML = ''
	const frag = document.createDocumentFragment()
	rooms.forEach(room => {
		const slide = document.createElement('div')
		slide.className = 'swiper-slide'
		slide.setAttribute('data-room-id', room.id || room.title)
		slide.addEventListener('click', () =>
			openRoomViewer(room.id || room.title),
		)
		const img = document.createElement('img')
		img.src = room.image
		img.alt = room.title
		slide.appendChild(img)
		const caption = document.createElement('div')
		caption.className = 'absolute bottom-10 left-10'
		caption.innerHTML = `<h3 class="text-3xl font-black italic uppercase">${room.title}</h3>`
		slide.appendChild(caption)
		frag.appendChild(slide)
	})
	wrapper.appendChild(frag)
}

function renderCollection() {
	const container = document.getElementById('dynamic-collection-grid')
	if (!container) return
	if (!rooms.length) {
		container.innerHTML = ''
		return
	}
	const mainRoom = rooms[0]
	const displayRooms = rooms.slice(1, 4)
	const blurryRoom = rooms[4]
	const totalProducts = rooms.reduce(
		(s, r) => s + (r.hotspots ? r.hotspots.length : 0),
		0,
	)
	const remainingCount = rooms.length - 5
	container.innerHTML = `<div id="collection" class="max-w-7xl mx-auto px-6 py-24">
						     <div class="mb-16 reveal reveal-bottom flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
						         <div class="space-y-2">
						             <h2 class="text-6xl md:text-8xl font-black uppercase tracking-tighter italic leading-[0.8]">
						                 Curated<br><span class="text-transparent stroke-white" style="-webkit-text-stroke: 1px rgba(255,255,255,0.3)">Gallery</span>
						             </h2>
						         </div>
						     </div>

						     <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
						         <div class="lg:col-span-8 group reveal reveal-bottom relative overflow-hidden rounded-[2rem] group relative min-h-[320px] rounded-[2rem] border border-white/5 bg-gradient-to-b from-white/[0.05] to-transparent backdrop-blur-2xl transition-all duration-500 hover:-translate-y-3 hover:border-purple-500/40 hover:shadow-[0_20px_50px_-10px_rgba(168,85,247,0.2)] flex flex-col justify-between"
						              onclick="openRoomViewer('${mainRoom.id}')">
						             <div class="aspect-[16/10] h-full relative overflow-hidden">
						                 <img src="${
												mainRoom.image
											}" class="w-full h-full object-cover transition-transform duration-[1.5s] group-hover:scale-110" />
						                 <div class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-90"></div>
						                 <div class="absolute bottom-0 left-0 p-8">
						                     <h4 class="text-4xl font-black uppercase italic text-white tracking-tighter">${
													mainRoom.title
												}</h4>
						                     <p class="text-white/50 text-[10px] uppercase tracking-[0.3em] mt-1">Primary Setup Protocol</p>
						                 </div>
						             </div>
						         </div>

						         <div class="lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 gap-6">
						             ${displayRooms
											.map(
												room => `
						                 <div class="group reveal reveal-right relative overflow-hidden rounded-[1.5rem] bg-zinc-900 border border-white/5 cursor-pointer transition-all duration-500 hover:border-white/20"
						                      onclick="openRoomViewer('${room.id}')">
						                     <div class="aspect-square lg:aspect-[16/7] relative overflow-hidden">
						                         <img src="${room.image}" class="w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700" />
						                         <div class="absolute bottom-4 left-4">
						                             <h5 class="text-xs font-black uppercase italic text-white">${room.title}</h5>
						                         </div>
						                     </div>
						                 </div>
						             `,
											)
											.join('')}

									 <a href="${getShowcaseUrl()}" class="group relative reveal reveal-right overflow-hidden rounded-[1.5rem] bg-zinc-900 border border-white/5 cursor-pointer">
						                 <div class="aspect-square lg:aspect-[16/7] relative overflow-hidden">
						                     <img src="${
													blurryRoom.image
												}" class="w-full h-full object-cover blur-md opacity-40 scale-110" />
						                     <div class="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
						                         <span class="text-4xl font-black text-white">+${
														remainingCount + 1
													}</span>
						                         <span class="text-[8px] text-purple-400 uppercase font-mono tracking-[0.2em] mt-1 font-bold">More Styles</span>
						                     </div>
						                 </div>
						             </a>
						         </div>
						     </div>

						     <div class="mt-12 reveal reveal-bottom grid grid-cols-2 md:grid-cols-4 gap-4 p-2 bg-white/5 rounded-[2.5rem] backdrop-blur-3xl border border-white/5">
						         <div class="flex flex-col items-center justify-center py-8 border-r border-white/5">
						             <span class="text-3xl font-black text-white leading-none">${
											rooms.length
										}</span>
						             <span class="text-[8px] text-white/30 uppercase tracking-[0.4em] mt-2 font-bold">Designs Ready</span>
						         </div>
						         <div class="flex flex-col items-center justify-center py-8 md:border-r border-white/5">
						             <span class="text-3xl font-black text-purple-500 leading-none">4.9</span>
						             <span class="text-[8px] text-white/30 uppercase tracking-[0.4em] mt-2 font-bold">Rating</span>
						         </div>
						         <div class="flex flex-col items-center justify-center py-8 border-r border-white/5">
						             <span class="text-3xl font-black text-white leading-none">${totalProducts}</span>
						             <span class="text-[8px] text-white/30 uppercase tracking-[0.4em] mt-2 font-bold">Unique Items</span>
						         </div>
						         <div class="flex flex-col items-center justify-center py-8">
									 <a href="${getShowcaseUrl()}" class="flex flex-col items-center group">
						                 <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center text-black group-hover:bg-purple-500 group-hover:text-white transition-all">
						                     <span class="text-sm">↗</span>
						                 </div>
						                 <div class="text-[8px] text-white/30 uppercase tracking-[0.4em] mt-2 font-bold group-hover:text-white transition-colors">Catalog</div>
						             </a>
						         </div>
						     </div>
						 </div>
`
	// Keep render implementation in JS file as in original if needed (kept minimal here)
}

/* -------------------- Floating products (product slots) -------------------- */
async function updateFloatingProducts(room) {
	const allSlots = document.querySelectorAll('.product-slot')
	allSlots.forEach(s => {
		s.classList.remove('visible')
		s.innerHTML = ''
		s.onclick = null
	})

	let items = []
	if (room) {
		if (room.inventory && room.inventory.length) {
			items = room.inventory.slice()
		} else if (room.hotspots && room.hotspots.length) {
			// Обрабатываем hotspots с fallback и Shopify
			items = await Promise.all(
				room.hotspots.map(async h => {
					// Если уже обогащён данными
					if (h._enriched || h.product_name) {
						return { ...h }
					}

					// Пытаемся загрузить из Shopify
					if (
						h.shopify_handle &&
						h.shopify_handle !== '#' &&
						shopifyConfig?.storefront_access_token !==
							'YOUR_STOREFRONT_ACCESS_TOKEN'
					) {
						const shopifyData = await fetchShopifyProduct(
							h.shopify_handle,
						)
						if (shopifyData) {
							return {
								...h,
								...shopifyData,
								source: 'shopify',
							}
						}
					}

					// Используем fallback данные
					if (h.fallback) {
						return {
							...h,
							...h.fallback,
							source: 'fallback',
						}
					}

					return { ...h }
				}),
			)
		} else if (room.products && Array.isArray(room.products)) {
			items = room.products.slice()
		}
	}

	// Фильтруем только товары с данными
	items = items.filter(
		item =>
			item.product_name ||
			item.name ||
			item.title ||
			item.fallback?.title,
	)

	if (!items.length) return

	const countToDisplay = Math.min(items.length, allSlots.length)
	setTimeout(() => {
		const randomSlotsIndices = [...Array(allSlots.length).keys()]
			.sort(() => 0.5 - Math.random())
			.slice(0, countToDisplay)
		randomSlotsIndices.forEach((slotIndex, i) => {
			const slot = allSlots[slotIndex]
			const product = items[i]

			// Получаем данные (из product напрямую или из fallback)
			const rawName =
				product.product_name ||
				product.name ||
				product.title ||
				'Product'
			const name =
				rawName.length > 24 ? rawName.slice(0, 24) + '...' : rawName
			const img = product.img || product.image || ''
			const price =
				product.price && product.price !== 'N/A' ? product.price : null
			const currencyCode = (product.currency || '')
				.toString()
				.toUpperCase()
			const currencySymbolLocal =
				currencyCode === 'EUR'
					? '€'
					: currencyCode === 'USD'
						? '$'
						: product.currency || '€'
			const rating = product.rating || null
			const reviewsCount = product.reviews_count || null
			const isFromShopify = product.source === 'shopify'

			// Рейтинг
			const ratingHtml = rating
				? `<div class="flex items-center gap-1 mt-1">
					<span class="text-yellow-500 text-[8px]">★</span>
					<span class="text-[8px] text-white/60">${rating}</span>
					${reviewsCount ? `<span class="text-[7px] text-white/30">(${reviewsCount})</span>` : ''}
				</div>`
				: ''

			// Индикатор источника данных
			const sourceIndicator = isFromShopify
				? null
				: product.source === 'fallback'
					? `<span class="text-[7px] text-white/30 uppercase tracking-wider">Preview</span>`
					: ''

			// Цена
			const priceHtml = price
				? `<div class="text-[9px] font-bold text-purple-400">${price}${currencySymbolLocal}</div>`
				: ''

			// Изображение или заглушка
			const imgHtml = img
				? `<img src="${img}" loading="lazy" class="w-full h-24 object-cover rounded-lg mb-2 shadow-lg transition-transform group-hover:scale-105" alt="${name}" onerror="this.parentElement.innerHTML='<div class=\\'w-full h-24 bg-zinc-800 rounded-lg mb-2 flex items-center justify-center\\'><span class=\\'text-purple-500\\'>✦</span></div>'" />`
				: `<div class="w-full h-24 bg-zinc-800/50 rounded-lg mb-2 flex items-center justify-center border border-white/5"><span class="text-purple-500/50 text-lg">✦</span></div>`

			slot.innerHTML = `
				<div class="relative group cursor-pointer" role="button" tabindex="0" title="${rawName}">
					${imgHtml}
					<div class="font-bold text-[10px] leading-tight group-hover:text-purple-400 transition-colors uppercase tracking-tight">${name}</div>
					${ratingHtml}
					<div class="flex justify-between items-center mt-1">
						${priceHtml}
						${sourceIndicator}
					</div>
				</div>
			`

			// Клик открывает Sheet с информацией о товаре
			slot.onclick = e => {
				e.stopPropagation()
				// Находим комнату и hotspot
				const roomIndex = rooms.findIndex(r => r.id === room.id)
				if (roomIndex !== -1) {
					openSheet(product)
				}
			}

			setTimeout(() => slot.classList.add('visible'), i * 120)
		})
	}, 300)
}

/* -------------------- Swiper inits (kept similar to original) -------------------- */
const swiper = new Swiper('.mySwiper', {
	effect: 'coverflow',
	centeredSlides: true,
	slidesPerView: 'auto',
	coverflowEffect: {
		rotate: 0,
		depth: 300,
		modifier: 1.5,
		slideShadows: false,
	},
	on: {
		slideChangeTransitionStart() {
			document.getElementById('prod-left')?.classList.remove('active')
			document.getElementById('prod-right')?.classList.remove('active')
		},
		slideChange() {
			const room = rooms[this.activeIndex % rooms.length]
			updateFloatingProducts(room)
			if (room.products) {
				document.getElementById('prod-img-left').src =
					room.products.left.img
				document.getElementById('prod-name-left').innerText =
					room.products.left.name
				document.getElementById('prod-price-left').innerText =
					room.products.left.price
				document.getElementById('prod-img-right').src =
					room.products.right.img
				document.getElementById('prod-name-right').innerText =
					room.products.right.name
				document.getElementById('prod-price-right').innerText =
					room.products.right.price
				setTimeout(() => {
					document.getElementById('prod-left').classList.add('active')
					document
						.getElementById('prod-right')
						.classList.add('active')
				}, 300)
			}
		},
	},
})

/* -------------------- Reviews Marquee (kept modular) -------------------- */
;(function initReviewsMarquee() {
	const marqueeReviews = [
		{
			text: 'Exceptional build quality and a timeless aesthetic—this setup keeps me focused.',
			author: 'Lena K.',
		},
		{
			text: 'Amazing attention to detail. The lighting makes evening work feel cinematic.',
			author: 'Marcus P.',
		},
		{
			text: 'Compact, premium, and delightful to use. My desk never looked better.',
			author: 'R. Thompson',
		},
		{
			text: 'Quality materials and thoughtful design. Highly recommend for creatives.',
			author: 'Sam H.',
		},
		{
			text: 'Perfect minimal setup—keeps clutter away and vibes on point.',
			author: 'Ava R.',
		},
	]
	document.addEventListener('DOMContentLoaded', () => {
		const wrapper = document.querySelector(
			'.reviewsMarqueeSwiper .swiper-wrapper',
		)
		if (!wrapper) return
		const slidesData = marqueeReviews.concat(marqueeReviews)
		wrapper.innerHTML = slidesData
			.map(
				r =>
					`<div class="swiper-slide w-[300px]"><div class="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-xl p-4 h-full flex flex-col justify-between"><div class="text-purple-500 text-sm mb-2">★★★★★</div><p class="italic text-white/80 text-sm leading-tight mb-3">${r.text}</p><div class="font-black italic uppercase text-xs tracking-widest">${r.author}</div></div></div>`,
			)
			.join('')
		new Swiper('.reviewsMarqueeSwiper', {
			slidesPerView: 'auto',
			spaceBetween: 16,
			speed: 5000,
			loop: true,
			autoplay: { delay: 0, disableOnInteraction: false },
			allowTouchMove: false,
		})
		document
			.querySelectorAll('.reviewsMarqueeSwiper .swiper-wrapper')
			.forEach(w => (w.style.transitionTimingFunction = 'linear'))
	})
})()

/* -------------------- Review rotator -------------------- */
;(function initReviewRotator() {
	const rotatingReviews = [
		{
			text: 'This desk elevated my workflow — focus has never been this effortless.',
			author: 'Claire M.',
		},
		{
			text: 'Attention to detail is unmatched. The lighting really sets the mood.',
			author: 'Marcus P.',
		},
		{
			text: 'A compact powerhouse for creative setups. Highly recommended.',
			author: 'R. Thompson',
		},
		{
			text: 'Sturdy, beautiful, and incredibly functional — perfect for long sessions.',
			author: 'Sam H.',
		},
		{
			text: 'Minimal design, maximum impact. My workspace finally feels complete.',
			author: 'Ava R.',
		},
		{
			text: 'Subtle, premium, and unbelievably comfortable to use daily.',
			author: 'Lena K.',
		},
	]
	const textEl = document.querySelector('.review-quote p')
	const authorEl = document.querySelector('.review-quote .text-sm')
	if (!textEl || !authorEl) return
	let idx = 0,
		reviewTimeout = null
	function randDelay() {
		return 7000 + Math.floor(Math.random() * 2000)
	}
	function scheduleNext() {
		reviewTimeout = setTimeout(rotate, randDelay())
	}
	function rotate() {
		if (!textEl || !authorEl) return
		if (
			window.matchMedia &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		) {
			idx = (idx + 1) % rotatingReviews.length
			const r = rotatingReviews[idx]
			textEl.textContent = r.text
			authorEl.textContent = '— ' + r.author
			scheduleNext()
			return
		}
		textEl.style.opacity = '0'
		authorEl.style.opacity = '0'
		textEl.style.transform = 'translateY(6px)'
		authorEl.style.transform = 'translateY(6px)'
		setTimeout(() => {
			idx = (idx + 1) % rotatingReviews.length
			const r = rotatingReviews[idx]
			textEl.textContent = r.text
			authorEl.textContent = '— ' + r.author
			textEl.style.opacity = '1'
			authorEl.style.opacity = '1'
			textEl.style.transform = 'translateY(0)'
			authorEl.style.transform = 'translateY(0)'
			scheduleNext()
		}, 350)
	}
	document.addEventListener('DOMContentLoaded', () => {
		setTimeout(() => {
			textEl.style.opacity = '1'
			authorEl.style.opacity = '1'
			textEl.style.transform = 'translateY(0)'
			authorEl.style.transform = 'translateY(0)'
			scheduleNext()
		}, 900)
	})
})()

/* -------------------- Viewer & Hotspots Logic -------------------- */
let currentViewerRoom = null,
	currentViewerIndex = null,
	currentHotspotIndex = null
let viewerScale = 1
let _pinchState = { startDist: null, startScale: 1 }
let suppressViewerClose = false
let exploreMode = false
let viewerTranslateX = 0,
	viewerTranslateY = 0
let isPanning = false,
	panStartX = 0,
	panStartY = 0

function renderHotspots(room, container) {
	container.innerHTML = ''
	if (!room.hotspots || !room.hotspots.length) return

	room.hotspots.forEach((hs, idx) => {
		const dot = document.createElement('div')
		dot.className = 'hotspot-dot'
		dot.style.left = hs.x || hs.left || hs.lon || '50%'
		dot.style.top = hs.y || hs.top || hs.lat || '50%'
		dot.setAttribute('data-hotspot-index', idx)

		// Если есть shopify_handle, показываем индикатор загрузки
		if (hs.shopify_handle && !hs.product_name) {
			dot.classList.add('loading')
			dot.title = 'Loading...'
		} else {
			const hsName = hs.product_name || hs.name || hs.title || ''
			dot.title = hsName
			dot.setAttribute('data-hotspot-id', hs.id || hsName || idx)
		}

		dot.addEventListener('click', async e => {
			e.stopPropagation()
			currentViewerRoom = room
			currentHotspotIndex = idx
			container
				.querySelectorAll('.hotspot-dot')
				.forEach(d => d.classList.remove('active-hotspot'))
			dot.classList.add('active-hotspot')

			// Если есть shopify_handle, загружаем данные из Shopify
			if (hs.shopify_handle && !hs._enriched) {
				dot.classList.add('loading')
				const enriched = await enrichHotspotWithShopify(hs)
				// Обновляем hotspot в массиве
				Object.assign(hs, enriched, { _enriched: true })
				dot.classList.remove('loading')
				dot.title = hs.product_name || hs.title || ''
			}

			openSheet(hs)
		})
		container.appendChild(dot)
	})
}

function applyViewerScale(s) {
	viewerScale = Math.max(1, Math.min(3, s))
	applyTransform()
	const controls = document.getElementById('viewer-controls')
	if (controls)
		controls.style.display =
			viewerScale > 1 ? 'flex' : window.innerWidth < 768 ? 'none' : 'flex'
}
function applyTransform() {
	const wrapper = document.getElementById('viewer-media-wrapper')
	if (!wrapper) return
	wrapper.style.transform = `translate(${viewerTranslateX}px, ${viewerTranslateY}px) scale(${viewerScale})`
}
function toggleExploreMode() {
	setExploreMode(!exploreMode)
}
function setExploreMode(on) {
	exploreMode = !!on
	const btn = document.getElementById('explore-toggle')
	const iconOff = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>`
	const iconOn = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>`
	if (btn) btn.innerHTML = exploreMode ? iconOn : iconOff
	const wrapper = document.getElementById('viewer-media-wrapper')
	if (!wrapper) return
	wrapper.style.transition = 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)'
	if (exploreMode) {
		applyViewerScale(1.8)
		wrapper.style.cursor = 'grab'
		if (typeof addPanHandlers === 'function') addPanHandlers()
	} else {
		viewerTranslateX = 0
		viewerTranslateY = 0
		applyViewerScale(1)
		wrapper.style.cursor = 'default'
		if (typeof removePanHandlers === 'function') removePanHandlers()
	}
}

function addPanHandlers() {
	const wrapper = document.getElementById('viewer-media-wrapper')
	if (!wrapper || wrapper._panHandlers) return
	const handleMouseDown = e => {
		if (!exploreMode) return
		isPanning = true
		panStartX = e.clientX - viewerTranslateX
		panStartY = e.clientY - viewerTranslateY
		wrapper.style.cursor = 'grabbing'
		window.addEventListener('mousemove', handleMouseMove)
		window.addEventListener('mouseup', handleMouseUp, { once: true })
	}
	const handleMouseMove = e => {
		if (!isPanning) return
		const dx = e.clientX - panStartX
		const dy = e.clientY - panStartY
		applyPan(dx, dy)
	}
	const handleMouseUp = () => {
		isPanning = false
		const wrapper = document.getElementById('viewer-media-wrapper')
		if (wrapper) wrapper.style.cursor = 'grab'
		window.removeEventListener('mousemove', handleMouseMove)
	}
	const handleTouchStart = e => {
		if (!exploreMode || !e.touches || e.touches.length !== 1) return
		isPanning = true
		panStartX = e.touches[0].clientX - viewerTranslateX
		panStartY = e.touches[0].clientY - viewerTranslateY
	}
	const handleTouchMove = e => {
		if (!isPanning || !e.touches || e.touches.length !== 1) return
		e.preventDefault()
		const dx = e.touches[0].clientX - panStartX
		const dy = e.touches[0].clientY - panStartY
		applyPan(dx, dy)
	}
	const handleTouchEnd = () => {
		isPanning = false
	}
	wrapper.addEventListener('mousedown', handleMouseDown)
	wrapper.addEventListener('touchstart', handleTouchStart, { passive: false })
	wrapper.addEventListener('touchmove', handleTouchMove, { passive: false })
	wrapper.addEventListener('touchend', handleTouchEnd)
	wrapper._panHandlers = {
		handleMouseDown,
		handleMouseMove,
		handleMouseUp,
		handleTouchStart,
		handleTouchMove,
		handleTouchEnd,
	}
}

function removePanHandlers() {
	const wrapper = document.getElementById('viewer-media-wrapper')
	if (!wrapper || !wrapper._panHandlers) return
	wrapper.removeEventListener(
		'mousedown',
		wrapper._panHandlers.handleMouseDown,
	)
	wrapper.removeEventListener(
		'touchstart',
		wrapper._panHandlers.handleTouchStart,
	)
	wrapper.removeEventListener(
		'touchmove',
		wrapper._panHandlers.handleTouchMove,
	)
	wrapper.removeEventListener('touchend', wrapper._panHandlers.handleTouchEnd)
	delete wrapper._panHandlers
}

function applyPan(x, y) {
	const wrapper = document.getElementById('viewer-media-wrapper')
	if (!wrapper) return
	const rect = wrapper.getBoundingClientRect()
	const maxX = Math.max(0, (rect.width * (viewerScale - 1)) / 2)
	const maxY = Math.max(0, (rect.height * (viewerScale - 1)) / 2)
	viewerTranslateX = Math.max(-maxX, Math.min(maxX, x))
	viewerTranslateY = Math.max(-maxY, Math.min(maxY, y))
	applyTransform()
}

function zoomIn() {
	applyViewerScale(viewerScale + 0.2)
}
function zoomOut() {
	applyViewerScale(viewerScale - 0.2)
}

// wheel, dblclick and pinch handlers on viewer wrapper
document.addEventListener('DOMContentLoaded', () => {
	const wrapper = document.getElementById('viewer-media-wrapper')
	if (!wrapper) return
	wrapper.addEventListener('wheel', e => {
		if (e.ctrlKey || e.metaKey || e.shiftKey) {
			e.preventDefault()
			applyViewerScale(viewerScale + (e.deltaY < 0 ? 0.08 : -0.08))
		}
	})
	wrapper.addEventListener('dblclick', e => {
		applyViewerScale(viewerScale > 1 ? 1 : 2)
	})
	wrapper.addEventListener('touchstart', e => {
		if (e.touches && e.touches.length === 2) {
			_pinchState.startDist = Math.hypot(
				e.touches[0].clientX - e.touches[1].clientX,
				e.touches[0].clientY - e.touches[1].clientY,
			)
			_pinchState.startScale = viewerScale
		}
	})
	wrapper.addEventListener(
		'touchmove',
		e => {
			if (e.touches && e.touches.length === 2 && _pinchState.startDist) {
				e.preventDefault()
				const curDist = Math.hypot(
					e.touches[0].clientX - e.touches[1].clientX,
					e.touches[0].clientY - e.touches[1].clientY,
				)
				const ratio = curDist / _pinchState.startDist
				applyViewerScale(_pinchState.startScale * ratio)
			}
		},
		{ passive: false },
	)
	wrapper.addEventListener('touchend', e => {
		_pinchState.startDist = null
	})
})

let viewerKeyHandler = null,
	viewerTouchStartX = null,
	viewerMouseStartX = null,
	viewerTouchHandlersAdded = false

function showViewerRoom(room, { suppress = false } = {}) {
	if (!room) return
	currentViewerRoom = room
	// determine current index for consistent prev/next navigation
	const idx = rooms.findIndex(
		r =>
			r &&
			(r.id === room.id ||
				r.title === room.title ||
				r.id === room.title ||
				r.title === room.id),
	)
	currentViewerIndex = idx === -1 ? null : idx
	currentHotspotIndex = null
	const mainSpot = document.getElementById('main-spot')
	if (mainSpot && room.color) {
		mainSpot.style.background = `radial-gradient(circle, ${room.color} 0%, ${room.color} 10%, transparent 80%)`
		mainSpot.style.opacity = '0.2'
		mainSpot.style.filter = 'blur(150px)'
	}
	const img = document.getElementById('viewer-img')
	if (img) {
		if (suppress) {
			suppressViewerClose = true
			setTimeout(() => (suppressViewerClose = false), 220)
		}
		img.src = room.image
	}
	const hotspotsContainer = document.getElementById('hotspots-container')
	if (hotspotsContainer) {
		renderHotspots(room, hotspotsContainer)
		hotspotsContainer.addEventListener('click', closeSheet)
	}
	applyViewerScale(1)
	closeSheet()
}

function openRoomViewer(roomId) {
	const room = rooms.find(r => r.id === roomId || r.title === roomId)
	if (!room) return
	const gv = document.getElementById('global-viewer')
	if (gv) {
		gv.classList.remove('hidden')
		gv.style.display = 'flex'
		// Закрытие при клике на overlay (но не на контент)
		gv.onclick = e => {
			const wrapper = document.getElementById('viewer-media-wrapper')
			const img = document.getElementById('viewer-img')
			const hotspots = document.getElementById('hotspots-container')
			// Закрываем только если клик НЕ на изображении, hotspots или кнопках
			const isClickOnContent =
				(wrapper && wrapper.contains(e.target)) ||
				(img && img.contains(e.target)) ||
				(hotspots && hotspots.contains(e.target)) ||
				e.target.closest('button')
			if (!isClickOnContent) closeViewer()
		}
	}
	document.body.style.overflow = 'hidden'
	showViewerRoom(room, { suppress: true })
	viewerKeyHandler = e => {
		if (e.key === 'ArrowRight') nextViewerRoom()
		else if (e.key === 'ArrowLeft') prevViewerRoom()
		else if (e.key === 'Escape') closeViewer()
	}
	window.addEventListener('keydown', viewerKeyHandler)
	const wrapper = document.getElementById('viewer-media-wrapper')
	if (wrapper && !viewerTouchHandlersAdded) {
		viewerTouchHandlersAdded = true
		const handleTouchStart = e => {
			if (exploreMode) return
			viewerTouchStartX = e.touches ? e.touches[0].clientX : null
		}
		const handleTouchEnd = e => {
			if (exploreMode) return
			if (viewerTouchStartX == null) return
			const endX = e.changedTouches ? e.changedTouches[0].clientX : null
			const dx = endX - viewerTouchStartX
			if (dx > 40) prevViewerRoom()
			else if (dx < -40) nextViewerRoom()
			viewerTouchStartX = null
		}
		const handleMouseDown = e => {
			if (exploreMode) return
			viewerMouseStartX = e.clientX
		}
		const handleMouseUp = e => {
			if (exploreMode) return
			const dx = e.clientX - viewerMouseStartX
			if (dx > 40) prevViewerRoom()
			else if (dx < -40) nextViewerRoom()
			viewerMouseStartX = null
		}
		wrapper.addEventListener('touchstart', handleTouchStart, {
			passive: true,
		})
		wrapper.addEventListener('touchend', handleTouchEnd, { passive: true })
		wrapper.addEventListener('mousedown', handleMouseDown)
		wrapper.addEventListener('mouseup', handleMouseUp)
		wrapper._viewer_touch_start = handleTouchStart
		wrapper._viewer_touch_end = handleTouchEnd
		wrapper._viewer_mouse_down = handleMouseDown
		wrapper._viewer_mouse_up = handleMouseUp
	}
	document
		.querySelectorAll('.viewer-nav')
		.forEach(b => b.classList.remove('hidden'))
}

function closeViewer() {
	if (suppressViewerClose) return
	setExploreMode(false)
	const gv = document.getElementById('global-viewer')
	if (gv) {
		gv.classList.add('hidden')
		gv.style.display = 'none'
	}
	applyViewerScale(1)
	document.body.style.overflow = 'auto'
	closeSheet()
	const hotspotsContainer = document.getElementById('hotspots-container')
	if (hotspotsContainer) {
		hotspotsContainer.innerHTML = ''
		hotspotsContainer.removeEventListener &&
			hotspotsContainer.removeEventListener('click', closeSheet)
		hotspotsContainer.onclick = null
	}
	if (viewerKeyHandler) {
		window.removeEventListener('keydown', viewerKeyHandler)
		viewerKeyHandler = null
	}
	const wrapper = document.getElementById('viewer-media-wrapper')
	if (wrapper && viewerTouchHandlersAdded) {
		wrapper.removeEventListener('touchstart', wrapper._viewer_touch_start)
		wrapper.removeEventListener('touchend', wrapper._viewer_touch_end)
		wrapper.removeEventListener('mousedown', wrapper._viewer_mouse_down)
		wrapper.removeEventListener('mouseup', wrapper._viewer_mouse_up)
		delete wrapper._viewer_touch_start
		delete wrapper._viewer_touch_end
		delete wrapper._viewer_mouse_down
		delete wrapper._viewer_mouse_up
		viewerTouchHandlersAdded = false
	}
	document
		.querySelectorAll('.viewer-nav')
		.forEach(b => b.classList.add('hidden'))
}

function nextViewerRoom() {
	if (!rooms || !rooms.length) return
	if (currentViewerIndex === null)
		currentViewerIndex = currentViewerRoom
			? rooms.findIndex(
					r =>
						r.id === currentViewerRoom.id ||
						r.title === currentViewerRoom.title,
				)
			: 0
	const nextIdx = (currentViewerIndex + 1) % rooms.length
	showViewerRoom(rooms[nextIdx], { suppress: true })
}
function prevViewerRoom() {
	if (!rooms || !rooms.length) return
	if (currentViewerIndex === null)
		currentViewerIndex = currentViewerRoom
			? rooms.findIndex(
					r =>
						r.id === currentViewerRoom.id ||
						r.title === currentViewerRoom.title,
				)
			: 0
	const prevIdx = (currentViewerIndex - 1 + rooms.length) % rooms.length
	showViewerRoom(rooms[prevIdx], { suppress: true })
}

setInterval(() => {
	const clock = document.getElementById('live-clock')
	if (clock) clock.textContent = new Date().toTimeString().split(' ')[0]
}, 1000)

let _scrollTick = false
window.addEventListener('scroll', () => {
	if (!_scrollTick) {
		_scrollTick = true
		requestAnimationFrame(() => {
			const winScroll =
				document.body.scrollTop || document.documentElement.scrollTop
			const height =
				document.documentElement.scrollHeight -
				document.documentElement.clientHeight
			const scrolled = height ? (winScroll / height) * 100 : 0
			const prog = document.getElementById('scroll-progress')
			if (prog) prog.style.width = scrolled + '%'
			const path = document.getElementById('drawing-path')
			const interactiveSection = document.getElementById(
				'interactive-product-flow',
			)
			const finalCta = document.getElementById('final-collection-cta')
			const carouselSection = document.getElementById('collection')
			if (path && interactiveSection && finalCta && carouselSection) {
				const sectionRect = interactiveSection.getBoundingClientRect()
				const pathLength = path.getTotalLength()
				if (
					sectionRect.top < window.innerHeight &&
					sectionRect.bottom > 0
				) {
					const scrollStart =
						interactiveSection.offsetTop - window.innerHeight
					const scrollEnd =
						interactiveSection.offsetTop +
						interactiveSection.offsetHeight -
						window.innerHeight
					let scrollProgress =
						(window.pageYOffset - scrollStart) /
						(scrollEnd - scrollStart)
					scrollProgress = Math.max(0, Math.min(1, scrollProgress))
					path.style.strokeDashoffset =
						pathLength - pathLength * scrollProgress
				} else path.style.strokeDashoffset = pathLength
				const finalCtaRect = finalCta.getBoundingClientRect()
				if (
					finalCtaRect.top < window.innerHeight * 0.7 &&
					!carouselSection.classList.contains('active')
				)
					carouselSection.classList.add('active')
			}
			_scrollTick = false
		})
	}
})

function generateLinePath() {
	const origin = document.getElementById('scroll-origin')
	const section = document.getElementById('interactive-product-flow')
	const finalCta = document.getElementById('final-collection-cta')
	if (!origin || !section || !finalCta) return
	const svg = document.getElementById('interactive-line-svg')
	const path = document.getElementById('drawing-path')
	const svgRect = svg.getBoundingClientRect()
	let pathD = 'M '
	const originRect = origin.getBoundingClientRect()
	const startX =
		((originRect.left + originRect.width / 2 - svgRect.left) /
			svgRect.width) *
		100
	const startY =
		((originRect.top + originRect.height / 2 - svgRect.top) /
			svgRect.height) *
		100
	pathD += `${startX.toFixed(2)},${startY.toFixed(2)}`
	const ctaRect = document
		.getElementById('final-collection-cta')
		.getBoundingClientRect()
	const ctaX =
		((ctaRect.left + ctaRect.width / 2 - svgRect.left) / svgRect.width) *
		100
	const ctaY =
		((ctaRect.top + ctaRect.height / 2 - svgRect.top) / svgRect.height) *
		100
	pathD += ` L ${ctaX.toFixed(2)},${ctaY.toFixed(2)}`
	path.setAttribute('d', pathD)
	const length = path.getTotalLength()
	path.style.strokeDasharray = length
	path.style.strokeDashoffset = length
}

window.addEventListener('load', generateLinePath)
window.addEventListener('resize', generateLinePath)

document
	.querySelector('a[href="#interactive-product-flow"]')
	?.addEventListener('click', function (e) {
		e.preventDefault()
		const targetId = this.getAttribute('href')
		const targetElement = document.querySelector(targetId)
		if (targetElement) {
			const offset = 100
			const elementPosition = targetElement.getBoundingClientRect().top
			const offsetPosition = elementPosition + window.pageYOffset - offset
			window.scrollTo({ top: offsetPosition, behavior: 'smooth' })
		}
	})

document
	.getElementById('final-collection-cta')
	?.addEventListener('click', function (e) {
		e.preventDefault()
		const targetElement = document.getElementById('collection')
		if (targetElement) {
			const offset = 100
			const elementPosition = targetElement.getBoundingClientRect().top
			const offsetPosition = elementPosition + window.pageYOffset - offset
			window.scrollTo({ top: offsetPosition, behavior: 'smooth' })
		}
	})

const mainDemoSwiper = new Swiper('.mainDemoSwiper', {
	effect: 'coverflow',
	centeredSlides: true,
	slidesPerView: 'auto',
	coverflowEffect: {
		rotate: 0,
		depth: 300,
		modifier: 1.5,
		slideShadows: false,
	},
	fadeEffect: { crossFade: true },
	loop: true,
	pagination: {
		el: '.swiper-pagination',
		clickable: true,
		dynamicBullets: true,
	},
	autoplay: { delay: 7000 },
})

window.addEventListener('scroll', runReveal)
window.addEventListener('load', runReveal)

/* -------------------- Gallery render (when #gallery-grid exists) -------------------- */
function renderGallery() {
	const grid = document.getElementById('gallery-grid')
	if (!grid) return
	if (!rooms || !rooms.length) {
		grid.innerHTML =
			'<div class="text-center text-sm text-white/50 py-16">No scenes</div>'
		return
	}
	const frag = document.createDocumentFragment()
	rooms.forEach((scene, index) => {
		const el = document.createElement('article')

		// ОСНОВНОЙ КОНТЕЙНЕР (Рамка со свечением и блюром)
		el.className =
			'group reveal reveal-bottom relative p-6 rounded-[2rem] border border-white/5 bg-gradient-to-b from-white/[0.08] to-transparent backdrop-blur-2xl transition-all duration-500 hover:-translate-y-3 hover:border-purple-500/40 hover:shadow-[0_20px_50px_-10px_rgba(168,85,247,0.2)] flex flex-col justify-between cursor-pointer overflow-hidden'

		// Задержка анимации появления
		el.style.transitionDelay = `${(index % 3) * 0.1}s`

		el.innerHTML = `
        <div class="relative w-full aspect-video overflow-hidden rounded-[1.5rem] border border-white/5 mb-6">
            <img src="${scene.image}" 
                 alt="${scene.title}" 
                 class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                 loading="lazy">
        </div>

        <div class="relative z-10 flex flex-col gap-1">
            <div class="flex items-center justify-between">
                <h3 class="text-xl font-black italic uppercase text-white tracking-tighter group-hover:text-purple-400 transition-colors">
                    ${scene.title}
                </h3>
                
                <span class="text-[9px] font-bold uppercase tracking-[0.3em] text-white/30 group-hover:text-purple-500 transition-colors">
                    // ${scene.category || 'Setup'}
                </span>
            </div>
            
            <p class="text-[10px] text-gray-500 uppercase tracking-[0.2em] group-hover:text-white transition-colors duration-300">
                Explore Space
            </p>
        </div>
        
        <div class="absolute -bottom-2 -right-2 text-[80px] mr-3 font-black text-white/[0.02] pointer-events-none select-none group-hover:text-purple-500/10 transition-colors duration-700">
            CS.
        </div>
    `
		el.onclick = () => openRoomViewer(scene.id || scene.title)
		frag.appendChild(el)
	})
	grid.innerHTML = ''
	grid.appendChild(frag)
}
function initDemoModule() {
	// Initialize demo preview swiper (new interactive preview)
	const demoPreviewWrapper = document.getElementById('demo-preview-wrapper')
	if (demoPreviewWrapper && rooms.length > 0) {
		const limit = Math.min(4, rooms.length)
		demoPreviewWrapper.innerHTML = rooms
			.slice(0, limit)
			.map((room, idx) => {
				// Берём до 3 hotspots для демо
				const demoHotspots = (room.hotspots || []).slice(0, 3)
				const hotspotsHtml = demoHotspots
					.map(
						spot =>
							`<div class="demo-hotspot-mini" style="top: ${spot.top || '50%'}; left: ${spot.left || '50%'}"></div>`,
					)
					.join('')

				return `<div class="swiper-slide">
						<img src="${room.image}" class="absolute inset-0 w-full h-full object-cover" alt="${room.name || 'Room setup'}"/>
						<div class="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
						${hotspotsHtml}
					</div>`
			})
			.join('')

		new Swiper('.demoPreviewSwiper', {
			effect: 'fade',
			fadeEffect: { crossFade: true },
			autoplay: { delay: 3000, disableOnInteraction: false },
			loop: true,
			speed: 800,
		})
	}

	// Legacy demo swiper support (if exists)
	const swiperWrapper = document.getElementById('demo-swiper-wrapper')
	if (!swiperWrapper) return
	const limit = 3
	swiperWrapper.innerHTML = rooms
		.slice(0, limit)
		.map(
			(room, roomIndex) =>
				`<div class="swiper-slide relative"><img src="${
					room.image
				}" class="w-full h-full object-cover"/>${room.hotspots
					.map(
						(spot, spotIndex) =>
							`<div class="hotspot-dot" data-room-index="${roomIndex}" data-spot-index="${spotIndex}" style="top: ${
								spot.top || '50%'
							}; left: ${
								spot.left || '50%'
							}" onclick="openSheet(${roomIndex}, ${spotIndex})"></div>`,
					)
					.join('')}</div>`,
		)
		.join('')
	const demoSwiper = new Swiper('.mainDemoSwiper', {
		effect: 'fade',
		fadeEffect: { crossFade: true },
		pagination: { el: '.swiper-pagination', clickable: true },
		loop: false,
	})
}

function openSheet(roomIdxOrSpot, spotIdx) {
	let spot
	// Check if first argument is a hotspot object or room index
	if (typeof roomIdxOrSpot === 'object' && roomIdxOrSpot !== null) {
		spot = roomIdxOrSpot
	} else {
		spot =
			rooms[roomIdxOrSpot] &&
			rooms[roomIdxOrSpot].hotspots &&
			rooms[roomIdxOrSpot].hotspots[spotIdx]
	}
	if (!spot) return
	const sheet = document.getElementById('bottom-sheet')
	const overlay = document.getElementById('sheet-overlay')
	const content = document.getElementById('sheet-content')
	if (!content) return
	const rawName = spot.product_name || spot.name || spot.title || 'Product'
	const name = rawName.length > 24 ? `${rawName.slice(0, 24)}...` : rawName
	const img = spot.img || spot.image || ''
	const price = spot.price && spot.price !== 'N/A' ? spot.price : null
	const currencyCode = (spot.currency || '').toString().toUpperCase()
	const currencySymbolLocal =
		currencyCode === 'EUR'
			? '€'
			: currencyCode === 'USD'
				? '$'
				: spot.currency || '$'
	const variantTitles = Array.isArray(spot.variants)
		? spot.variants.map(v => v && v.title).filter(Boolean)
		: []
	const hasVariants =
		variantTitles.length > 1 ||
		(variantTitles.length === 1 &&
			variantTitles[0].toLowerCase() !== 'default title')
	const variantsLabel = hasVariants
		? `Variants: ${variantTitles.slice(0, 3).join(' • ')}`
		: ''
	const link = spot.link || spot.url || null
	const rating = spot.rating || null
	const reviewsCount = spot.reviews_count || null

	// Рейтинг HTML
	const ratingHtml = rating
		? `<div class="flex items-center gap-2 mt-2">
			<div class="flex items-center gap-0.5">
				${Array(5)
					.fill(0)
					.map(
						(_, i) =>
							`<span class="text-[10px] ${i < Math.floor(rating) ? 'text-yellow-500' : 'text-white/20'}">★</span>`,
					)
					.join('')}
			</div>
			<span class="text-[10px] text-white/60 font-bold">${rating}</span>
			${reviewsCount ? `<span class="text-[9px] text-white/40">(${reviewsCount} reviews)</span>` : ''}
		</div>`
		: ''
	content.innerHTML = `
  <div class="flex flex-col gap-4"> 
    <div class="w-full aspect-video rounded-xl overflow-hidden bg-neutral-900 border border-white/10 shadow-inner">
      <img src="${img}" class="w-full h-full object-cover" onerror="this.src='https://via.placeholder.com/400x225?text=No+Image'"/>
    </div>
    <div class="space-y-3">
      <div class="flex justify-between items-end">
        <div>
          <h3 class="text-xl font-black text-white uppercase italic leading-none">${name}</h3>
          <p class="text-[10px] text-purple-500 font-bold uppercase tracking-widest mt-1">${
				spot.category || 'Setup'
			}</p>
			${ratingHtml}
        </div>
        <div class="text-right">
          <div class="text-xl font-black text-white" data-price="${price || 0}">${
				price ? `${price}${currencySymbolLocal}` : ''
			}</div>
          ${
				spot.oldPrice
					? `<div class="text-[10px] text-gray-500 line-through">${spot.oldPrice}</div>`
					: ''
			}
        </div>
      </div>
      ${
			price
				? `
					${hasVariants ? `<div class="text-[9px] uppercase tracking-[0.2em] text-white/50 text-center mb-2">${variantsLabel}</div>` : ''}
					<button onclick="addToCartFromSheet('${spot.shopify_handle || spot.id || 'product'}', '${rawName.replace(/'/g, "\\'")}', ${price}, '${img}')" class="w-full bg-white text-black py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-purple-600 hover:text-white transition-all active:scale-95 shadow-xl">Add to Cart</button>`
				: link
					? `<a href="${link}" target="_blank" class="w-full inline-flex items-center justify-center bg-white text-black py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-purple-600 hover:text-white transition-all shadow-xl">Learn more</a>`
					: `<button class="w-full bg-white text-black py-4 rounded-xl font-black uppercase text-[10px] tracking-widest opacity-60 cursor-not-allowed" disabled>Coming soon</button>`
		}
		<a href="${getProductUrl(spot.shopify_handle || spot.id)}" class="block text-center text-purple-500 hover:text-purple-400 text-[11px] font-bold uppercase tracking-widest transition-colors">More details →</a>
    </div>
  </div>
`
	overlay.style.opacity = '1'
	overlay.style.pointerEvents = 'auto'
	sheet.style.transform = 'translate(-50%, 0)'
	document.body.classList.add('sheet-open')
}

function closeSheet() {
	const sheet = document.getElementById('bottom-sheet')
	const overlay = document.getElementById('sheet-overlay')
	overlay.style.opacity = '0'
	overlay.style.pointerEvents = 'none'
	sheet.style.transform = 'translate(-50%, 100%)'
	document.body.classList.remove('sheet-open')
}

// bottom-sheet drag handlers
document.addEventListener('DOMContentLoaded', () => {
	const sheet = document.getElementById('bottom-sheet')
	const grabber = document.getElementById('sheet-grabber')
	let isDragging = false
	let startY = 0
	const handleStart = e => {
		isDragging = true
		startY = e.pageY || (e.touches && e.touches[0].pageY)
		sheet.style.transition = 'none'
	}
	const handleMove = e => {
		if (!isDragging) return
		const currentY = e.pageY || (e.touches && e.touches[0].pageY)
		const diff = currentY - startY
		if (diff > 0) sheet.style.transform = `translate(-50%, ${diff}px)`
	}
	const handleEnd = e => {
		if (!isDragging) return
		isDragging = false
		sheet.style.transition = 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)'
		const transformValue = sheet.style.transform
		const match = transformValue.match(/(\d+)px/)
		const currentDiff = match ? parseInt(match[1]) : 0
		if (currentDiff > 100) {
			closeSheet()
		} else {
			sheet.style.transform = 'translate(-50%, 0)'
		}
	}
	grabber && grabber.addEventListener('mousedown', handleStart)
	grabber && grabber.addEventListener('touchstart', handleStart)
	window.addEventListener('mousemove', handleMove)
	window.addEventListener('touchmove', handleMove)
	window.addEventListener('mouseup', handleEnd)
	window.addEventListener('touchend', handleEnd)
})

// Expose helpers for backward compatibility and initialize app
document.addEventListener('DOMContentLoaded', () => {
	loadData()
	runReveal() // expose common globals used by inline attributes
	if (document.getElementById('cart-drawer')) Cart.init()
	window.openRoomViewer = openRoomViewer
	window.closeViewer = closeViewer
	window.nextViewerRoom = nextViewerRoom
	window.prevViewerRoom = prevViewerRoom
	window.zoomIn = zoomIn
	window.zoomOut = zoomOut
	window.toggleExploreMode = toggleExploreMode
	window.openSheet = openSheet
	window.closeSheet = closeSheet

	// Ensure viewer nav buttons (if present) are bound
	const prevBtn = document.getElementById('viewer-prev')
	const nextBtn = document.getElementById('viewer-next')
	if (prevBtn) prevBtn.addEventListener('click', prevViewerRoom)
	if (nextBtn) nextBtn.addEventListener('click', nextViewerRoom)
})

// Функция добавления в корзину из sheet с передачей данных напрямую
window.addToCartFromSheet = function (handle, title, price, image) {
	const product = {
		id: handle || Date.now().toString(),
		title: title || 'Unknown Item',
		price: parseFloat(price) || 0,
		image: image || fallbackImage,
		handle: handle,
	}

	// Добавляем в корзину
	Cart.addItem(product, true)

	// Закрываем sheet после добавления
	closeSheet()
}

/* -------------------- Gallery Page Specifics -------------------- */

// 1. Функция инициализации верхней карусели
function initGalleryHero() {
	const wrapper = document.getElementById('gallery-hero-wrapper')

	// Если обертка скрыта или отсутствует (на телефоне), просто выходим из функции
	if (!wrapper || window.innerWidth < 768) {
		return
	}

	// Выбираем 10 случайных комнат
	const randomSlides = [...rooms].sort(() => 0.5 - Math.random()).slice(0, 10)

	wrapper.innerHTML = randomSlides
		.map(
			room => `
            <div class="swiper-slide w-full md:w-auto md:px-2 px-0 group cursor-pointer" 
                 onclick="openRoomViewer('${room.id || room.title}')">
                <div class="h-full aspect-[4/5] md:aspect-video rounded-xl overflow-hidden relative border border-white/10">
                    <img src="${room.image}" 
                         class="w-full h-full object-cover opacity-100 md:opacity-60 md:group-hover:opacity-100 transition duration-700" 
                         loading="lazy" />
                    <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                        <span class="text-[10px] font-black uppercase tracking-widest text-white">
                            ${room.category || 'Setup'}
                        </span>
                    </div>
                </div>
            </div>
        `,
		)
		.join('')

	// Удаляем старый экземпляр Swiper, если он есть
	if (window.galleryHeroSwiper) {
		window.galleryHeroSwiper.destroy(true, true)
	}

	// Инициализация Swiper
	window.galleryHeroSwiper = new Swiper('.galleryHeroSwiper', {
		loop: true,
		// Настройки по умолчанию (для мобильных)
		slidesPerView: 1.2,
		centeredSlides: true,
		spaceBetween: 16,
		speed: 800,
		grabCursor: true,
		autoplay: {
			delay: 3000,
			disableOnInteraction: false,
		},
		// Адаптация под разные экраны
		breakpoints: {
			// Для десктопов (ширина > 768px)
			769: {
				slidesPerView: 'auto',
				centeredSlides: false,
				spaceBetween: 0,
				speed: 6000,
				freeMode: true,
				autoplay: {
					delay: 0,
				},
			},
		},
	})
}

// 2. Расширяем loadData (перезаписываем или дополняем логику)
// Мы можем просто добавить вызов в конец существующей обработки данных.
// Так как loadData уже определена выше, мы добавим слушатель,
// который проверит наличие данных и запустит карусель.

const originalLoadData = window.loadData // Если нужно сохранить ссылку (опционально)

// Просто добавляем проверку в интервале или после загрузки DOM,
// но лучше всего встроить вызов initGalleryHero() внутрь loadData в основном коде.
// Если ты не хочешь менять основной код выше, добавь этот блок:

document.addEventListener('DOMContentLoaded', () => {
	// Ждем пока loadData отработает (она асинхронна),
	// поэтому используем простой поллинг или перехватываем выполнение.
	// Самый надежный способ без изменения верха скрипта:

	const checkDataInterval = setInterval(() => {
		if (typeof rooms !== 'undefined' && rooms.length > 0) {
			initGalleryHero()
			clearInterval(checkDataInterval)
		}
	}, 100)
})

function initSpaceSwitcher() {
	const word = document.getElementById('changing-word')
	const decoContainer = document.getElementById('deco-layers-container')

	const themes = [
		{
			name: 'cyber',
			textClass: 'text-cyber-retro',
			objects: [
				{
					html: '<div class="absolute -inset-x-10 bottom-0 h-8 bg-[linear-gradient(to_right,#ff00ff22_1px,transparent_1px),linear-gradient(to_bottom,#ff00ff22_1px,transparent_1px)] bg-[size:15px_15px] [transform:perspective(500px)_rotateX(60deg)]"></div>',
					pos: '',
				},
				{
					html: '<div class="w-12 h-1 bg-yellow-400 shadow-[0_0_10px_#facc15]"></div>',
					pos: 'top-1/4 -left-4 rotate-12',
				},
				{
					html: '<div class="text-[8px] font-mono text-cyan-400 border border-cyan-400 px-1">VHS_DRV</div>',
					pos: '-top-8 right-0',
				},
			],
		},
		{
			name: 'bio',
			textClass:
				'text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]',
			objects: [
				{
					html: '<div class="w-2 h-2 bg-white/60 rounded-full blur-[1px]"></div>',
					pos: 'top-1/2 left-1/4',
				},
				{
					html: '<div class="w-full h-[1px] bg-green-500/30"></div>',
					pos: 'bottom-0 left-0',
				},
			],
		},
		{
			name: 'cozy',
			textClass:
				'text-orange-200 drop-shadow-[0_0_15px_rgba(253,216,199,0.5)]',
			objects: [
				{ html: '☁️', pos: '-top-8 right-1/4 text-xl opacity-50' },
				{
					html: '<div class="w-4 h-4 bg-orange-500/20 blur-xl scale-[3]"></div>',
					pos: 'top-1/2 left-1/2 -translate-x-1/2',
				},
				{
					html: '<div class="text-[7px] tracking-[0.8em] text-orange-300/40">SILENCE</div>',
					pos: '-bottom-4 left-0 w-full text-center',
				},
			],
		},
		{
			name: 'ind',
			textClass: 'text-gray-400 font-mono tracking-tighter',
			objects: [
				{
					html: '<div class="w-3 h-3 border-2 border-gray-600 rounded-full"></div>',
					pos: '-top-2 -left-2',
				},
				{
					html: '<div class="w-3 h-3 border-2 border-gray-600 rounded-full"></div>',
					pos: '-bottom-2 -right-2',
				},
				{
					html: '<div class="px-2 py-0.5 bg-yellow-600/20 text-yellow-600 text-[6px] border border-yellow-600/30">STRUCT_V01</div>',
					pos: 'top-0 -right-12 rotate-90',
				},
			],
		},
		{
			name: 'min',
			textClass: 'text-white font-light tracking-[0.4em]',
			objects: [
				{
					html: '<div class="w-[1px] h-12 bg-white/20"></div>',
					pos: '-top-14 left-1/2',
				},
				{
					html: '<div class="absolute inset-0 border border-white/10 scale-125"></div>',
					pos: '',
				},
			],
		},
		{
			name: 'std',
			textClass:
				'text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.5)]',
			objects: [
				{
					html: '<div class="flex gap-0.5 items-end h-6"><div class="w-1 bg-blue-500 animate-[music-height_0.8s_infinite]"></div><div class="w-1 bg-blue-500 animate-[music-height_1.1s_infinite]"></div><div class="w-1 bg-blue-500 animate-[music-height_0.9s_infinite]"></div></div>',
					pos: 'top-1/2 -right-10 -translate-y-1/2',
				},
				{
					html: '<div class="text-[8px] text-red-500 font-bold flex items-center gap-1">● REC</div>',
					pos: '-top-6 left-0',
				},
			],
		},
	]

	let current = 0

	function updateTheme() {
		const theme = themes[current]

		// 1. Очищаем старые объекты
		decoContainer.innerHTML = ''

		// 2. Меняем стиль текста
		word.className = `transition-all duration-700 inline-block ${theme.textClass}`

		// 3. Создаем новые объекты
		theme.objects.forEach((obj, i) => {
			const el = document.createElement('div')
			el.className = `deco-object ${obj.pos}`
			el.innerHTML = obj.html
			decoContainer.appendChild(el)

			// Плавное появление
			setTimeout(() => el.classList.add('active'), i * 100)
		})

		current = (current + 1) % themes.length
	}

	updateTheme() // Первый запуск
	setInterval(updateTheme, 4000)
}

// Запуск при загрузке страницы
document.addEventListener('DOMContentLoaded', initSpaceSwitcher)

// Находим элементы и инициализируем поведение после загрузки DOM
function initMenu() {
	const menuToggle = document.getElementById('menu-toggle')
	const mobileMenu = document.getElementById('mobile-menu')
	const mobileLinks = document.querySelectorAll('.mobile-nav-link')
	if (!menuToggle || !mobileMenu) return
	console.log('initMenu: menuToggle and mobileMenu found', {
		menuToggle,
		mobileMenu,
	})

	// close on Escape key when menu is open
	const menuEscHandler = e => {
		if (e.key === 'Escape') setMenuOpen(false)
	}

	const setMenuOpen = open => {
		menuToggle.classList.toggle('active', open)
		mobileMenu.classList.toggle('active', open)
		document.body.classList.toggle('menu-open', open)
		menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
		mobileMenu.setAttribute('aria-hidden', open ? 'false' : 'true')
		// keep inline visibility in sync (some older browsers may rely on it)
		mobileMenu.style.visibility = open ? 'visible' : ''
		// prevent page scroll when menu open
		document.body.style.overflow = open ? 'hidden' : ''
		if (open) {
			// ensure the menu is scrolled to top and focus first link for better UX
			mobileMenu.scrollTop = 0
			const firstLink = mobileMenu.querySelector('.mobile-nav-link')
			if (firstLink && typeof firstLink.focus === 'function')
				firstLink.focus()
			// add escape listener
			window.addEventListener('keydown', menuEscHandler)
		} else {
			// remove escape listener when closed
			window.removeEventListener('keydown', menuEscHandler)
		}
	}

	const toggleMenu = e => {
		console.log(
			'toggleMenu event',
			e && e.type,
			'active?',
			mobileMenu.classList.contains('active'),
		)
		if (e && e.type === 'touchstart') e.preventDefault()
		setMenuOpen(!mobileMenu.classList.contains('active'))
	}

	menuToggle.addEventListener('click', toggleMenu)
	menuToggle.addEventListener('touchstart', toggleMenu, { passive: false })

	mobileLinks.forEach(link => {
		link.addEventListener('click', () => setMenuOpen(false))
	})

	// Close when clicking outside the inner menu content (background tap)
	mobileMenu.addEventListener('click', e => {
		if (e.target === mobileMenu) setMenuOpen(false)
	})

	// Close via dedicated close button
	const closeBtn = document.getElementById('mobile-menu-close')
	if (closeBtn) closeBtn.addEventListener('click', () => setMenuOpen(false))

	// close menu on resize to larger viewports
	window.addEventListener('resize', () => {
		if (
			window.innerWidth > 768 &&
			mobileMenu.classList.contains('active')
		) {
			setMenuOpen(false)
		}
	})
}

// Ensure initialization runs even if DOMContentLoaded already fired
console.log('document.readyState', document.readyState)
if (document.readyState === 'loading') {
	console.log('initMenu will run on DOMContentLoaded')
	document.addEventListener('DOMContentLoaded', () => {
		console.log('DOMContentLoaded fired, running initMenu')
		initMenu()
	})
} else {
	console.log('document already ready, running initMenu now')
	initMenu()
}

/* -------------------- SIDE CART LOGIC -------------------- */
const Cart = (function () {
	// State
	let items = []
	let isOpen = false
	let initialized = false
	const FREE_SHIPPING_THRESHOLD = 500
	let autoCloseTimer = null

	// DOM Elements - lookup on demand to ensure availability
	const getElements = () => ({
		drawer: document.getElementById('cart-drawer'),
		overlay: document.getElementById('cart-overlay'),
		itemsContainer: document.getElementById('cart-items'),
		footer: document.getElementById('cart-footer'),
		subtotal: document.getElementById('cart-total'),
		count: document.getElementById('cart-count'),
		closeBtn: document.getElementById('close-cart-btn'),
		headerCount: document.getElementById('header-cart-count'),
	})

	function init() {
		if (initialized) return
		initialized = true
		const els = getElements()
		// Event Listeners
		if (els.closeBtn) els.closeBtn.addEventListener('click', close)
		if (els.overlay)
			els.overlay.addEventListener('click', e => {
				if (e.target === els.overlay) close()
			})

		// Delegation for dynamic cart toggle button
		document.addEventListener('click', e => {
			const toggle = e.target.closest('#cart-toggle')
			if (toggle) {
				e.preventDefault() // Prevent navigation if href="#"
				open()
			}
		})

		document.addEventListener('keydown', e => {
			if (e.key === 'Escape' && isOpen) close()
		})

		// Hover to cancel auto-close
		if (els.drawer) {
			els.drawer.addEventListener('mouseenter', () => {
				if (autoCloseTimer) clearTimeout(autoCloseTimer)
			})
		}

		// Initial render to show empty cart state
		render()
	}

	function open() {
		isOpen = true
		const els = getElements()
		if (els.drawer) els.drawer.classList.remove('translate-x-full')
		if (els.overlay)
			els.overlay.classList.remove('opacity-0', 'pointer-events-none')
		document.body.style.overflow = 'hidden'
	}

	function close() {
		isOpen = false
		const els = getElements()
		if (els.drawer) els.drawer.classList.add('translate-x-full')
		if (els.overlay)
			els.overlay.classList.add('opacity-0', 'pointer-events-none')
		document.body.style.overflow = ''
		if (autoCloseTimer) clearTimeout(autoCloseTimer)
	}

	// function openWithTimer(duration = 4000) {
	// 	open()
	// 	if (autoCloseTimer) clearTimeout(autoCloseTimer)
	// 	autoCloseTimer = setTimeout(close, duration)
	// }

	function addItem(product, openCart = true) {
		const productId = product.id || product.handle || Date.now().toString()
		const qtyToAdd = product.quantity || 1
		const existing = items.find(i => i.id === productId)
		if (existing) {
			existing.qty += qtyToAdd
		} else {
			items.push({ ...product, qty: qtyToAdd, id: productId })
		}
		render()
		// if (openCart) {
		// 	openWithTimer()
		// }
	}

	function removeItem(id) {
		items = items.filter(i => i.id !== id)
		render()
	}

	function updateQty(id, delta) {
		const item = items.find(i => i.id === id)
		if (!item) return

		item.qty += delta
		if (item.qty <= 0) {
			removeItem(id)
		} else {
			render()
		}
	}

	function render() {
		const els = getElements()
		if (!els.drawer) return // Если нет самой корзины, ничего не делаем

		// 1. Расчеты
		const total = items.reduce(
			(sum, item) => sum + item.price * item.qty,
			0,
		)
		const totalQty = items.reduce((c, i) => c + i.qty, 0)

		// 2. Обновление счетчиков в шапке
		if (els.count) els.count.innerText = totalQty
		if (els.headerCount) {
			els.headerCount.innerText = totalQty
			totalQty > 0
				? els.headerCount.classList.remove('opacity-0', 'scale-0')
				: els.headerCount.classList.add('opacity-0', 'scale-0')
		}

		// 3. Отрисовка товаров
		if (els.itemsContainer) {
			if (items.length === 0) {
				els.itemsContainer.innerHTML = `
                <div class='flex flex-col items-center justify-center h-full text-white/30 space-y-4'>
                    <svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><circle cx='9' cy='21' r='1'></circle><circle cx='20' cy='21' r='1'></circle><path d='M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6'></path></svg>
                    <p class='text-[10px] uppercase tracking-widest'>Your cart is empty</p>
					<a href="${getCollectionsUrl()}" class="bg-white text-black p-4 lg:py-3 rounded-lg font-black uppercase text-[8px] lg:text-[9px] tracking-[0.2em] text-center hover:bg-purple-600 hover:text-white transition-all duration-300">
								View the collection
							</a>
                </div>`
			} else {
				els.itemsContainer.innerHTML = items
					.map(
						item => `
                <div class='flex gap-4 animate-[fadeIn_0.3s_ease-out] mb-6'>
                    <div class='w-20 h-20 bg-white/5 rounded-lg overflow-hidden flex-shrink-0'>
                        <img src='${
							item.image || fallbackImage
						}' class='w-full h-full object-cover' />
                    </div>
                    <div class='flex-1 flex flex-col justify-between py-1'>
                        <div>
                            <h4 class='text-white text-sm font-bold leading-tight'>${
								item.title
							}</h4>
                            <p class='text-white/40 text-[10px] mt-1'>Price: $${
								item.price
							}</p>
                        </div>
                        <div class='flex items-center justify-between'>
                            <div class='flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1'>
                                <button onclick='Cart.updateQty("${
									item.id
								}", -1)' class='text-white/50 hover:text-white px-1'>-</button>
                                <span class='text-xs text-white/90 font-mono w-4 text-center'>${
									item.qty
								}</span>
                                <button onclick='Cart.updateQty("${
									item.id
								}", 1)' class='text-white/50 hover:text-white px-1'>+</button>
                            </div>
                            <button onclick='Cart.removeItem("${
								item.id
							}")' class='text-red-500/50 hover:text-red-400 p-1'>
                                <svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='3 6 5 6 21 6'></polyline><path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
            `,
					)
					.join('')
			}
		}

		// 4. ДИНАМИЧЕСКИЙ ФУТЕР
		// Проверяем, существует ли уже футер в DOM
		let footer = document.getElementById('cart-footer')

		if (items.length > 0) {
			// Если товаров > 0 и футера еще нет — создаем его
			if (!footer) {
				footer = document.createElement('div')
				footer.id = 'cart-footer'
				footer.className = 'border-t border-white/5 bg-[#0d0d0d]'
				els.drawer.appendChild(footer) // Добавляем в конец корзины
			}

			// Обновляем содержимое футера
			footer.innerHTML = `
           <div class="mt-auto p-6 bg-zinc-900/50 border-t border-white/5 backdrop-blur-xl">
    <div class="flex justify-between items-center mb-1">
        <div class="flex flex-col">
            <span class="text-white/40 text-[10px] uppercase tracking-[0.2em] font-bold">Subtotal</span>
            <span class="text-[9px] text-purple-400/60 uppercase tracking-widest">Final Price</span>
        </div>
        <div class="text-right">
            <span class="text-3xl font-black tracking-tighter text-white">
                <span class="text-purple-500 text-lg align-top mr-1">$</span>${total.toFixed(2)}
            </span>
        </div>
    </div>

    <div class="flex items-center gap-3 my-4">
        <div class="h-px flex-1 bg-white/5"></div>
        <p class="text-[9px] text-white/30 uppercase tracking-[0.1em] whitespace-nowrap">Tax & Shipping included</p>
        <div class="h-px flex-1 bg-white/5"></div>
    </div>

    <button class="group relative w-full overflow-hidden rounded-2xl bg-white p-[1px] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
        <div class="absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        
        <div class="relative flex items-center justify-center gap-2 bg-white group-hover:bg-transparent py-4 px-6 rounded-[15px] transition-colors duration-300">
            <span class="text-black group-hover:text-white text-xs font-black uppercase tracking-[0.25em] transition-colors">
                Secure Checkout
            </span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-black group-hover:text-white group-hover:translate-x-1 transition-all">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
        </div>
    </button>
    
    <div class="mt-4 flex justify-center gap-4 opacity-20 grayscale">
        <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg" alt="Visa" class="h-3">
        <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" alt="Mastercard" class="h-5">
        <img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg" alt="PayPal" class="h-3">
    </div>
</div>
        `
		} else {
			// Если товаров 0 — удаляем футер совсем
			if (footer) {
				footer.remove()
			}
		}
	}

	// Expose public methods
	return {
		init,
		open,
		close,
		addItem,
		removeItem,
		updateQty,
	}
})()

/**
 * Unified addToCart function
 * Supports both local (fallback) and Shopify modes
 * @param {string} productIdOrHandle - Product ID or Shopify handle
 * @param {HTMLElement} buttonEl - Optional button element for animation
 */
window.addToCart = async function (productIdOrHandle, buttonEl) {
	let product = null
	let imgEl = null
	let sourceEl = null

	// Определяем источник данных (sheet, card, или cached product)
	const sheetContent = document.getElementById('sheet-content')
	const bottomSheet = document.getElementById('bottom-sheet')
	const isSheetOpen =
		bottomSheet && !bottomSheet.style.transform.includes('100%')
	const card =
		buttonEl?.closest('.group') || buttonEl?.parentElement?.parentElement

	if (sheetContent && isSheetOpen) {
		// Данные из sheet (детальный просмотр товара)
		sourceEl = sheetContent
		const titleEl =
			sheetContent.querySelector('h3') || sheetContent.querySelector('h4')
		const priceEl = sheetContent.querySelector('[data-price]')
		imgEl = sheetContent.querySelector('img')

		product = {
			id:
				productIdOrHandle ||
				(titleEl ? titleEl.innerText : Date.now().toString()),
			title: titleEl ? titleEl.innerText : 'Unknown Item',
			price: priceEl ? parseFloat(priceEl.dataset.price) || 0 : 0,
			image: imgEl ? imgEl.src : fallbackImage,
			handle: productIdOrHandle,
		}
	} else if (card) {
		// Данные из карточки товара (Assortment section)
		sourceEl = card
		const titleEl = card.querySelector('h4') || card.querySelector('h3')
		const priceEl =
			card.querySelector('[data-price]') ||
			card.querySelector('.font-mono')
		imgEl = card.querySelector('img')

		let price = 0
		if (priceEl) {
			price = priceEl.dataset?.price
				? parseFloat(priceEl.dataset.price)
				: parseFloat(priceEl.innerText.replace(/[^0-9.]/g, '')) || 0
		}

		product = {
			id:
				productIdOrHandle ||
				(titleEl ? titleEl.innerText : Date.now().toString()),
			title: titleEl ? titleEl.innerText : 'Unknown Item',
			price: price,
			image: imgEl ? imgEl.src : fallbackImage,
			handle: productIdOrHandle,
		}
	} else if (productIdOrHandle && productCache.has(productIdOrHandle)) {
		// Данные из кэша Shopify
		const cached = productCache.get(productIdOrHandle)
		product = {
			id: productIdOrHandle,
			title: cached.title || cached.product_name || 'Unknown Item',
			price: cached.price || 0,
			image: cached.img || cached.images?.[0] || fallbackImage,
			handle: productIdOrHandle,
			variantId: cached.variantId,
		}
	} else {
		// Попробуем загрузить из Shopify
		if (productIdOrHandle && shopifyConfig) {
			const shopifyData = await fetchShopifyProduct(productIdOrHandle)
			if (shopifyData) {
				product = {
					id: productIdOrHandle,
					title:
						shopifyData.title ||
						shopifyData.product_name ||
						'Unknown Item',
					price: shopifyData.price || 0,
					image:
						shopifyData.img ||
						shopifyData.images?.[0] ||
						fallbackImage,
					handle: productIdOrHandle,
					variantId: shopifyData.variantId,
				}
			}
		}
	}

	if (!product) {
		console.warn(
			'[addToCart] Could not find product data for:',
			productIdOrHandle,
		)
		return
	}

	// Button animation
	if (buttonEl) {
		const originalHtml = buttonEl.innerHTML
		buttonEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M20 6L9 17l-5-5" /></svg>`
		buttonEl.classList.add('text-green-500')
		setTimeout(() => {
			buttonEl.innerHTML = originalHtml
			buttonEl.classList.remove('text-green-500')
		}, 1500)
	}

	// Fly animation to cart
	const cartIcon = document.getElementById('cart-toggle')
	const flyImg = imgEl || (sourceEl ? sourceEl.querySelector('img') : null)

	if (cartIcon && flyImg) {
		const startRect = flyImg.getBoundingClientRect()
		const targetRect = cartIcon.getBoundingClientRect()

		const flyer = flyImg.cloneNode()
		flyer.style.cssText = `
			position: fixed;
			z-index: 9999;
			left: ${startRect.left}px;
			top: ${startRect.top}px;
			width: ${startRect.width}px;
			height: ${startRect.height}px;
			border-radius: 1rem;
			transition: all 0.8s cubic-bezier(0.19, 1, 0.22, 1);
			opacity: 0.9;
			pointer-events: none;
			object-fit: cover;
		`

		document.body.appendChild(flyer)
		flyer.getBoundingClientRect() // Force reflow

		flyer.style.left = `${targetRect.left + targetRect.width / 2 - 10}px`
		flyer.style.top = `${targetRect.top + targetRect.height / 2 - 10}px`
		flyer.style.width = '20px'
		flyer.style.height = '20px'
		flyer.style.opacity = '0'
		flyer.style.borderRadius = '50%'

		setTimeout(() => {
			flyer.remove()
			addToCartLocal(product)
			addToCartShopify(product)
			pulseBadge()
		}, 800)
	} else {
		addToCartLocal(product)
		addToCartShopify(product)
		pulseBadge()
	}
}

// Добавление в локальную корзину
function addToCartLocal(product) {
	if (typeof Cart !== 'undefined' && Cart.addItem) {
		Cart.addItem(product, true)
	}
}

// Добавление в Shopify корзину (если подключен)
async function addToCartShopify(product) {
	if (!shopifyConfig || !product.handle) {
		console.log('[Local mode] Product added locally:', product.title)
		return
	}

	try {
		// Получаем variantId если его нет
		let variantId = product.variantId
		if (!variantId && product.handle) {
			const cached = productCache.get(product.handle)
			variantId = cached?.variantId
		}

		if (!variantId) {
			console.warn('[Shopify] No variant ID found for:', product.handle)
			return
		}

		// Shopify Cart API - добавление товара
		const response = await fetch(
			`https://${shopifyConfig.store_domain}/cart/add.js`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					items: [
						{
							id: variantId,
							quantity: 1,
						},
					],
				}),
			},
		)

		if (response.ok) {
			const data = await response.json()
			console.log('[Shopify] Added to cart:', data)
		} else {
			console.warn('[Shopify] Failed to add to cart:', response.status)
		}
	} catch (error) {
		console.warn('[Shopify] Cart API error:', error)
	}
}

// Пульсация бейджа корзины
function pulseBadge() {
	const badge = document.getElementById('header-cart-count')
	if (badge) {
		badge.classList.remove('scale-100')
		badge.classList.add('scale-125', 'bg-purple-600')
		setTimeout(() => {
			badge.classList.remove('scale-125', 'bg-purple-600')
			badge.classList.add('scale-100')
		}, 200)
	}
}

// Cart.init() runs automatically when cart drawer exists on the page
/* -------------------- Product Detail Page (PDP) Module -------------------- */
;(function ProductDetailPage() {
	// State
	let currentProduct = null
	let selectedVariant = null
	let productData = {}
	let productMainSwiper = null
	let productThumbsSwiper = null
	let productLightboxSwiper = null
	let relatedProductsSwiper = null
	let productScenesSwiper = null

	// Get product handle from URL
	function getProductHandleFromURL() {
		if (CozySpotConfig.productHandle) return CozySpotConfig.productHandle
		const params = new URLSearchParams(window.location.search)
		return (
			params.get('handle') || params.get('product') || 'test-product-lamp'
		)
	}

	// Initialize PDP
	async function initProductPage() {
		const handle = getProductHandleFromURL()
		console.log('[PDP] Initializing product page for:', handle)

		// Show loading state
		showLoadingState()

		if (CozySpotConfig.productData && CozySpotConfig.productData.handle) {
			const mapped = mapLiquidProductToPdp(CozySpotConfig.productData)
			if (mapped) {
				currentProduct = mapped
				productData = {}
				renderProductPage(mapped)
				initProductSwipers()
				initMobileStickyBar()
				updateSEOMeta(mapped)
				console.log('[PDP] Product loaded from Liquid:', mapped)
				return
			}
		}

		try {
			// Load data.json
			if (!dataUrl) {
				showErrorState('Data source not configured')
				return
			}
			const response = await fetch(dataUrl)
			const data = await response.json()

			// Store shopify config
			if (data.shopify_config) {
				shopifyConfig = data.shopify_config
			}

			// Try to get product from Shopify first, then fallback
			let product = null

			if (
				shopifyConfig?.store_domain &&
				shopifyConfig?.storefront_access_token !==
					'YOUR_STOREFRONT_ACCESS_TOKEN'
			) {
				product = await fetchShopifyProductDetail(handle)
			}

			// Fallback to local data
			if (
				!product &&
				data.product_details &&
				data.product_details[handle]
			) {
				const localProduct = data.product_details[handle]
				product = {
					source: 'fallback',
					handle: localProduct.shopify_handle,
					...localProduct.fallback,
				}
			}

			if (!product) {
				showErrorState('Product not found')
				return
			}

			currentProduct = product
			productData = data

			// Render product
			renderProductPage(product)

			// Init swipers
			initProductSwipers()

			// Init sticky mobile bar
			initMobileStickyBar()

			// Load related products
			loadRelatedProducts(data, handle)

			// Load scenes with this product
			loadProductScenes(data, handle)

			// Update SEO meta
			updateSEOMeta(product)

			console.log('[PDP] Product loaded:', product)
		} catch (error) {
			console.error('[PDP] Failed to load product:', error)
			showErrorState('Failed to load product')
		}
	}

	// Fetch product detail from Shopify with extended fields
	async function fetchShopifyProductDetail(handle) {
		if (
			!shopifyConfig?.store_domain ||
			!shopifyConfig?.storefront_access_token
		) {
			return null
		}

		const query = `{
			product(handle: "${handle}") {
				id
				handle
				title
				descriptionHtml
				description
				vendor
				productType
				tags
				images(first: 10) {
					edges {
						node {
							url
							altText
							width
							height
						}
					}
				}
				variants(first: 20) {
					edges {
						node {
							id
							title
							sku
							availableForSale
							quantityAvailable
							price { amount currencyCode }
							compareAtPrice { amount }
							selectedOptions { name value }
							image { url }
						}
					}
				}
				options {
					name
					values
				}
			}
		}`

		try {
			const response = await fetch(
				`https://${shopifyConfig.store_domain}/api/2024-01/graphql.json`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-Shopify-Storefront-Access-Token':
							shopifyConfig.storefront_access_token,
					},
					body: JSON.stringify({ query }),
				},
			)

			if (!response.ok) return null

			const data = await response.json()
			const product = data?.data?.product

			if (product) {
				return {
					source: 'shopify',
					id: product.id,
					handle: product.handle,
					title: product.title,
					description: product.description,
					full_description: product.descriptionHtml,
					vendor: product.vendor,
					category: product.productType,
					tags: product.tags,
					images: product.images?.edges?.map(e => e.node.url) || [],
					price: product.variants?.edges?.[0]?.node?.price?.amount,
					old_price:
						product.variants?.edges?.[0]?.node?.compareAtPrice
							?.amount,
					currency:
						product.variants?.edges?.[0]?.node?.price
							?.currencyCode === 'EUR'
							? '€'
							: '$',
					sku: product.variants?.edges?.[0]?.node?.sku,
					available:
						product.variants?.edges?.[0]?.node?.availableForSale,
					quantity_available:
						product.variants?.edges?.[0]?.node?.quantityAvailable,
					variants:
						product.variants?.edges?.map(e => ({
							id: e.node.id,
							title: e.node.title,
							sku: e.node.sku,
							available: e.node.availableForSale,
							price: e.node.price?.amount,
							image: e.node.image?.url,
							options: e.node.selectedOptions,
						})) || [],
					options: product.options || [],
				}
			}
			return null
		} catch (err) {
			console.error('[PDP] Shopify fetch error:', err)
			return null
		}
	}

	// Show loading state
	function showLoadingState() {
		const title = document.getElementById('product-title')
		if (title) title.textContent = 'Loading...'
	}

	// Show error state
	function showErrorState(message) {
		const title = document.getElementById('product-title')
		if (title) title.textContent = message

		const desc = document.getElementById('product-short-description')
		if (desc)
			desc.textContent = 'Please check the product URL and try again.'
	}

	// Render product page
	function renderProductPage(product) {
		// Source indicator
		const sourceEl = document.getElementById('product-source')
		if (sourceEl) {
			if (product.source === 'shopify') {
				sourceEl.innerHTML = `<span class="inline-flex items-center gap-1 text-[8px] text-green-400 uppercase tracking-wider"><span class="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>Live from Shopify</span>`
			} else {
				sourceEl.innerHTML = `<span class="inline-flex items-center gap-1 text-[8px] text-white/30 uppercase tracking-wider"><span class="w-1.5 h-1.5 bg-white/30 rounded-full"></span>Local preview</span>`
			}
		}

		// Breadcrumbs
		const breadCategory = document.getElementById('breadcrumb-category')
		const breadProduct = document.getElementById('breadcrumb-product')
		if (breadCategory)
			breadCategory.textContent = product.category || 'Products'
		if (breadProduct) breadProduct.textContent = product.title

		// Category
		const categoryEl = document.getElementById('product-category')
		if (categoryEl) categoryEl.textContent = product.category || 'Product'

		// Title
		const titleEl = document.getElementById('product-title')
		if (titleEl) titleEl.textContent = product.title

		// Rating
		if (product.rating) {
			const ratingSection = document.getElementById('product-rating')
			const starsEl = document.getElementById('product-stars')
			const ratingValue = document.getElementById('product-rating-value')
			const reviewsCount = document.getElementById(
				'product-reviews-count',
			)

			if (ratingSection) ratingSection.classList.remove('hidden')
			if (starsEl)
				starsEl.innerHTML = renderStars(parseFloat(product.rating))
			if (ratingValue) ratingValue.textContent = product.rating
			if (reviewsCount)
				reviewsCount.textContent = `(${product.reviews_count || 0} reviews)`
		}

		// Price
		const priceEl = document.getElementById('product-price')
		const oldPriceEl = document.getElementById('product-old-price')
		const discountEl = document.getElementById('product-discount')
		const currency = product.currency || '$'

		if (priceEl && product.price) {
			priceEl.textContent = `${currency}${product.price}`
		}

		if (product.old_price && oldPriceEl && discountEl) {
			oldPriceEl.textContent = `${currency}${product.old_price}`
			oldPriceEl.classList.remove('hidden')

			const discount = Math.round(
				(1 - product.price / product.old_price) * 100,
			)
			discountEl.textContent = `-${discount}%`
			discountEl.classList.remove('hidden')
		}

		// Description
		const descEl = document.getElementById('product-short-description')
		if (descEl) descEl.textContent = product.description || ''

		// Full description
		const fullDescEl = document.getElementById('product-full-description')
		if (fullDescEl && product.full_description) {
			fullDescEl.innerHTML = product.full_description
		}

		// Images
		renderProductImages(product.images || [])

		// Badge
		const badgeEl = document.getElementById('product-badge')
		if (badgeEl && product.badge) {
			badgeEl.textContent = product.badge
			badgeEl.classList.remove('hidden')
			if (product.badge_style === 'hot') {
				badgeEl.classList.add('bg-red-500')
			}
		}

		// Variants
		renderVariants(product)

		// Stock
		const stockEl = document.getElementById('product-stock')
		if (stockEl) {
			if (product.available) {
				const qty = product.quantity_available
				if (qty && qty < 10) {
					stockEl.innerHTML = `<span class="w-2 h-2 bg-yellow-500 rounded-full inline-block mr-1"></span>Only ${qty} left`
				} else {
					stockEl.innerHTML = `<span class="w-2 h-2 bg-green-500 rounded-full inline-block mr-1"></span>In Stock`
				}
			} else {
				stockEl.innerHTML = `<span class="w-2 h-2 bg-red-500 rounded-full inline-block mr-1"></span>Out of Stock`
				// Disable add to cart
				const addBtn = document.getElementById('add-to-cart-btn')
				if (addBtn) {
					addBtn.disabled = true
					addBtn.classList.add('opacity-50', 'cursor-not-allowed')
					addBtn.classList.remove('hover:bg-gray-200')
				}
			}
		}

		// SKU
		const skuEl = document.getElementById('product-sku')
		if (skuEl) skuEl.textContent = product.sku || 'N/A'

		// Vendor
		const vendorEl = document.getElementById('product-vendor')
		if (vendorEl) vendorEl.textContent = product.vendor || 'CozySpot'

		// Specifications
		renderSpecifications(product.specifications || {})

		// Reviews
		renderReviews(
			product.reviews || [],
			product.rating,
			product.reviews_count,
		)

		// Mobile sticky bar
		const stickyPrice = document.getElementById('sticky-price')
		const stickyTitle = document.getElementById('sticky-title')
		if (stickyPrice) stickyPrice.textContent = `${currency}${product.price}`
		if (stickyTitle) stickyTitle.textContent = product.title
	}

	// Render stars HTML
	function renderStars(rating) {
		return Array(5)
			.fill(0)
			.map(
				(_, i) =>
					`<span class="text-sm ${i < Math.floor(rating) ? 'text-yellow-500' : 'text-white/20'}">★</span>`,
			)
			.join('')
	}

	// Render product images
	function renderProductImages(images) {
		const mainWrapper = document.getElementById('product-main-images')
		const thumbsWrapper = document.getElementById('product-thumbnails')
		const lightboxWrapper = document.getElementById('lightbox-images')

		if (!images.length) {
			images = [fallbackImage] // Default image
		}

		images = images.map(img => resolveAssetImage(img))

		// Main images
		if (mainWrapper) {
			mainWrapper.innerHTML = images
				.map(
					(img, i) => `
				<div class="swiper-slide">
					<img src="${img}" alt="Product image ${i + 1}" class="w-full h-full object-cover" />
				</div>
			`,
				)
				.join('')
		}

		// Thumbnails
		if (thumbsWrapper) {
			thumbsWrapper.innerHTML = images
				.map(
					(img, i) => `
				<div class="swiper-slide cursor-pointer opacity-50 hover:opacity-100 transition-opacity rounded-xl overflow-hidden border-2 border-transparent">
					<img src="${img}" alt="Thumbnail ${i + 1}" class="w-full h-full object-cover aspect-square" />
				</div>
			`,
				)
				.join('')
		}

		// Lightbox images
		if (lightboxWrapper) {
			lightboxWrapper.innerHTML = images
				.map(
					(img, i) => `
				<div class="swiper-slide flex items-center justify-center">
					<img src="${img}" alt="Product image ${i + 1}" class="max-w-full max-h-[80vh] object-contain rounded-xl" />
				</div>
			`,
				)
				.join('')
		}
	}

	// Render variants
	function renderVariants(product) {
		const variants = product.variants || []
		if (!variants.length) return

		// Check for color variants
		const colorVariants = variants.filter(v => v.color)
		if (colorVariants.length) {
			const colorSection = document.getElementById(
				'variant-color-section',
			)
			const colorContainer = document.getElementById('variant-colors')

			if (colorSection && colorContainer) {
				colorSection.classList.remove('hidden')
				colorContainer.innerHTML = colorVariants
					.map(
						(v, i) => `
					<button 
						class="variant-color-btn w-10 h-10 rounded-full border-2 ${i === 0 ? 'border-purple-500 ring-2 ring-purple-500/30' : 'border-white/20'} ${!v.available ? 'opacity-30 cursor-not-allowed relative' : ''} transition-all hover:scale-110"
						style="background-color: ${v.color}"
						data-variant-id="${v.id}"
						data-variant-title="${v.title}"
						data-variant-price="${v.price || product.price}"
						data-image-index="${v.image_index || 0}"
						${!v.available ? 'disabled title="Out of stock"' : ''}
						onclick="selectColorVariant(this)"
					>
						${!v.available ? '<span class="absolute inset-0 flex items-center justify-center"><span class="w-full h-0.5 bg-red-500 rotate-45 absolute"></span></span>' : ''}
					</button>
				`,
					)
					.join('')

				// Set initial selected color
				const selectedName = document.getElementById(
					'selected-color-name',
				)
				if (selectedName && colorVariants[0]) {
					selectedName.textContent = colorVariants[0].title
					selectedVariant = colorVariants[0]
				}
			}
		}

		// Check for size variants (non-color variants)
		const sizeVariants = variants.filter(v => !v.color && v.title)
		if (sizeVariants.length) {
			const sizeSection = document.getElementById('variant-size-section')
			const sizeContainer = document.getElementById('variant-sizes')

			if (sizeSection && sizeContainer) {
				sizeSection.classList.remove('hidden')
				sizeContainer.innerHTML = sizeVariants
					.map(
						(v, i) => `
					<button 
						class="variant-size-btn px-4 py-2 border ${i === 0 ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-white/20 text-white/60'} ${!v.available ? 'opacity-30 cursor-not-allowed line-through' : 'hover:border-white/40'} rounded-lg text-sm transition-all"
						data-variant-id="${v.id}"
						data-variant-price="${v.price || product.price}"
						${!v.available ? 'disabled' : ''}
						onclick="selectSizeVariant(this)"
					>
						${v.title}
					</button>
				`,
					)
					.join('')
			}
		}
	}

	// Render specifications table
	function renderSpecifications(specs) {
		const tableBody = document.getElementById('product-specs-table')
		if (!tableBody || !Object.keys(specs).length) return

		tableBody.innerHTML = Object.entries(specs)
			.map(
				([key, value]) => `
			<tr class="border-b border-white/5">
				<td class="py-4 text-white/40 text-sm w-1/3">${key}</td>
				<td class="py-4 text-white text-sm">${value}</td>
			</tr>
		`,
			)
			.join('')
	}

	// Render reviews
	function renderReviews(reviews, avgRating, totalCount) {
		// Tab count
		const tabCount = document.getElementById('tab-reviews-count')
		if (tabCount)
			tabCount.textContent = `(${totalCount || reviews.length || 0})`

		// Summary
		const avgEl = document.getElementById('reviews-average')
		const summaryStars = document.getElementById('reviews-stars-summary')
		const totalEl = document.getElementById('reviews-total')

		if (avgEl) avgEl.textContent = avgRating || '0.0'
		if (summaryStars)
			summaryStars.innerHTML = renderStars(parseFloat(avgRating) || 0)
		if (totalEl)
			totalEl.textContent = `Based on ${totalCount || reviews.length || 0} reviews`

		// Breakdown (calculate from reviews)
		const breakdown = document.getElementById('reviews-breakdown')
		if (breakdown && reviews.length) {
			const counts = [0, 0, 0, 0, 0] // 5,4,3,2,1 stars
			reviews.forEach(r => {
				if (r.rating >= 1 && r.rating <= 5) counts[5 - r.rating]++
			})
			const total = reviews.length

			breakdown.innerHTML = [5, 4, 3, 2, 1]
				.map((stars, i) => {
					const pct = total
						? Math.round((counts[i] / total) * 100)
						: 0
					return `
					<div class="flex items-center gap-3">
						<span class="text-xs text-white/40 w-8">${stars}★</span>
						<div class="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
							<div class="h-full bg-yellow-500 rounded-full" style="width: ${pct}%"></div>
						</div>
						<span class="text-xs text-white/40 w-8">${counts[i]}</span>
					</div>
				`
				})
				.join('')
		}

		// Reviews list
		const listEl = document.getElementById('reviews-list')
		if (listEl) {
			if (!reviews.length) {
				listEl.innerHTML =
					'<p class="text-white/40 text-sm">No reviews yet. Be the first to review this product!</p>'
			} else {
				listEl.innerHTML = reviews
					.map(
						r => `
					<div class="pb-6 border-b border-white/5">
						<div class="flex items-start justify-between mb-2">
							<div>
								<div class="flex items-center gap-2">
									<span class="font-bold">${r.author}</span>
									${r.verified ? '<span class="text-[8px] uppercase tracking-wider text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">Verified</span>' : ''}
								</div>
								<div class="flex items-center gap-2 mt-1">
									<div class="flex">${renderStars(r.rating)}</div>
									<span class="text-xs text-white/30">${r.date}</span>
								</div>
							</div>
						</div>
						<h4 class="font-bold text-sm mb-1">${r.title}</h4>
						<p class="text-white/60 text-sm">${r.content}</p>
					</div>
				`,
					)
					.join('')
			}
		}
	}

	// Init product swipers
	function initProductSwipers() {
		// Thumbnails swiper
		productThumbsSwiper = new Swiper('.productThumbsSwiper', {
			spaceBetween: 10,
			slidesPerView: 4,
			freeMode: true,
			watchSlidesProgress: true,
		})

		// Main swiper
		productMainSwiper = new Swiper('.productMainSwiper', {
			spaceBetween: 10,
			navigation: {
				nextEl: '.product-gallery-next',
				prevEl: '.product-gallery-prev',
			},
			thumbs: {
				swiper: productThumbsSwiper,
			},
			on: {
				slideChange: function () {
					// Update thumbnail active state
					const thumbs = document.querySelectorAll(
						'.productThumbsSwiper .swiper-slide',
					)
					thumbs.forEach((thumb, i) => {
						if (i === this.activeIndex) {
							thumb.classList.remove(
								'opacity-50',
								'border-transparent',
							)
							thumb.classList.add(
								'opacity-100',
								'border-purple-500',
							)
						} else {
							thumb.classList.add(
								'opacity-50',
								'border-transparent',
							)
							thumb.classList.remove(
								'opacity-100',
								'border-purple-500',
							)
						}
					})
				},
			},
		})

		// Lightbox swiper
		productLightboxSwiper = new Swiper('.productLightboxSwiper', {
			spaceBetween: 30,
			navigation: {
				nextEl: '.lightbox-next',
				prevEl: '.lightbox-prev',
			},
		})

		// Related products swiper
		relatedProductsSwiper = new Swiper('.relatedProductsSwiper', {
			spaceBetween: 20,
			slidesPerView: 1,
			breakpoints: {
				640: { slidesPerView: 2 },
				1024: { slidesPerView: 3 },
				1280: { slidesPerView: 4 },
			},
			pagination: {
				el: '.relatedProductsSwiper .swiper-pagination',
				clickable: true,
			},
		})

		// Product scenes swiper
		productScenesSwiper = new Swiper('.productScenesSwiper', {
			spaceBetween: 20,
			slidesPerView: 1,
			breakpoints: {
				640: { slidesPerView: 2 },
				1024: { slidesPerView: 3 },
			},
			pagination: {
				el: '.productScenesSwiper .swiper-pagination',
				clickable: true,
			},
		})
	}

	// Init mobile sticky bar
	function initMobileStickyBar() {
		const stickyBar = document.getElementById('mobile-sticky-cart')
		const productInfo = document.querySelector('.product-info')

		if (!stickyBar || !productInfo) return

		const observer = new IntersectionObserver(
			entries => {
				entries.forEach(entry => {
					if (entry.isIntersecting) {
						stickyBar.classList.add('translate-y-full')
					} else {
						stickyBar.classList.remove('translate-y-full')
					}
				})
			},
			{ threshold: 0 },
		)

		observer.observe(productInfo)
	}

	// Load related products
	function loadRelatedProducts(data, currentHandle) {
		const container = document.getElementById('related-products')
		if (!container || !data.featured_products) return

		const relatedProducts = data.featured_products
			.filter(
				p =>
					p.shopify_handle !== currentHandle &&
					p.shopify_handle !== '#',
			)
			.slice(0, 6)

		if (!relatedProducts.length) return

		container.innerHTML = relatedProducts
			.map(p => {
				const fb = p.fallback
				return `
				<div class="swiper-slide">
					<a href="${getProductUrl(p.shopify_handle)}" class="block group">
						<div class="aspect-square rounded-2xl overflow-hidden bg-[#0a0a0a] border border-white/5 mb-4">
							<img src="${resolveAssetImage(fb.image)}" alt="${fb.title}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
						</div>
						<span class="text-[10px] uppercase tracking-widest text-white/40">${fb.category || 'Product'}</span>
						<h3 class="font-bold text-lg mt-1 group-hover:text-purple-400 transition-colors">${fb.title}</h3>
						<div class="mt-2 font-mono">
							${fb.old_price ? `<span class="text-white/30 line-through mr-2">${fb.currency}${fb.old_price}</span>` : ''}
							<span class="font-bold">${fb.currency}${fb.price}</span>
						</div>
					</a>
				</div>
			`
			})
			.join('')
	}

	// Load scenes featuring this product
	function loadProductScenes(data, handle) {
		const section = document.getElementById('product-scenes-section')
		const container = document.getElementById('product-scenes')
		if (!section || !container || !data.gallery_scenes) return

		// Find scenes with this product in hotspots
		const scenes = data.gallery_scenes.filter(scene =>
			scene.hotspots?.some(h => h.shopify_handle === handle),
		)

		if (!scenes.length) return

		section.classList.remove('hidden')
		container.innerHTML = scenes
			.map(
				scene => `
			<div class="swiper-slide">
				<a href="${getShowcaseUrl()}#${scene.id}" class="block group relative aspect-video rounded-2xl overflow-hidden">
					<img src="${scene.image}" alt="${scene.title}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
					<div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-4">
						<span class="text-[10px] uppercase tracking-widest text-purple-400">${scene.category}</span>
						<h3 class="font-bold text-lg">${scene.title}</h3>
					</div>
				</a>
			</div>
		`,
			)
			.join('')
	}

	// Update SEO meta tags
	function updateSEOMeta(product) {
		// Title
		document.title = `${product.title} | CozySpot`

		// Description
		const metaDesc = document.querySelector('meta[name="description"]')
		if (metaDesc) metaDesc.content = product.description

		// Open Graph
		const ogTitle = document.getElementById('og-title')
		const ogDesc = document.getElementById('og-description')
		const ogImage = document.getElementById('og-image')
		const ogPrice = document.getElementById('og-price')

		if (ogTitle) ogTitle.content = product.title
		if (ogDesc) ogDesc.content = product.description
		if (ogImage && product.images?.[0]) ogImage.content = product.images[0]
		if (ogPrice) ogPrice.content = product.price

		// JSON-LD
		const jsonLd = document.getElementById('product-jsonld')
		if (jsonLd) {
			const schema = {
				'@context': 'https://schema.org/',
				'@type': 'Product',
				name: product.title,
				image: product.images || [],
				description: product.description,
				sku: product.sku || '',
				brand: {
					'@type': 'Brand',
					name: product.vendor || 'CozySpot',
				},
				offers: {
					'@type': 'Offer',
					priceCurrency: product.currency === '€' ? 'EUR' : 'USD',
					price: product.price,
					availability: product.available
						? 'https://schema.org/InStock'
						: 'https://schema.org/OutOfStock',
					itemCondition: 'https://schema.org/NewCondition',
				},
			}

			if (product.rating) {
				schema.aggregateRating = {
					'@type': 'AggregateRating',
					ratingValue: product.rating,
					reviewCount: product.reviews_count || 0,
				}
			}

			jsonLd.textContent = JSON.stringify(schema, null, 2)
		}
	}

	function autoInitPdp() {
		const hasPdp =
			document.querySelector('.productMainSwiper') ||
			document.getElementById('product-main-images')
		if (!hasPdp) return
		initProductPage()
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', autoInitPdp)
	} else {
		autoInitPdp()
	}

	// Expose functions globally
	window.initProductPage = initProductPage

	// Quantity functions
	window.incrementQuantity = function () {
		const input = document.getElementById('product-quantity')
		if (input && input.value < 99) {
			input.value = parseInt(input.value) + 1
		}
	}

	window.decrementQuantity = function () {
		const input = document.getElementById('product-quantity')
		if (input && input.value > 1) {
			input.value = parseInt(input.value) - 1
		}
	}

	window.validateQuantity = function (input) {
		if (input.value < 1) input.value = 1
		if (input.value > 99) input.value = 99
	}

	// Variant selection
	window.selectColorVariant = function (btn) {
		// Remove active state from all
		document.querySelectorAll('.variant-color-btn').forEach(b => {
			b.classList.remove(
				'border-purple-500',
				'ring-2',
				'ring-purple-500/30',
			)
			b.classList.add('border-white/20')
		})

		// Add active state to clicked
		btn.classList.add('border-purple-500', 'ring-2', 'ring-purple-500/30')
		btn.classList.remove('border-white/20')

		// Update selected name
		const selectedName = document.getElementById('selected-color-name')
		if (selectedName) selectedName.textContent = btn.dataset.variantTitle

		// Update price if variant has different price
		if (btn.dataset.variantPrice && currentProduct) {
			const priceEl = document.getElementById('product-price')
			const stickyPrice = document.getElementById('sticky-price')
			const currency = currentProduct.currency || '€'
			if (priceEl)
				priceEl.textContent = `${currency}${btn.dataset.variantPrice}`
			if (stickyPrice)
				stickyPrice.textContent = `${currency}${btn.dataset.variantPrice}`
		}

		// Change main image
		const imageIndex = parseInt(btn.dataset.imageIndex) || 0
		if (productMainSwiper) {
			productMainSwiper.slideTo(imageIndex)
		}

		selectedVariant = {
			id: btn.dataset.variantId,
			title: btn.dataset.variantTitle,
			price: btn.dataset.variantPrice,
		}
	}

	window.selectSizeVariant = function (btn) {
		// Remove active state from all
		document.querySelectorAll('.variant-size-btn').forEach(b => {
			b.classList.remove(
				'border-purple-500',
				'bg-purple-500/10',
				'text-white',
			)
			b.classList.add('border-white/20', 'text-white/60')
		})

		// Add active state to clicked
		btn.classList.add('border-purple-500', 'bg-purple-500/10', 'text-white')
		btn.classList.remove('border-white/20', 'text-white/60')

		// Update price if variant has different price
		if (btn.dataset.variantPrice && currentProduct) {
			const priceEl = document.getElementById('product-price')
			const stickyPrice = document.getElementById('sticky-price')
			const currency = currentProduct.currency || '€'
			if (priceEl)
				priceEl.textContent = `${currency}${btn.dataset.variantPrice}`
			if (stickyPrice)
				stickyPrice.textContent = `${currency}${btn.dataset.variantPrice}`
		}

		selectedVariant = {
			...selectedVariant,
			id: btn.dataset.variantId,
			price: btn.dataset.variantPrice,
		}
	}

	// Tab switching
	window.switchProductTab = function (tabName) {
		// Update buttons
		document.querySelectorAll('.product-tab-btn').forEach(btn => {
			if (btn.dataset.tab === tabName) {
				btn.classList.add('active', 'text-white', 'border-purple-500')
				btn.classList.remove('text-white/40', 'border-transparent')
			} else {
				btn.classList.remove(
					'active',
					'text-white',
					'border-purple-500',
				)
				btn.classList.add('text-white/40', 'border-transparent')
			}
		})

		// Update content
		document.querySelectorAll('.product-tab-content').forEach(content => {
			if (content.id === `tab-${tabName}`) {
				content.classList.remove('hidden')
			} else {
				content.classList.add('hidden')
			}
		})
	}

	// Lightbox
	window.openProductLightbox = function () {
		const lightbox = document.getElementById('product-lightbox')
		if (lightbox) {
			lightbox.classList.remove('hidden')
			lightbox.classList.add('flex')
			document.body.style.overflow = 'hidden'

			// Sync with main swiper position
			if (productLightboxSwiper && productMainSwiper) {
				productLightboxSwiper.slideTo(productMainSwiper.activeIndex)
			}
		}
	}

	window.closeProductLightbox = function () {
		const lightbox = document.getElementById('product-lightbox')
		if (lightbox) {
			lightbox.classList.add('hidden')
			lightbox.classList.remove('flex')
			document.body.style.overflow = ''
		}
	}

	// Close lightbox on escape
	document.addEventListener('keydown', e => {
		if (e.key === 'Escape') {
			closeProductLightbox()
		}
	})

	// Wishlist toggle
	window.toggleWishlist = function () {
		const btn = document.getElementById('wishlist-btn')
		if (!btn) return

		const svg = btn.querySelector('svg')
		const isActive = btn.classList.toggle('active')

		if (isActive) {
			svg.setAttribute('fill', 'currentColor')
			svg.classList.add('text-red-400')
			svg.classList.remove('text-white/60')
			btn.classList.add('border-red-400/50', 'bg-red-500/10')
		} else {
			svg.setAttribute('fill', 'none')
			svg.classList.remove('text-red-400')
			svg.classList.add('text-white/60')
			btn.classList.remove('border-red-400/50', 'bg-red-500/10')
		}
	}

	// Add to cart from PDP
	window.handlePDPAddToCart = function () {
		if (!currentProduct) return

		const quantity = parseInt(
			document.getElementById('product-quantity')?.value || 1,
		)
		const btn = document.getElementById('add-to-cart-btn')
		const btnText = document.getElementById('add-to-cart-text')

		if (!btn || !btnText) return

		// Disable button and show loading
		btn.disabled = true
		btnText.textContent = 'Adding...'
		btn.classList.add('opacity-70')

		// Prepare product data
		const productToAdd = {
			handle: currentProduct.handle,
			title: currentProduct.title,
			price: selectedVariant?.price || currentProduct.price,
			currency: currentProduct.currency,
			image: resolveAssetImage(
				currentProduct.images?.[0] || fallbackImage,
			),
			variantId: selectedVariant?.id,
			variantTitle: selectedVariant?.title,
			quantity: quantity,
		}

		// Simulate adding (or real add to cart)
		setTimeout(() => {
			// Add to local cart
			if (typeof Cart !== 'undefined' && Cart.addItem) {
				Cart.addItem(productToAdd, true)
			}

			// Success state
			btnText.textContent = 'Added!'
			btn.classList.remove('opacity-70')
			btn.classList.add('text-green-500')

			// Pulse badge
			pulseBadge()

			// Reset after delay
			setTimeout(() => {
				btn.disabled = false
				btnText.textContent = 'Add to Cart'
				btn.classList.remove('text-green-500')
			}, 2000)
		}, 800)
	}
})()
