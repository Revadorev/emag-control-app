require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')

const PRODUCT_URL = 'https://www.emag.ro/ceas-smartwatch-barbati-techoner-wand-pro-2-inch-super-amoled-inteligent-fitness-sport-apel-bluetooth-hd-multi-sport-ritm-cardiac-multi-point-spo2-tensiune-oxigen-limba-romana-carcasa-metalica-2-curele-ip68-negru-p95-negru/pd/DRD4WVYBM/'

// Testam cu o intrebare recenta (202425274) si una veche (11102261)
const QUESTION_IDS = ['202425274', '11102261', '202398801']

async function findQuestionUrls() {
  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: true, args: ['--no-sandbox'] }
  )
  const page = await context.newPage()

  // Intercepteaza request-urile de questions
  page.on('response', async res => {
    if (res.url().includes('questions') && res.status() === 200) {
      try {
        const ct = res.headers()['content-type'] || ''
        if (ct.includes('json')) {
          const json = await res.json()
          if (json.questions?.items) {
            console.log('\n📥 Questions API response:')
            console.log('   Count:', json.questions.count)
            // Cauta view_url pentru intrebarile noastre
            json.questions.items.forEach(q => {
              console.log(`   ID: ${q.id} | view_url: ${q.view_url?.path || 'N/A'}`)
            })
          }
        }
      } catch(e) {}
    }
  })

  console.log('📍 Incarc pagina produsului...')
  await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 3000))

  // Scroll la intrebari pentru a triggera API call
  await page.evaluate(() => {
    const el = document.querySelector('[class*="question"], #user-questions-section')
    if (el) el.scrollIntoView()
    else window.scrollTo(0, document.body.scrollHeight)
  })
  await new Promise(r => setTimeout(r, 3000))

  // Cauta view_url in HTML pentru fiecare intrebare
  const questionLinks = await page.evaluate((ids) => {
    const results = {}
    ids.forEach(id => {
      const el = document.querySelector(`[data-id="${id}"]`)
      if (el) {
        // Cauta linkuri in elementul intrebarii
        const links = Array.from(el.querySelectorAll('a')).map(a => a.href)
        results[id] = { found: true, links }
      } else {
        results[id] = { found: false }
      }
    })

    // Si cauta toate intrebarile vizibile
    const allQ = Array.from(document.querySelectorAll('.js-question-item, [class*="question-item"]'))
    results._allVisible = allQ.map(el => ({
      id: el.getAttribute('data-id'),
      firstLink: el.querySelector('a')?.href || ''
    })).slice(0, 10)

    return results
  }, QUESTION_IDS)

  console.log('\n📋 Question links din pagina:')
  console.log(JSON.stringify(questionLinks, null, 2))

  // Incearca URL-uri directe pentru intrebari (similar cu review)
  const sefName = 'ceas-smartwatch-barbati-techoner-wand-pro-2-inch-super-amoled-inteligent-fitness-sport-apel-bluetooth-hd-multi-sport-ritm-cardiac-multi-point-spo2-tensiune-oxigen-limba-romana-carcasa-metalica-2-curele-ip68-negru-p95-negru'
  const pnk = 'DRD4WVYBM'

  for (const qId of QUESTION_IDS) {
    const testUrl = `https://www.emag.ro/product-feedback/${sefName}/pd/${pnk}/question/${qId}`
    console.log(`\n🔗 Test URL intrebare ${qId}:`)
    console.log('   ', testUrl)

    await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
    await new Promise(r => setTimeout(r, 2000))

    const found = await page.evaluate((qId) => {
      const el = document.querySelector(`[data-id="${qId}"]`)
      const title = document.title
      const h1 = document.querySelector('h1')?.innerText || ''
      return { el: !!el, title, h1: h1.substring(0, 80), url: window.location.href }
    }, qId)
    console.log('   Rezultat:', JSON.stringify(found))
  }

  await context.close()
}

findQuestionUrls().catch(console.error)
