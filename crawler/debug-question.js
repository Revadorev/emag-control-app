require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')

const QUESTION_ID = '11102261'
const SEF = 'ceas-smartwatch-barbati-techoner-wand-pro-2-inch-super-amoled-inteligent-fitness-sport-apel-bluetooth-hd-multi-sport-ritm-cardiac-multi-point-spo2-tensiune-oxigen-limba-romana-carcasa-metalica-2-curele-ip68-negru-p95-negru'
const PNK = 'DRD4WVYBM'
const QUESTION_URL = `https://www.emag.ro/product-feedback/${SEF}/pd/${PNK}/question/${QUESTION_ID}`
const TEST_REPLY = 'Buna ziua! Da, ceasul masoara tensiunea arteriala. Pentru detalii suplimentare ne puteti contacta la service@kidgps.ro. Echipa KidGPS'
const SUBMIT_REAL = process.argv[2] === '--submit'

async function debug() {
  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: false, args: ['--no-sandbox'] }
  )
  const page = await context.newPage()

  console.log('📍 Incarc:', QUESTION_URL)
  await page.goto(QUESTION_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 3000))
  await page.screenshot({ path: 'dq-ss1.png' })

  // Inspectam tot
  const info = await page.evaluate((qId) => {
    const qEl = document.querySelector(`[data-id="${qId}"]`)
    if (!qEl) return { found: false, allDataIds: Array.from(document.querySelectorAll('[data-id]')).map(el => el.getAttribute('data-id')).slice(0, 10) }

    const collapseTarget = `#question-${qId}-new-answer`
    const collapseEl = document.querySelector(collapseTarget)
    const allTextareas = Array.from(document.querySelectorAll('textarea')).map(t => ({
      name: t.name, id: t.id, cls: t.className, visible: t.offsetParent !== null,
      parentCls: t.parentElement?.className || ''
    }))
    const allButtons = Array.from(qEl.querySelectorAll('button, a.btn')).map(b => ({
      cls: b.className.substring(0, 80), txt: b.innerText.trim().substring(0, 40),
      dataPh: b.getAttribute('data-ph-target') || '', dataTarget: b.getAttribute('data-target') || ''
    }))

    return {
      found: true,
      collapseTarget,
      collapseFound: !!collapseEl,
      collapseClasses: collapseEl?.className || '',
      collapseDisplay: collapseEl ? window.getComputedStyle(collapseEl).display : '',
      allTextareas,
      allButtons,
      qElHtml: qEl.outerHTML.substring(0, 600)
    }
  }, QUESTION_ID)

  console.log('\n📋 Debug info:')
  console.log(JSON.stringify(info, null, 2).substring(0, 2000))

  if (!info.found) {
    console.log('❌ Elementul cu data-id negasit!')
    await context.close()
    return
  }

  // Incearca sa deschida collapse
  console.log('\n⚡ Deschid collapse...')
  await page.evaluate((qId) => {
    const collapseTarget = `#question-${qId}-new-answer`
    const el = document.querySelector(collapseTarget)
    if (el) {
      el.classList.add('in', 'show')
      el.style.cssText = 'display:block!important;height:auto!important;overflow:visible!important;'
    }
    // Deschide si textarea direct
    const textarea = document.querySelector(`[data-id="${qId}"] textarea`)
    if (textarea) {
      textarea.style.cssText = 'display:block!important;visibility:visible!important;'
      const parent = textarea.closest('.collapse, [class*="collapse"]')
      if (parent) {
        parent.classList.add('in', 'show')
        parent.style.cssText = 'display:block!important;height:auto!important;'
      }
    }
  }, QUESTION_ID)
  await new Promise(r => setTimeout(r, 1000))
  await page.screenshot({ path: 'dq-ss2-opened.png' })

  // Verifica textarea
  const textarea = await page.$(`[data-id="${QUESTION_ID}"] textarea`)
  const isVisible = textarea ? await textarea.isVisible().catch(() => false) : false
  console.log(`\nTextarea gasita: ${!!textarea}, vizibila: ${isVisible}`)

  if (textarea) {
    // Forteaza click si fill
    await page.evaluate((qId) => {
      const t = document.querySelector(`[data-id="${qId}"] textarea`)
      if (t) { t.style.cssText = 'display:block!important;visibility:visible!important;opacity:1!important;'; t.focus() }
    }, QUESTION_ID)
    await new Promise(r => setTimeout(r, 300))
    await textarea.fill(TEST_REPLY).catch(async () => {
      // Daca fill esueaza, folosim evaluate
      await page.evaluate((args) => {
        const t = document.querySelector(`[data-id="${args.qId}"] textarea`)
        if (t) { t.value = args.reply; t.dispatchEvent(new Event('input', {bubbles:true})) }
      }, { qId: QUESTION_ID, reply: TEST_REPLY })
    })
    await new Promise(r => setTimeout(r, 500))
    await page.screenshot({ path: 'dq-ss3-filled.png' })
    console.log('📸 dq-ss3-filled.png')

    const submitBtn = await page.$(`[data-id="${QUESTION_ID}"] .js-submit-answer`)
    console.log('Submit button:', !!submitBtn)

    if (SUBMIT_REAL && submitBtn) {
      await submitBtn.click()
      await new Promise(r => setTimeout(r, 4000))
      await page.screenshot({ path: 'dq-ss4-submitted.png' })
      console.log('✅ Postat! dq-ss4-submitted.png')
    } else {
      console.log('✅ Gata! Ruleaza cu --submit pentru a posta.')
    }
  }

  await new Promise(r => setTimeout(r, 3000))
  await context.close()
}

debug().catch(console.error)
