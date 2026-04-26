require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')

const REVIEW_URL = 'https://www.emag.ro/product-feedback/ceas-smartwatch-barbati-techoner-wand-pro-2-inch-super-amoled-inteligent-fitness-sport-apel-bluetooth-hd-multi-sport-ritm-cardiac-multi-point-spo2-tensiune-oxigen-limba-romana-carcasa-metalica-2-curele-ip68-negru-p95-negru/pd/DRD4WVYBM/review/201563697'

const TEST_REPLY = 'Buna ziua! Va multumim pentru feedback si ne pare sincer rau pentru experienta neplacuta. Va rugam sa ne contactati la service@kidgps.ro cu numarul de comanda pentru a gasi o solutie rapida. Echipa KidGPS'

// Seteaza SUBMIT_REAL=true pentru a posta efectiv
const SUBMIT_REAL = process.argv[2] === '--submit'

async function testPostReply() {
  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: false, args: ['--no-sandbox'] }
  )
  const page = await context.newPage()

  // Intercepteaza POST catre sapi.emag.ro
  page.on('request', req => {
    if (req.method() === 'POST' && req.url().includes('sapi.emag.ro')) {
      console.log('\n📤 POST catre SAPI:', req.url())
      if (req.postData()) console.log('   Data:', req.postData().substring(0, 300))
    }
  })
  page.on('response', async res => {
    if (res.request().method() === 'POST' && res.url().includes('sapi.emag.ro')) {
      try {
        const json = await res.json()
        console.log('\n📥 SAPI Response:', res.status())
        console.log('   ', JSON.stringify(json).substring(0, 400))
      } catch(e) {}
    }
  })

  console.log('📍 Incarc pagina recenziei...')
  await page.goto(REVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 3000))
  console.log('🔑 Logged:', await page.evaluate(() => window.EM?.is_logged_in))

  // Scroll la buton
  await page.evaluate(() => {
    const btn = document.querySelector('.js-add-comment-link')
    if (btn) btn.scrollIntoView({ block: 'center' })
  })
  await new Promise(r => setTimeout(r, 500))

  // Click buton
  console.log('🖱️ Click "Adauga comentariu"...')
  await page.click('.js-add-comment-link')
  await new Promise(r => setTimeout(r, 1500))

  // Deschide collapse Bootstrap 3 (clasa "in")
  await page.evaluate(() => {
    const btn = document.querySelector('.js-add-comment-link')
    const targetId = btn?.getAttribute('data-ph-target')
    if (targetId) {
      const el = document.querySelector(targetId)
      if (el) { el.classList.add('in'); el.style.display = 'block' }
    }
    // Fallback
    document.querySelectorAll('.collapse').forEach(el => {
      if (el.querySelector('textarea[name="content"]')) {
        el.classList.add('in'); el.style.display = 'block'
      }
    })
  })
  await new Promise(r => setTimeout(r, 500))

  // Completeaza textarea
  const textarea = await page.$('textarea[name="content"]')
  if (!textarea) { console.log('❌ Textarea negasita!'); await context.close(); return }

  await textarea.fill(TEST_REPLY)
  await new Promise(r => setTimeout(r, 500))
  await page.screenshot({ path: 'ss-filled.png' })
  console.log('📸 Salvat ss-filled.png')

  const submitBtn = await page.$('.js-submit-comment')
  if (!submitBtn) { console.log('❌ Submit negasit!'); await context.close(); return }

  if (SUBMIT_REAL) {
    console.log('\n🚀 POSTEZ RASPUNSUL...')
    await submitBtn.click()
    await new Promise(r => setTimeout(r, 4000))
    await page.screenshot({ path: 'ss-after-submit.png' })
    console.log('✅ Raspuns postat! Verifica ss-after-submit.png')
  } else {
    console.log('\n✅ TOTUL PREGATIT! Textarea completata.')
    console.log('⚠️  Ruleaza cu --submit pentru a posta efectiv:')
    console.log('   node crawler/test-post-reply.js --submit')
  }

  await new Promise(r => setTimeout(r, 3000))
  await context.close()
}

testPostReply().catch(console.error)
