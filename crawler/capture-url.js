require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')

const PRODUCT_URL = 'https://www.emag.ro/ceas-smartwatch-barbati-techoner-wand-pro-2-inch-super-amoled-inteligent-fitness-sport-apel-bluetooth-hd-multi-sport-ritm-cardiac-multi-point-spo2-tensiune-oxigen-limba-romana-carcasa-metalica-2-curel/pd/DRD4WVYBM/'

async function captureExactUrl() {
  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: true, args: ['--no-sandbox'] }
  )
  const page = await context.newPage()

  // Capturam TOATE request-urile catre product-feedback
  const feedbackRequests = []
  page.on('request', req => {
    if (req.url().includes('product-feedback')) {
      feedbackRequests.push({
        method: req.method(),
        url: req.url(),
        headers: req.headers()
      })
    }
  })

  page.on('response', async res => {
    if (res.url().includes('product-feedback')) {
      try {
        const json = await res.json()
        console.log('\n📥 RESPONSE de la:', res.url())
        console.log('   Status:', res.status())
        console.log('   Keys de top nivel:', Object.keys(json).join(', '))
        if (json.reviews) {
          console.log('   reviews.count:', json.reviews.count)
          // Verifică dacă reviews are items sau alt format
          console.log('   reviews keys:', Object.keys(json.reviews).join(', '))
          if (json.reviews.items) {
            console.log('   reviews.items length:', json.reviews.items.length)
            if (json.reviews.items[0]) {
              console.log('   primul item keys:', Object.keys(json.reviews.items[0]).join(', '))
              console.log('   primul item rating:', json.reviews.items[0].rating)
            }
          }
          if (json.reviews.first_item) {
            console.log('   first_item.id:', json.reviews.first_item.id)
            console.log('   first_item.rating:', json.reviews.first_item.rating)
          }
        }
      } catch(e) {}
    }
  })

  console.log('📍 Încarc pagina...')
  await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3000)

  // Scroll la recenzii
  await page.evaluate(() => {
    const el = document.querySelector('.reviews-section')
    if (el) el.scrollIntoView()
  })
  await page.waitForTimeout(2000)

  // Click pe 1 stea
  console.log('\n🖱️ Click pe filtrul 1 stea...')
  const oneStarBar = await page.$('.reviews-summary-bars.rating-1-stars')
  if (oneStarBar) {
    await oneStarBar.click()
    await page.waitForTimeout(3000)
  }

  // Click pe 2 stele
  console.log('🖱️ Click pe filtrul 2 stele...')
  const twoStarBar = await page.$('.reviews-summary-bars.rating-2-stars')
  if (twoStarBar) {
    await twoStarBar.click()
    await page.waitForTimeout(3000)
  }

  console.log('\n📋 Toate request-urile catre product-feedback:')
  feedbackRequests.forEach(r => {
    console.log(`\n  ${r.method} ${r.url}`)
    if (r.headers['x-requested-with']) console.log('  X-Requested-With:', r.headers['x-requested-with'])
    if (r.headers['accept']) console.log('  Accept:', r.headers['accept'])
  })

  await context.close()
}

captureExactUrl().catch(console.error)
