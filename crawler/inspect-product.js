require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

const PRODUCT_URL = 'https://www.emag.ro/ceas-smartwatch-barbati-techoner-wand-pro-2-inch-super-amoled-inteligent-fitness-sport-apel-bluetooth-hd-multi-sport-ritm-cardiac-multi-point-spo2-tensiune-oxigen-limba-romana-carcasa-metalica-2-curel/pd/DRD4WVYBM/'

async function inspect() {
  console.log('🔍 Inspectez pagina produsului...')

  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: true, args: ['--no-sandbox'] }
  )

  const page = await context.newPage()

  try {
    await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(3000)
    console.log('📍 URL:', page.url())

    // Salvează HTML
    const html = await page.content()
    fs.writeFileSync('emag-page.html', html)
    console.log('💾 HTML salvat (' + Math.round(html.length/1024) + ' KB)')

    // Caută linkuri/butoane cu text recenzii/întrebări
    const links = await page.$$eval('a, button', els => 
      els.filter(e => {
        const t = (e.innerText || '').toLowerCase()
        return t.includes('recenz') || t.includes('review') || t.includes('intreb') || t.includes('question') || t.includes('p\u0103reri')
      }).map(e => ({
        tag: e.tagName,
        text: (e.innerText || '').trim().substring(0, 80),
        href: e.href || '',
        cls: (e.className || '').substring(0, 60)
      }))
    )
    console.log('\n📋 Linkuri/butoane recenzii/întrebări:')
    links.forEach(l => console.log(' ', l.tag, '|', l.text, '|', l.href.substring(0,80)))

    // Caută divuri/sectiuni cu review/rating in class
    const divs = await page.$$eval('[class*="review"], [class*="rating"], [class*="recenz"], [id*="review"], [id*="recenz"]', els =>
      els.slice(0,15).map(e => ({
        tag: e.tagName,
        cls: (e.className || '').substring(0, 80),
        id: e.id || '',
        text: (e.innerText || '').substring(0, 60)
      }))
    )
    console.log('\n📋 Elemente cu review/rating în class:')
    divs.forEach(d => console.log(' ', d.tag, d.id ? '#'+d.id : '', '.'+d.cls.split(' ')[0], '|', d.text.replace(/\n/g,' ')))

    // Caută elemente cu question în class
    const qdivs = await page.$$eval('[class*="question"], [class*="intrebare"], [id*="question"]', els =>
      els.slice(0,10).map(e => ({
        tag: e.tagName,
        cls: (e.className || '').substring(0, 80),
        id: e.id || '',
        text: (e.innerText || '').substring(0, 60)
      }))
    )
    console.log('\n📋 Elemente cu question în class:')
    qdivs.forEach(d => console.log(' ', d.tag, d.id ? '#'+d.id : '', '.'+d.cls.split(' ')[0], '|', d.text.replace(/\n/g,' ')))

  } catch (e) {
    console.error('❌ Eroare:', e.message)
  } finally {
    await context.close()
    console.log('\n✅ Gata!')
  }
}

inspect()
