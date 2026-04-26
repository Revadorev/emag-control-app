require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

const PRODUCT_URL = 'https://www.emag.ro/ceas-smartwatch-barbati-techoner-wand-pro-2-inch-super-amoled-inteligent-fitness-sport-apel-bluetooth-hd-multi-sport-ritm-cardiac-multi-point-spo2-tensiune-oxigen-limba-romana-carcasa-metalica-2-curel/pd/DRD4WVYBM/'

async function dumpReviews() {
  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: true, args: ['--no-sandbox'] }
  )
  const page = await context.newPage()

  console.log('📍 Navighez la pagina produsului...')
  await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)

  console.log('🔑 Logged:', await page.evaluate(() => window.EM && window.EM.is_logged_in))

  // Scroll la sectiunea de recenzii pentru a triggera lazy load
  console.log('📜 Scroll la recenzii...')
  await page.evaluate(() => {
    const el = document.querySelector('#reviews, [id*="review"], [class*="review"], a[href*="review"]')
    if (el) el.scrollIntoView()
    else window.scrollTo(0, document.body.scrollHeight * 0.7)
  })
  await page.waitForTimeout(4000)

  // Scroll mai jos
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(3000)

  // Salvează HTML după scroll
  const html = await page.content()
  fs.writeFileSync('product-page.html', html)
  console.log('💾 HTML salvat (' + Math.round(html.length/1024) + 'KB)')

  // Caută orice element care conține text de recenzie
  const reviewSection = await page.evaluate(() => {
    // Caută secțiunea de recenzii după text
    const allDivs = document.querySelectorAll('div, section, article, ul, li')
    const results = []
    for (const el of allDivs) {
      const cls = (el.className || '').toString().toLowerCase()
      const id = (el.id || '').toLowerCase()
      if (cls.includes('review') || cls.includes('recenz') || cls.includes('feedback') ||
          id.includes('review') || id.includes('recenz') || id.includes('feedback')) {
        results.push({
          tag: el.tagName,
          cls: (el.className || '').toString().substring(0, 120),
          id: el.id,
          childCount: el.children.length,
          textSnippet: (el.innerText || '').substring(0, 100).replace(/\n/g, ' ')
        })
        if (results.length >= 20) break
      }
    }
    return results
  })

  console.log('\n📋 Secțiuni cu review/recenz/feedback în class/id:')
  reviewSection.forEach(e => {
    console.log(`\n  <${e.tag} class="${e.cls}" id="${e.id}"> (${e.childCount} copii)`)
    console.log(`    Text: "${e.textSnippet}"`)
  })

  // Caută și în toate clasele disponibile
  const allClasses = await page.evaluate(() => {
    const classes = new Set()
    document.querySelectorAll('*').forEach(el => {
      if (el.className && typeof el.className === 'string') {
        el.className.split(' ').forEach(c => { if (c.length > 3) classes.add(c) })
      }
    })
    return [...classes].filter(c =>
      c.includes('review') || c.includes('recenz') || c.includes('feedback') ||
      c.includes('rating') || c.includes('star') || c.includes('comment') ||
      c.includes('opinion')
    )
  })
  console.log('\n📋 Toate clasele CSS relevante găsite:', allClasses.join(', '))

  await context.close()
  console.log('\n✅ Gata!')
}

dumpReviews().catch(console.error)
