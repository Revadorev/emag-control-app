require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')

const PRODUCT_URL = 'https://www.emag.ro/ceas-smartwatch-barbati-techoner-wand-pro-2-inch-super-amoled-inteligent-fitness-sport-apel-bluetooth-hd-multi-sport-ritm-cardiac-multi-point-spo2-tensiune-oxigen-limba-romana-carcasa-metalica-2-curel/pd/DRD4WVYBM/'
const PRODUCT_ID = 74793880

async function testApi() {
  console.log('🔍 Testez API-ul SAPI eMAG...\n')

  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: true, args: ['--no-sandbox'] }
  )

  const page = await context.newPage()

  // Interceptăm request-urile de tip SAPI
  const sapiRequests = []
  page.on('request', req => {
    if (req.url().includes('sapi.emag.ro') || req.url().includes('feedback') || req.url().includes('review') || req.url().includes('question')) {
      sapiRequests.push({ url: req.url(), method: req.method() })
    }
  })

  page.on('response', async res => {
    const url = res.url()
    if ((url.includes('feedback') || url.includes('review') || url.includes('question')) && res.status() === 200) {
      try {
        const json = await res.json()
        console.log('\n📡 API Response:', url.substring(0, 100))
        console.log('   Keys:', Object.keys(json).join(', '))
        if (json.data) {
          const data = Array.isArray(json.data) ? json.data : [json.data]
          console.log('   Items count:', data.length)
          if (data[0]) console.log('   First item keys:', Object.keys(data[0]).join(', '))
        }
      } catch(e) {}
    }
  })

  await page.goto(PRODUCT_URL, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)

  console.log('\n📋 SAPI requests interceptate:')
  sapiRequests.slice(0, 20).forEach(r => console.log(' ', r.method, r.url.substring(0, 120)))

  // Testează direct API-ul de recenzii
  console.log('\n\n🔄 Testez direct API recenzii...')
  try {
    const reviewsRes = await page.evaluate(async (productId) => {
      const res = await fetch(`https://sapi.emag.ro/review/count-filters?product_id=${productId}&source_id=1`, {
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
      })
      return { status: res.status, data: await res.text() }
    }, PRODUCT_ID)
    console.log('Review count API:', reviewsRes.status, reviewsRes.data.substring(0, 200))
  } catch(e) {
    console.log('Eroare:', e.message)
  }

  // Testează API recenzii cu rating filter
  console.log('\n🔄 Testez API recenzii cu paginare...')
  try {
    const res = await page.evaluate(async (productId) => {
      const body = JSON.stringify({
        product_id: productId,
        source_id: 1,
        page: 1,
        per_page: 5,
        sort: 'created',
        sort_dir: 'desc'
      })
      const r = await fetch('https://sapi.emag.ro/review/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body
      })
      return { status: r.status, data: await r.text() }
    }, PRODUCT_ID)
    console.log('Status:', res.status)
    const parsed = JSON.parse(res.data)
    console.log('Keys:', Object.keys(parsed).join(', '))
    if (parsed.data && parsed.data[0]) {
      console.log('First review keys:', Object.keys(parsed.data[0]).join(', '))
      console.log('Rating:', parsed.data[0].rating || parsed.data[0].mark)
      console.log('Content:', (parsed.data[0].content || parsed.data[0].body || '').substring(0, 100))
    }
  } catch(e) {
    console.log('Eroare:', e.message)
  }

  await context.close()
  console.log('\n✅ Test finalizat!')
}

testApi().catch(console.error)
