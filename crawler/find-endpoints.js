require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')

const PRODUCT_URL = 'https://www.emag.ro/ceas-smartwatch-barbati-techoner-wand-pro-2-inch-super-amoled-inteligent-fitness-sport-apel-bluetooth-hd-multi-sport-ritm-cardiac-multi-point-spo2-tensiune-oxigen-limba-romana-carcasa-metalica-2-curel/pd/DRD4WVYBM/'

async function findEndpoints() {
  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: true, args: ['--no-sandbox'] }
  )
  const page = await context.newPage()

  // Interceptează TOATE request-urile sapi
  const allSapi = []
  page.on('request', req => {
    if (req.url().includes('sapi.emag.ro')) {
      allSapi.push({ method: req.method(), url: req.url() })
    }
  })

  await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)

  // Scroll jos să triggeram lazy load
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(2000)

  console.log('\n📡 Toate request-urile SAPI:')
  allSapi.forEach(r => console.log(r.method, r.url))

  // Testează mai multe endpoint-uri posibile pentru recenzii
  console.log('\n\n🔄 Testez endpoint-uri recenzii...')
  const endpoints = [
    { url: 'https://sapi.emag.ro/review/list', method: 'POST', body: { product_id: 74793880, source_id: 7, page: 1, per_page: 5 } },
    { url: 'https://sapi.emag.ro/feedback/list', method: 'POST', body: { product_id: 74793880, source_id: 7, page: 1, per_page: 5 } },
    { url: 'https://sapi.emag.ro/product-review/list', method: 'POST', body: { product_id: 74793880, source_id: 7 } },
    { url: 'https://sapi.emag.ro/feedback-center/product/center?source_id=7&entity_id=74793880', method: 'GET' },
  ]

  for (const ep of endpoints) {
    const result = await page.evaluate(async ({ url, method, body }) => {
      try {
        const opts = { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } }
        if (body) opts.body = JSON.stringify(body)
        const res = await fetch(url, opts)
        const data = await res.json()
        return { status: res.status, keys: Object.keys(data), dataLen: Array.isArray(data.data) ? data.data.length : 'N/A', sample: JSON.stringify(data).substring(0, 200) }
      } catch(e) { return { error: e.message } }
    }, { url: ep.url, method: ep.method, body: ep.body })
    console.log(`\n${ep.method} ${ep.url.replace('https://sapi.emag.ro', '')}`)
    console.log('  Status:', result.status, '| Keys:', result.keys?.join(', '), '| Data len:', result.dataLen)
    if (result.status === 200 && result.dataLen > 0) console.log('  ✅ ARE DATE! Sample:', result.sample)
  }

  // Testează endpoint-uri întrebări
  console.log('\n\n🔄 Testez endpoint-uri întrebări...')
  const qEndpoints = [
    'product-question/list', 'question/list', 'questions/list',
    'product-question/index', 'user-question/list', 'qa/list'
  ]
  for (const ep of qEndpoints) {
    const result = await page.evaluate(async ({ endpoint }) => {
      try {
        const res = await fetch(`https://sapi.emag.ro/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ product_id: 74793880, source_id: 7, page: 1, per_page: 5 })
        })
        const data = await res.json()
        return { status: res.status, keys: Object.keys(data), dataLen: Array.isArray(data.data) ? data.data.length : 'N/A' }
      } catch(e) { return { error: e.message } }
    }, { endpoint: ep })
    const icon = result.status === 200 ? '✅' : '❌'
    console.log(`${icon} ${ep}: status=${result.status} keys=${result.keys?.join(',') || result.error} dataLen=${result.dataLen}`)
  }

  await context.close()
}

findEndpoints().catch(console.error)
