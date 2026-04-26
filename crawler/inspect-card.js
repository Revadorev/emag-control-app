require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')

async function inspectCard() {
  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: true, args: ['--no-sandbox'] }
  )
  const page = await context.newPage()
  await page.goto('https://www.emag.ro/vendors/vendor/corecsrz?ref=seller-page-see-all-products', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 2000))

  // Ia HTML-ul primului card de produs
  const cardHtml = await page.$$eval('a[href*="/pd/"]', links => {
    for (const a of links) {
      const href = a.href
      if (!href.match(/\/pd\/[A-Z0-9]+/) || href.includes('review') || href.includes('feedback')) continue
      const card = a.closest('[class*="card"], li, [class*="item"]')
      if (card) return card.outerHTML.substring(0, 1500)
    }
    return 'nu gasit'
  })

  console.log('📋 HTML card produs:')
  console.log(cardHtml)

  await context.close()
}

inspectCard().catch(console.error)
