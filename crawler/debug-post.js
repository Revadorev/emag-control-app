require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')
const path = require('path')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function debugPost() {
  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: false, args: ['--no-sandbox'] } // headless: false ca sa vedem
  )
  const page = await context.newPage()

  // Test review
  const { data: review } = await supabase
    .from('reviews')
    .select('*, products(url, name)')
    .eq('emag_review_id', '200517600')
    .single()

  if (review) {
    const productUrl = review.products?.url || ''
    const urlMatch = productUrl.match(/emag\.ro\/(.+?)\/pd\/([A-Z0-9]+)/)
    if (urlMatch) {
      const [, sefName, pnk] = urlMatch
      const reviewUrl = `https://www.emag.ro/product-feedback/${sefName}/pd/${pnk}/review/${review.emag_review_id}`
      console.log('🔍 Navighez la:', reviewUrl)

      await page.goto(reviewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await new Promise(r => setTimeout(r, 3000))

      // Verifica ce elemente exista
      const info = await page.evaluate(() => {
        return {
          hasCommentBtn: !!document.querySelector('.js-add-comment-link'),
          hasCommentBtnAlt: !!document.querySelector('[class*="comment"]'),
          hasTextarea: !!document.querySelector('textarea'),
          pageTitle: document.title,
          url: location.href,
          // Ia primele 500 chars din body ca sa vedem structura
          bodyPreview: document.body.innerText.substring(0, 300)
        }
      })
      console.log('📋 Info pagina review:', JSON.stringify(info, null, 2))
      await page.screenshot({ path: 'debug-review.png' })
      console.log('📸 Screenshot: debug-review.png')
    }
  }

  // Test question
  const { data: question } = await supabase
    .from('questions')
    .select('*, products(url, name)')
    .eq('emag_question_id', '11102261')
    .single()

  if (question) {
    const productUrl = question.products?.url || ''
    const urlMatch = productUrl.match(/emag\.ro\/(.+?)\/pd\/([A-Z0-9]+)/)
    if (urlMatch) {
      const [, sefName, pnk] = urlMatch
      const questionUrl = `https://www.emag.ro/product-feedback/${sefName}/pd/${pnk}/question/11102261`
      console.log('\n🔍 Navighez la:', questionUrl)

      await page.goto(questionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await new Promise(r => setTimeout(r, 3000))

      const info = await page.evaluate((qId) => {
        return {
          hasNewAnswer: !!document.querySelector(`#question-${qId}-new-answer`),
          hasDataId: !!document.querySelector(`[data-id="${qId}"]`),
          hasTextarea: !!document.querySelector('textarea'),
          hasSubmitAnswer: !!document.querySelector('.js-submit-answer'),
          url: location.href,
          pageTitle: document.title,
          bodyPreview: document.body.innerText.substring(0, 300)
        }
      }, '11102261')
      console.log('📋 Info pagina question:', JSON.stringify(info, null, 2))
      await page.screenshot({ path: 'debug-question.png' })
      console.log('📸 Screenshot: debug-question.png')
    }
  }

  await new Promise(r => setTimeout(r, 5000))
  await context.close()
}

debugPost().catch(console.error)
