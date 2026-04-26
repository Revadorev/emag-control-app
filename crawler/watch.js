require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')
const path = require('path')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const supabaseRealtime = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const DRY_RUN = process.env.DRY_RUN === 'true'
const SESSION_DIR = path.join(__dirname, '..', 'browser-session')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let isProcessing = false
let browser = null
let sharedPage = null

// ─── Browser: conectare la Chrome real sau fallback ───────────────────────────
async function getPage() {
  if (!browser) {
    console.log('🌐 Pornesc browserul...')
    browser = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false,
      args: ['--no-sandbox'],
      userAgent: UA,
      viewport: { width: 1280, height: 800 },
    })
    console.log('✅ Browser pornit')

    // Deschide emag.ro la pornire ca sa mentina sesiunea activa
    const p = await browser.newPage()
    await p.goto('https://www.emag.ro', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
    sharedPage = p
  }

  if (!sharedPage || sharedPage.isClosed()) {
    sharedPage = await browser.newPage()
  }
  return sharedPage
}

// ─── Verifica login ───────────────────────────────────────────────────────────
async function ensureLoggedIn(page) {
  await page.goto('https://www.emag.ro/account/dashboard', { waitUntil: 'domcontentloaded', timeout: 15000 })
  await new Promise(r => setTimeout(r, 2000))
  const url = page.url()
  if (url.includes('login') || url.includes('auth.emag')) {
    console.log('⚠️  Sesiune expirata! Relogheaza-te cu: node crawler\\setup-login.js')
    return false
  }
  console.log('✅ Sesiune activa')
  return true
}

// ─── Post review reply ────────────────────────────────────────────────────────
async function postReviewReply(page, reviewUrl, replyText) {
  await page.goto(reviewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 3000))
  console.log('    🔗 URL:', page.url())

  if (page.url().includes('auth.emag') || page.url().includes('login')) {
    throw new Error('Sesiune expirata - necesita relogin manual')
  }

  await page.evaluate(() => {
    const btn = document.querySelector('.js-add-comment-link')
    if (btn) btn.scrollIntoView({ block: 'center' })
  })
  await new Promise(r => setTimeout(r, 500))

  const commentBtn = await page.$('.js-add-comment-link')
  if (!commentBtn) throw new Error('Buton comentariu negasit')
  await commentBtn.click()
  await new Promise(r => setTimeout(r, 1500))

  await page.evaluate(() => {
    const btn = document.querySelector('.js-add-comment-link')
    const targetId = btn ? btn.getAttribute('data-ph-target') : null
    if (targetId) {
      const el = document.querySelector(targetId)
      if (el) { el.classList.add('in'); el.style.display = 'block' }
    }
    document.querySelectorAll('.collapse').forEach(el => {
      if (el.querySelector('textarea[name="content"]')) {
        el.classList.add('in'); el.style.display = 'block'
      }
    })
  })
  await new Promise(r => setTimeout(r, 500))

  const textarea = await page.$('textarea[name="content"]')
  if (!textarea) throw new Error('Textarea negasita')
  await textarea.fill(replyText)
  await new Promise(r => setTimeout(r, 500))

  const submitBtn = await page.$('.js-submit-comment')
  if (!submitBtn) throw new Error('Submit negasit')

  if (DRY_RUN) { console.log('    🧪 DRY RUN'); return true }
  await submitBtn.click()
  await new Promise(r => setTimeout(r, 4000))
  return true
}

// ─── Post question reply ──────────────────────────────────────────────────────
async function postQuestionReply(page, productUrl, questionId, replyText) {
  const urlMatch = productUrl.match(/emag\.ro\/(.+?)\/pd\/([A-Z0-9]+)/)
  if (!urlMatch) throw new Error('URL invalid')
  const [, sefName, pnk] = urlMatch
  const questionUrl = `https://www.emag.ro/product-feedback/${sefName}/pd/${pnk}/question/${questionId}`

  await page.goto(questionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 3000))
  console.log('    🔗 URL:', page.url())

  if (page.url().includes('auth.emag') || page.url().includes('login')) {
    throw new Error('Sesiune expirata - necesita relogin manual')
  }

  await page.evaluate((qId) => {
    const el = document.querySelector(`#question-${qId}-new-answer`)
    if (el) { el.classList.add('in', 'show'); el.style.cssText = 'display:block!important;height:auto!important;' }
    const textarea = document.querySelector(`[data-id="${qId}"] textarea`)
    if (textarea) {
      const parent = textarea.closest('.collapse, [class*="collapse"]')
      if (parent) { parent.classList.add('in', 'show'); parent.style.cssText = 'display:block!important;height:auto!important;' }
    }
  }, questionId)
  await new Promise(r => setTimeout(r, 500))

  const textarea = await page.$(`[data-id="${questionId}"] textarea`)
  if (!textarea) throw new Error(`Textarea negasita pt intrebarea ${questionId}`)

  await textarea.fill(replyText).catch(async () => {
    await page.evaluate((args) => {
      const t = document.querySelector(`[data-id="${args.qId}"] textarea`)
      if (t) { t.value = args.reply; t.dispatchEvent(new Event('input', { bubbles: true })) }
    }, { qId: questionId, reply: replyText })
  })
  await new Promise(r => setTimeout(r, 500))

  const submitBtn = await page.$(`[data-id="${questionId}"] .js-submit-answer`)
  if (!submitBtn) throw new Error('Submit negasit')

  if (DRY_RUN) { console.log('    🧪 DRY RUN'); return true }
  await submitBtn.click()
  await new Promise(r => setTimeout(r, 4000))
  return true
}

// ─── Procesare items aprobate ─────────────────────────────────────────────────
async function processApproved() {
  if (isProcessing) return
  isProcessing = true
  console.log(`\n[${new Date().toLocaleTimeString('ro-RO')}] 🔍 Procesez iteme aprobate...`)

  try {
    const page = await getPage()
    const loggedIn = await ensureLoggedIn(page)
    if (!loggedIn) { isProcessing = false; return }

    const { data: reviews } = await supabase
      .from('reviews').select('*, products(url, name)').eq('status', 'approved').limit(20)

    if (reviews?.length) {
      console.log(`📝 ${reviews.length} recenzii de postat`)
      for (const review of reviews) {
        const replyText = review.final_reply || review.ai_reply
        if (!replyText) continue
        const productUrl = review.products?.url || ''
        const urlMatch = productUrl.match(/emag\.ro\/(.+?)\/pd\/([A-Z0-9]+)/)
        if (!urlMatch) continue
        const [, sefName, pnk] = urlMatch
        const reviewUrl = `https://www.emag.ro/product-feedback/${sefName}/pd/${pnk}/review/${review.emag_review_id}`
        console.log(`  📤 Review ${review.emag_review_id} (${review.author})...`)
        try {
          await postReviewReply(page, reviewUrl, replyText)
          await supabase.from('reviews').update({ status: 'posted', posted_at: new Date().toISOString() }).eq('id', review.id)
          console.log(`  ✅ Postat!`)
        } catch(e) {
          console.error(`  ❌ ${e.message}`)
          await supabase.from('reviews').update({ status: 'error' }).eq('id', review.id)
        }
        await new Promise(r => setTimeout(r, 2000))
      }
    }

    const { data: questions } = await supabase
      .from('questions').select('*, products(url, name)').eq('status', 'approved').limit(20)

    if (questions?.length) {
      console.log(`❓ ${questions.length} intrebari de postat`)
      for (const q of questions) {
        const replyText = q.final_reply || q.ai_reply
        if (!replyText) continue
        console.log(`  📤 Intrebare ${q.emag_question_id} (${q.author})...`)
        try {
          await postQuestionReply(page, q.products?.url || '', q.emag_question_id, replyText)
          await supabase.from('questions').update({ status: 'posted', posted_at: new Date().toISOString() }).eq('id', q.id)
          console.log(`  ✅ Postata!`)
        } catch(e) {
          console.error(`  ❌ ${e.message}`)
          await supabase.from('questions').update({ status: 'error' }).eq('id', q.id)
        }
        await new Promise(r => setTimeout(r, 2000))
      }
    }

    if (!reviews?.length && !questions?.length) console.log('  ✓ Nimic de postat')

  } catch(e) {
    console.error('❌ Eroare generala:', e.message)
    browser = null; sharedPage = null
  } finally {
    isProcessing = false
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('👀 Watch.js pornit — raspunde INSTANT la aprobari')
  console.log(`🧪 DRY_RUN: ${DRY_RUN}`)
  console.log('Ctrl+C pentru oprire\n')

  await processApproved()

  console.log('📡 Ascult Supabase Realtime...')
  supabaseRealtime
    .channel('approved-items')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reviews', filter: 'status=eq.approved' },
      (payload) => { console.log(`\n🔔 Review aprobat: ${payload.new.emag_review_id}`); processApproved() })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'questions', filter: 'status=eq.approved' },
      (payload) => { console.log(`\n🔔 Intrebare aprobata: ${payload.new.emag_question_id}`); processApproved() })
    .subscribe((status) => { console.log(`📡 Realtime status: ${status}`) })

  setInterval(processApproved, 5 * 60 * 1000)

  // Keep-alive: ping emag.ro la fiecare 10 minute ca sesiunea sa nu expire
  setInterval(async () => {
    try {
      if (sharedPage && !sharedPage.isClosed()) {
        await sharedPage.goto('https://www.emag.ro', { waitUntil: 'domcontentloaded', timeout: 10000 })
        console.log('[keep-alive] OK')
      }
    } catch(e) {}
  }, 10 * 60 * 1000)
  console.log('✅ Gata! Asteapta aprobari din dashboard...\n')
}

main().catch(console.error)
