/* PDP Module (extracted from script.js) */
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

		if (CozySpotConfig.productData && CozySpotConfig.productData.handle) {
			const mapped = mapLiquidProductToPdp(CozySpotConfig.productData)
			if (mapped) {
				currentProduct = mapped
				productData = {}
				renderVariants(mapped)
				renderProductImages(mapped.images || [])
				initProductSwipers()
				initMobileStickyBar()
				updateSEOMeta(mapped)
				console.log('[PDP] Product loaded from Liquid:', mapped)
				return
			}
		}

		// Show loading state
		showLoadingState()

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

		// Price
		const priceEl = document.getElementById('product-price')
		const oldPriceEl = document.getElementById('product-old-price')
		const discountEl = document.getElementById('product-discount')
		const currency = product.currency || '$'
		const numericPrice = parseFloat(product.price)
		const numericOldPrice = parseFloat(product.old_price)
		const hasDiscount =
			!Number.isNaN(numericOldPrice) &&
			!Number.isNaN(numericPrice) &&
			numericOldPrice > numericPrice

		if (priceEl && product.price) {
			priceEl.textContent = `${currency}${product.price}`
		}

		if (oldPriceEl && discountEl) {
			if (hasDiscount) {
				oldPriceEl.textContent = `${currency}${product.old_price}`
				oldPriceEl.classList.remove('hidden')

				const discount = Math.round(
					(1 - numericPrice / numericOldPrice) * 100,
				)
				discountEl.textContent = `-${discount}%`
				discountEl.classList.remove('hidden')
			} else {
				oldPriceEl.classList.add('hidden')
				discountEl.classList.add('hidden')
			}
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

		// Mobile sticky bar
		const stickyPrice = document.getElementById('sticky-price')
		const stickyTitle = document.getElementById('sticky-title')
		if (stickyPrice) stickyPrice.textContent = `${currency}${product.price}`
		if (stickyTitle) stickyTitle.textContent = product.title
	}

	function updateVariantPriceDisplay(price) {
		if (!currentProduct || price === null || price === undefined) return
		const priceEl = document.getElementById('product-price')
		const stickyPrice = document.getElementById('sticky-price')
		const currency = currentProduct.currency || '€'
		if (priceEl) priceEl.textContent = `${currency}${price}`
		if (stickyPrice) stickyPrice.textContent = `${currency}${price}`
	}

	function updateAddToCartButtonVariant(variant) {
		const addBtn = document.getElementById('add-to-cart-btn')
		if (!addBtn || !variant) return
		addBtn.dataset.variantId = variant.id || ''
		if (variant.price) addBtn.dataset.price = variant.price
		if (variant.image)
			addBtn.dataset.image = resolveAssetImage(variant.image)
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
			const hasMainSlides = mainWrapper.querySelector('.swiper-slide')
			if (hasMainSlides) {
				// Keep Liquid-rendered slides
			} else {
				mainWrapper.innerHTML = images
					.map(
						(img, i) => `
				<div class="swiper-slide">
					<img src="${img}" alt="Product image ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}" class="w-full h-full object-cover" />
				</div>
			`,
					)
					.join('')
			}
		}

		// Thumbnails
		if (thumbsWrapper) {
			const hasThumbSlides = thumbsWrapper.querySelector('.swiper-slide')
			if (hasThumbSlides) {
				// Keep Liquid-rendered slides
			} else {
				thumbsWrapper.innerHTML = images
					.map(
						(img, i) => `
				<div class="swiper-slide cursor-pointer opacity-50 hover:opacity-100 transition-opacity rounded-xl overflow-hidden border-2 border-transparent">
					<img src="${img}" alt="Thumbnail ${i + 1}" loading="lazy" class="w-full h-full object-cover aspect-square" />
				</div>
			`,
					)
					.join('')
			}
		}

		// Lightbox images
		if (lightboxWrapper) {
			lightboxWrapper.innerHTML = images
				.map(
					(img, i) => `
				<div class="swiper-slide flex items-center justify-center">
					<img src="${img}" alt="Product image ${i + 1}" loading="lazy" class="max-w-full max-h-[80vh] object-contain rounded-xl" />
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
					updateAddToCartButtonVariant(selectedVariant)
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

				if (sizeVariants[0]) {
					selectedVariant = sizeVariants[0]
					updateAddToCartButtonVariant(selectedVariant)
					updateVariantPriceDisplay(selectedVariant.price)
				}
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

	onDomReady(autoInitPdp)

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
			updateVariantPriceDisplay(btn.dataset.variantPrice)
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
		updateAddToCartButtonVariant(selectedVariant)
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
			updateVariantPriceDisplay(btn.dataset.variantPrice)
		}

		selectedVariant = {
			...selectedVariant,
			id: btn.dataset.variantId,
			price: btn.dataset.variantPrice,
		}
		updateAddToCartButtonVariant(selectedVariant)
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
	window.handlePDPAddToCart = async function () {
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

		await addToCart({
			handle: currentProduct.handle,
			variantId: selectedVariant?.id,
			variantTitle: selectedVariant?.title,
			title: currentProduct.title,
			price: selectedVariant?.price || currentProduct.price,
			image: currentProduct.images?.[0] || fallbackImage,
			quantity: quantity,
			sourceEl: btn,
		})

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
	}
})()
