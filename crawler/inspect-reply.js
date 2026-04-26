require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

// Recenzia de 1 stea — Arcashul46 (ID: 201563697)
const REVIEW_URL = 'https://www.emag.ro/product-feedback/ceas-smartwatch-barbati-techoner-wand-pro-2-inch-super-amoled-inteligent-fitness-sport-apel-bluetooth-hd-multi-sport-ritm-cardiac-multi-point-spo2-tensiune-oxigen-limba-romana-carcasa-metalica-2-curele-ip68-negru-p95-negru/pd/DRD4WVYBM/review/201563697'

const PRODUCT_URL = 'https://www.emag.ro/ceas-smartwatch-barbati-techoner-wand-pro-2-inch-super-amoled-inteligent-fitness-sport-apel-bluetooth-hd-multi-sport-ritm-cardiac-multi-point-spo2-tensiune-oxigen-limba-romana-carcasa-metalica-2-curele-ip68-negru-p95-negru/pd/DRD4WVYBM/'

async function inspectReplyButton() {
  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: true, args: ['--no-sandbox'] }
  )
  const page = await context.newPage()

  // Interceptează request-uri de reply
  page.on('request', req => {
    if (req.url().includes('feedback') || req.url().includes('comment') || req.url().includes('reply')) {
      console.log('📤 REQUEST:', req.method(), req.url().substring(0, 150))
      if (req.postData()) console.log('   POST data:', req.postData().substring(0, 300))
    }
  })

  console.log('📍 Încarc pagina recenziei...')
  await page.goto(REVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 3000))

  console.log('🔑 Logged:', await page.evaluate(() => window.EM?.is_logged_in))

  // Salvează HTML-ul paginii recenziei
  const html = await page.content()
  fs.writeFileSync('review-page.html', html)
  console.log('💾 HTML salvat (' + Math.round(html.length/1024) + 'KB)')

  // Caută butoane de răspuns
  const buttons = await page.$$eval('button, a', els =>
    els.filter(el => {
      const txt = (el.innerText || el.textContent || '').toLowerCase()
      const cls = (el.className || '').toLowerCase()
      return txt.includes('răspund') || txt.includes('raspund') || txt.includes('comentar') ||
             txt.includes('reply') || cls.includes('comment') || cls.includes('reply') ||
             cls.includes('add-comment') || cls.includes('js-add')
    }).map(el => ({
      tag: el.tagName,
      txt: (el.innerText || el.textContent || '').trim().substring(0, 50),
      cls: (el.className || '').substring(0, 100),
      id: el.id
    }))
  )

  console.log('\n📋 Butoane de răspuns găsite:')
  buttons.forEach(b => console.log(`  <${b.tag} class="${b.cls}" id="${b.id}"> "${b.txt}"`))

  // Caută și în pagina produsului — recenzia cu ID 201563697
  console.log('\n📍 Încarc pagina produsului...')
  await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 3000))

  // Scroll la recenzii
  await page.evaluate(() => {
    const el = document.querySelector('.reviews-section')
    if (el) el.scrollIntoView()
  })
  await new Promise(r => setTimeout(r, 2000))

  // Caută recenzia specifică și butonul ei de răspuns
  const reviewItem = await page.$('[data-id="201563697"], #review-201563697')
  if (reviewItem) {
    console.log('✅ Recenzie găsită în pagina produsului!')
    const reviewHtml = await reviewItem.evaluate(el => el.outerHTML.substring(0, 1000))
    console.log('HTML recenzie:', reviewHtml)
  } else {
    console.log('❌ Recenzia nu a fost găsită cu data-id')

    // Încearcă să găsim structura data-id din toate review items
    const dataIds = await page.$$eval('.product-review-item, .js-review-item', items =>
      items.slice(0, 3).map(el => ({
        dataId: el.getAttribute('data-id'),
        attrs: Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(' '),
        hasCommentBtn: !!el.querySelector('.js-add-comment-link, .em-add-comment, [class*="comment"]')
      }))
    )
    console.log('\n📋 Primele 3 review items:')
    dataIds.forEach(d => console.log('  ', JSON.stringify(d)))
  }

  // Caută butonul de add comment
  const commentBtns = await page.$$eval('.js-add-comment-link, .em-add-comment, [class*="add-comment"]', els =>
    els.slice(0, 5).map(el => ({
      tag: el.tagName,
      cls: (el.className || '').substring(0, 100),
      txt: (el.innerText || '').trim(),
      dataId: el.getAttribute('data-id'),
      href: el.href || ''
    }))
  )
  console.log('\n📋 Butoane add-comment găsite:')
  commentBtns.forEach(b => console.log('  ', JSON.stringify(b)))

  await context.close()
}

inspectReplyButton().catch(console.error)
