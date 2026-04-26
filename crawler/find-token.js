require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')

const PRODUCT_URL = 'https://www.emag.ro/ceas-smartwatch-barbati-techoner-wand-pro-2-inch-super-amoled-inteligent-fitness-sport-apel-bluetooth-hd-multi-sport-ritm-cardiac-multi-point-spo2-tensiune-oxigen-limba-romana-carcasa-metalica-2-curel/pd/DRD4WVYBM/'

async function findToken() {
  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: true, args: ['--no-sandbox'] }
  )
  const page = await context.newPage()

  // Interceptăm response-ul de la feedback-center și review
  let reviewsData = null
  let questionsData = null
  let token = null

  page.on('request', req => {
    const url = req.url()
    // Extragem token-ul din orice request SAPI
    const tokenMatch = url.match(/token=([^&]+)/)
    if (tokenMatch && !token) {
      token = decodeURIComponent(tokenMatch[1])
    }
  })

  page.on('response', async res => {
    const url = res.url()
    try {
      if (url.includes('feedback-center/product/center')) {
        const data = await res.json()
        console.log('\n✅ FEEDBACK CENTER response:')
        console.log('Keys:', Object.keys(data))
        if (data.data) {
          console.log('data keys:', Object.keys(data.data))
          // Caută recenzii în răspuns
          const d = data.data
          console.log('Full data:', JSON.stringify(d).substring(0, 500))
        }
        reviewsData = data
      }
    } catch(e) {}
  })

  console.log('📍 Încărcare pagină...')
  await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3000)

  console.log('\n🔑 Token extras:', token ? token.substring(0, 50) + '...' : 'NU GĂSIT')

  if (token) {
    // Încearcă API-urile cu token
    console.log('\n🔄 Testez API-uri cu token...')

    const apis = [
      `https://sapi.emag.ro/review/list?token=${encodeURIComponent(token)}&source_id=7`,
      `https://sapi.emag.ro/product-feedback/list?token=${encodeURIComponent(token)}&source_id=7`,
      `https://sapi.emag.ro/feedback/reviews?token=${encodeURIComponent(token)}&source_id=7&product_id=74793880`,
    ]

    for (const apiUrl of apis) {
      const result = await page.evaluate(async ({ url, tok }) => {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
              'Authorization': `Bearer ${tok}`
            },
            body: JSON.stringify({ product_id: 74793880, source_id: 7, page: 1, per_page: 5 })
          })
          const data = await res.json()
          return { status: res.status, keys: Object.keys(data), dataLen: Array.isArray(data.data) ? data.data.length : typeof data.data }
        } catch(e) { return { error: e.message } }
      }, { url: apiUrl.split('?')[0], tok: token })
      console.log(apiUrl.split('?')[0].replace('https://sapi.emag.ro', ''), '→', JSON.stringify(result))
    }

    // Încearcă direct cu token în URL (cum face eMAG)
    console.log('\n🔄 Testez cu token în URL (GET requests)...')
    const getApis = [
      `https://sapi.emag.ro/review/list?token=${encodeURIComponent(token)}&source_id=7&product_id=74793880&page=1&per_page=5`,
      `https://sapi.emag.ro/feedback-center/reviews?token=${encodeURIComponent(token)}&source_id=7&entity_id=74793880`,
      `https://sapi.emag.ro/feedback-center/questions?token=${encodeURIComponent(token)}&source_id=7&entity_id=74793880`,
    ]
    for (const apiUrl of getApis) {
      const result = await page.evaluate(async ({ url }) => {
        try {
          const res = await fetch(url)
          const data = await res.json()
          return { status: res.status, keys: Object.keys(data), dataLen: Array.isArray(data.data) ? data.data.length : typeof data.data, sample: JSON.stringify(data).substring(0, 200) }
        } catch(e) { return { error: e.message } }
      }, { url: apiUrl })
      const short = apiUrl.split('?')[0].replace('https://sapi.emag.ro', '')
      const icon = result.status === 200 ? '✅' : '❌'
      console.log(`${icon} GET ${short} → status=${result.status} dataLen=${result.dataLen}`)
      if (result.status === 200) console.log('   Sample:', result.sample)
    }
  }

  // Salvează token pentru utilizare ulterioară
  if (token) {
    const fs = require('fs')
    fs.writeFileSync('emag-token.json', JSON.stringify({ token, extracted_at: new Date().toISOString() }))
    console.log('\n💾 Token salvat în emag-token.json')
  }

  await context.close()
}

findToken().catch(console.error)
