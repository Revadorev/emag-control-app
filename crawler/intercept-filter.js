require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')

const PRODUCT_URL = 'https://www.emag.ro/ceas-smartwatch-barbati-techoner-wand-pro-2-inch-super-amoled-inteligent-fitness-sport-apel-bluetooth-hd-multi-sport-ritm-cardiac-multi-point-spo2-tensiune-oxigen-limba-romana-carcasa-metalica-2-curel/pd/DRD4WVYBM/'

async function interceptFilter() {
  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: true, args: ['--no-sandbox'] }
  )
  const page = await context.newPage()

  // Interceptează TOATE request-urile după ce dăm click pe filtru
  const requests = []
  page.on('request', req => {
    requests.push({ method: req.method(), url: req.url(), postData: req.postData() })
  })

  page.on('response', async res => {
    const url = res.url()
    // Orice response cu date JSON relevant
    if (res.status() === 200 && !url.includes('google') && !url.includes('doubleclick') && !url.includes('pagead')) {
      try {
        const ct = res.headers()['content-type'] || ''
        if (ct.includes('json')) {
          const json = await res.json()
          if (json && Object.keys(json).length > 1) {
            console.log(`\n✅ JSON Response: ${url.substring(0, 120)}`)
            console.log('   Keys:', Object.keys(json).join(', '))
            if (json.reviews) console.log('   reviews count:', Array.isArray(json.reviews) ? json.reviews.length : typeof json.reviews)
            if (json.data && Array.isArray(json.data)) {
              console.log('   data count:', json.data.length)
              if (json.data[0]) console.log('   first item keys:', Object.keys(json.data[0]).join(', '))
            }
            // Salvează dacă pare a fi recenzii
            if (json.reviews || (json.data && Array.isArray(json.data) && json.data.length > 0)) {
              const fs = require('fs')
              fs.writeFileSync('api-response.json', JSON.stringify(json, null, 2))
              console.log('   💾 Salvat în api-response.json!')
            }
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
    const el = document.querySelector('.reviews-section, .js-reviews-container')
    if (el) el.scrollIntoView()
  })
  await page.waitForTimeout(2000)

  // Click pe filtrul de 1 stea
  console.log('🖱️ Caut filtrul de 1 stea...')
  const oneStarFilter = await page.$('.reviews-summary-bars.rating-1-stars, [class*="rating-1"]')
  if (oneStarFilter) {
    console.log('✅ Găsit! Dau click...')
    await oneStarFilter.click()
    await page.waitForTimeout(3000)
    console.log('✅ Click făcut, aștept răspuns...')
  } else {
    console.log('❌ Nu am găsit filtrul de 1 stea')
    // Încearcă să găsim orice buton de rating
    const ratingBars = await page.$$('[class*="rating-"][class*="stars"]')
    console.log(`   Găsit ${ratingBars.length} bare de rating`)
    if (ratingBars.length > 0) {
      await ratingBars[ratingBars.length - 1].click()
      await page.waitForTimeout(3000)
    }
  }

  await page.waitForTimeout(2000)

  console.log('\n📋 Request-uri făcute după click:')
  const newRequests = requests.filter(r => !r.url.includes('google') && !r.url.includes('doubleclick'))
  newRequests.slice(-20).forEach(r => {
    console.log(r.method, r.url.substring(0, 150))
    if (r.postData) console.log('  POST data:', r.postData.substring(0, 200))
  })

  await context.close()
}

interceptFilter().catch(console.error)
