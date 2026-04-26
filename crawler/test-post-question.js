require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')

const PRODUCT_URL = 'https://www.emag.ro/ceas-smartwatch-barbati-techoner-wand-pro-2-inch-super-amoled-inteligent-fitness-sport-apel-bluetooth-hd-multi-sport-ritm-cardiac-multi-point-spo2-tensiune-oxigen-limba-romana-carcasa-metalica-2-curele-ip68-negru-p95-negru/pd/DRD4WVYBM/'

const TEST_QUESTION_ID = '202425274'
const TEST_REPLY = 'Buna ziua! Puteti adauga functii din aplicatia HiWear disponibila in App Store si Google Play. Daca aveti nevoie de ajutor suplimentar, ne puteti contacta la service@kidgps.ro. Echipa KidGPS'

const SUBMIT_REAL = process.argv[2] === '--submit'

async function postQuestionReply() {
  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: false, args: ['--no-sandbox'] }
  )
  const page = await context.newPage()

  // Intercepteaza POST catre sapi
  page.on('request', req => {
    if (req.method() === 'POST' && req.url().includes('sapi.emag.ro')) {
      console.log('\n📤 POST SAPI:', req.url())
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

  console.log('📍 Incarc pagina produsului...')
  await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 3000))
  console.log('🔑 Logged:', await page.evaluate(() => window.EM?.is_logged_in))

  // Scroll la intrebarea specifica
  console.log(`📜 Scroll la intrebarea ${TEST_QUESTION_ID}...`)
  await page.evaluate((qId) => {
    const el = document.querySelector(`[data-id="${qId}"]`)
    if (el) el.scrollIntoView({ block: 'center' })
  }, TEST_QUESTION_ID)
  await new Promise(r => setTimeout(r, 2000))
  await page.screenshot({ path: 'q-ss1-before.png' })

  // Deschide collapse-ul raspunsului via JavaScript direct
  // (collapse target: #question-{id}-new-answer)
  console.log('⚡ Deschid form-ul de raspuns...')
  await page.evaluate((qId) => {
    const targetId = `#question-${qId}-new-answer`
    const el = document.querySelector(targetId)
    if (el) {
      el.classList.add('in')
      el.classList.add('show')
      el.style.display = 'block'
      console.log('Collapse deschis:', targetId)
    } else {
      console.log('Collapse negasit:', targetId)
    }
  }, TEST_QUESTION_ID)
  await new Promise(r => setTimeout(r, 1000))
  await page.screenshot({ path: 'q-ss2-opened.png' })

  // Verifica textarea din form
  const formInfo = await page.evaluate((qId) => {
    const form = document.querySelector(`#question-${qId}-new-answer form, [data-id="${qId}"] form`)
    const textarea = document.querySelector(`#question-${qId}-new-answer textarea, [data-id="${qId}"] textarea`)
    return {
      formFound: !!form,
      formAction: form?.action || '',
      textareaFound: !!textarea,
      textareaVisible: textarea ? textarea.offsetParent !== null : false,
      textareaName: textarea?.name || ''
    }
  }, TEST_QUESTION_ID)
  console.log('\n📋 Form info:', JSON.stringify(formInfo, null, 2))

  if (!formInfo.textareaFound) {
    console.log('❌ Textarea negasita!')
    await context.close()
    return
  }

  // Completeaza textarea
  const textarea = await page.$(`#question-${TEST_QUESTION_ID}-new-answer textarea, [data-id="${TEST_QUESTION_ID}"] textarea`)
  await textarea.fill(TEST_REPLY)
  await new Promise(r => setTimeout(r, 500))
  await page.screenshot({ path: 'q-ss3-filled.png' })
  console.log('📸 q-ss3-filled.png — verifica daca textul e completat')

  // Submit
  const submitBtn = await page.$(`[data-id="${TEST_QUESTION_ID}"] .js-submit-answer`)
  console.log('Submit button gasit:', !!submitBtn)

  if (SUBMIT_REAL && submitBtn) {
    console.log('\n🚀 POSTEZ RASPUNSUL LA INTREBARE...')
    await submitBtn.click()
    await new Promise(r => setTimeout(r, 4000))
    await page.screenshot({ path: 'q-ss4-after-submit.png' })
    console.log('✅ Postat! Verifica q-ss4-after-submit.png')
  } else {
    console.log('\n✅ TOTUL PREGATIT!')
    console.log('⚠️  Ruleaza cu --submit pentru a posta:')
    console.log('   node crawler/test-post-question.js --submit')
  }

  await new Promise(r => setTimeout(r, 3000))
  await context.close()
}

postQuestionReply().catch(console.error)
