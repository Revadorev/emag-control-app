require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')
const path = require('path')
const fs = require('fs')

const SESSION_DIR = path.join(__dirname, '..', 'browser-session')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function debug() {
  const browser = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: true,
    args: ['--no-sandbox'],
    userAgent: UA,
    viewport: { width: 1280, height: 800 },
  })
  const page = await browser.newPage()

  // ── TEST QUESTION ────────────────────────────────────────────────────────────
  const { data: question } = await supabase
    .from('questions').select('*, products(url)').eq('emag_question_id', '11102261').single()

  if (question?.products?.url) {
    const m = question.products.url.match(/emag\.ro\/(.+?)\/pd\/([A-Z0-9]+)/)
    if (m) {
      const url = `https://www.emag.ro/product-feedback/${m[1]}/pd/${m[2]}/question/11102261`
      console.log('📄 Question URL:', url)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await new Promise(r => setTimeout(r, 4000))

      // Salveaza HTML complet
      const html = await page.content()
      fs.writeFileSync('debug-question.html', html)
      console.log('💾 HTML salvat in debug-question.html')

      const info = await page.evaluate(() => {
        return {
          url: location.href,
          title: document.title,
          // Toate textarea-urile
          textareas: [...document.querySelectorAll('textarea')].map(t => ({
            name: t.name, id: t.id,
            class: t.className.substring(0, 80),
            dataId: t.closest('[data-id]')?.getAttribute('data-id'),
            parentId: t.parentElement?.id,
            visible: t.offsetParent !== null,
            display: window.getComputedStyle(t).display
          })),
          // Toate elementele cu data-id
          dataIds: [...document.querySelectorAll('[data-id]')].map(el => ({
            tag: el.tagName, id: el.id,
            dataId: el.getAttribute('data-id'),
            class: el.className.substring(0, 60)
          })).slice(0, 20),
          // Elemente cu "answer" in id sau class
          answerEls: [...document.querySelectorAll('[id*="answer"], [class*="answer"], [id*="question"]')]
            .map(el => ({ tag: el.tagName, id: el.id, class: el.className.substring(0, 60) })).slice(0, 20),
          // Submit buttons
          submits: [...document.querySelectorAll('.js-submit-answer, [class*="submit"], button[type="submit"]')]
            .map(el => ({ tag: el.tagName, class: el.className.substring(0, 60), text: el.innerText.substring(0, 30) }))
        }
      })
      console.log('\nQUESTION INFO:')
      console.log(JSON.stringify(info, null, 2))
    }
  }

  // ── TEST REVIEW ──────────────────────────────────────────────────────────────
  const { data: review } = await supabase
    .from('reviews').select('*, products(url)').eq('emag_review_id', '200517600').single()

  if (review?.products?.url) {
    const m = review.products.url.match(/emag\.ro\/(.+?)\/pd\/([A-Z0-9]+)/)
    if (m) {
      const url = `https://www.emag.ro/product-feedback/${m[1]}/pd/${m[2]}/review/200517600`
      console.log('\n📄 Review URL:', url)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await new Promise(r => setTimeout(r, 4000))

      const html = await page.content()
      fs.writeFileSync('debug-review.html', html)
      console.log('💾 HTML salvat in debug-review.html')

      const info = await page.evaluate(() => {
        return {
          url: location.href,
          // Buton comentariu
          commentBtn: !!document.querySelector('.js-add-comment-link'),
          // Toate link-urile/butoanele cu "comment" in clasa
          commentEls: [...document.querySelectorAll('[class*="comment"]')]
            .map(el => ({ tag: el.tagName, class: el.className.substring(0, 80), text: el.innerText?.substring(0, 40) })).slice(0, 10),
          // Textarea
          textareas: [...document.querySelectorAll('textarea')].map(t => ({
            name: t.name, id: t.id, class: t.className.substring(0, 60)
          }))
        }
      })
      console.log('\nREVIEW INFO:')
      console.log(JSON.stringify(info, null, 2))
    }
  }

  await browser.close()
  console.log('\n✅ Debug gata! Verifica debug-question.html si debug-review.html')
}

debug().catch(console.error)
