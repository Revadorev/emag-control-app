require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')

const PRODUCT_URL = 'https://www.emag.ro/ceas-smartwatch-barbati-techoner-wand-pro-2-inch-super-amoled-inteligent-fitness-sport-apel-bluetooth-hd-multi-sport-ritm-cardiac-multi-point-spo2-tensiune-oxigen-limba-romana-carcasa-metalica-2-curel/pd/DRD4WVYBM/'
const REVIEWS_URL = 'https://www.emag.ro/ceas-smartwatch-barbati-techoner-wand-pro-2-inch-super-amoled-inteligent-fitness-sport-apel-bluetooth-hd-multi-sport-ritm-cardiac-multi-point-spo2-tensiune-oxigen-limba-romana-carcasa-metalica-2-curel/pd/DRD4WVYBM/reviews/'

async function interceptAll() {
  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: true, args: ['--no-sandbox'] }
  )
  const page = await context.newPage()

  const allRequests = []

  // Interceptează TOATE request-urile
  page.on('request', req => {
    const url = req.url()
    if (url.includes('sapi') || url.includes('feedback') || url.includes('review') || url.includes('question')) {
      allRequests.push({ method: req.method(), url })
    }
  })

  // Interceptează responses cu date utile
  page.on('response', async res => {
    const url = res.url()
    if ((url.includes('review') || url.includes('feedback') || url.includes('question')) && res.status() === 200) {
      try {
        const json = await res.json()
        if (json && (Array.isArray(json) || (json.data && (Array.isArray(json.data) || typeof json.data === 'object')))) {
          console.log(`\n✅ RESPONSE [${res.status()}]: ${url.substring(0, 120)}`)
          console.log('   Keys:', Object.keys(json).join(', '))
          if (Array.isArray(json)) console.log('   Array length:', json.length)
          if (json.data && Array.isArray(json.data)) console.log('   data.length:', json.data.length)
          if (json.reviews) console.log('   reviews count:', Array.isArray(json.reviews) ? json.reviews.length : typeof json.reviews)
          // Printează primele câmpuri din primul item
          const firstItem = json.data?.[0] || json.reviews?.[0] || json[0]
          if (firstItem) console.log('   First item keys:', Object.keys(firstItem).join(', '))
        }
      } catch(e) {}
    }
  })

  // Pagina de reviews
  console.log('📍 Navighez la pagina de reviews...')
  await page.goto(REVIEWS_URL, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)

  // Scroll jos
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(2000)

  // Verifică login
  const isLogged = await page.evaluate(() => window.EM && window.EM.is_logged_in)
  console.log('\n🔑 Logged in:', isLogged)

  console.log('\n📋 Toate request-urile relevante:')
  allRequests.forEach(r => console.log(r.method, r.url.substring(0, 150)))

  await context.close()
}

interceptAll().catch(console.error)
