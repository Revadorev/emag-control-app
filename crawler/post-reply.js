/**
 * post-reply.js — Postează un răspuns aprobat pe eMAG
 * Apelat din API route /api/reviews/[id]/post sau /api/questions/[id]/post
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const { createContext } = require('./emag-scraper')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function postReviewReply(context, productUrl, emag_review_id, replyText) {
  const page = await context.newPage()
  try {
    const url = productUrl.includes('#') ? productUrl : productUrl + '#reviews'
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(3000)

    // Caută butonul "Răspunde" specific recenziei
    // Structura eMAG: fiecare recenzie are un data-id sau un link anchor
    const replyButtons = await page.$$('[data-id="' + emag_review_id + '"] .reply-btn, .review-reply-trigger')
    
    if (replyButtons.length === 0) {
      console.log('  ⚠️ Buton reply nu găsit, încearcă selector alternativ')
      // Încearcă click pe "Răspunde la recenzie" generic
      const genericBtn = await page.$('button:has-text("Răspunde"), a:has-text("Răspunde la recenzie")')
      if (!genericBtn) throw new Error('Buton răspuns negăsit')
      await genericBtn.click()
    } else {
      await replyButtons[0].click()
    }

    await page.waitForTimeout(1000)

    // Completează textarea
    const textarea = await page.waitForSelector('textarea[name*="reply"], textarea[placeholder*="răspuns"], .reply-form textarea', { timeout: 5000 })
    await textarea.fill(replyText)
    await page.waitForTimeout(500)

    // Submit
    const submitBtn = await page.$('button[type="submit"]:near(textarea), .reply-form button[type="submit"]')
    if (!submitBtn) throw new Error('Buton submit negăsit')
    
    await submitBtn.click()
    await page.waitForTimeout(3000)

    return true
  } catch (e) {
    console.error('Eroare postare recenzie:', e.message)
    return false
  } finally {
    await page.close()
  }
}

async function postQuestionReply(context, productUrl, emag_question_id, replyText) {
  const page = await context.newPage()
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    // Click tab întrebări
    const questionsTab = await page.$('a[href*="#questions"], [data-tab="questions"]')
    if (questionsTab) {
      await questionsTab.click()
      await page.waitForTimeout(1500)
    }

    // Găsim întrebarea și butonul răspuns
    const answerBtn = await page.$('[data-id="' + emag_question_id + '"] .answer-btn, .question-answer-trigger')
    if (answerBtn) {
      await answerBtn.click()
    } else {
      const genericBtn = await page.$('button:has-text("Răspunde la întrebare")')
      if (!genericBtn) throw new Error('Buton răspuns întrebare negăsit')
      await genericBtn.click()
    }

    await page.waitForTimeout(1000)

    const textarea = await page.waitForSelector('textarea', { timeout: 5000 })
    await textarea.fill(replyText)
    await page.waitForTimeout(500)

    const submitBtn = await page.$('button[type="submit"]')
    if (!submitBtn) throw new Error('Submit negăsit')
    await submitBtn.click()
    await page.waitForTimeout(3000)

    return true
  } catch (e) {
    console.error('Eroare postare întrebare:', e.message)
    return false
  } finally {
    await page.close()
  }
}

// Procesează toate răspunsurile aprobate din queue
async function processQueue() {
  console.log('📤 Procesez răspunsuri aprobate...')
  
  const context = await createContext(true)

  // Recenzii aprobate
  const { data: approvedReviews } = await supabase
    .from('reviews')
    .select('*')
    .eq('status', 'approved')
    .limit(10)

  for (const review of approvedReviews || []) {
    console.log(`  📝 Postez răspuns la recenzia #${review.id}...`)
    const success = await postReviewReply(context, review.product_url, review.emag_review_id, review.final_reply)
    
    await supabase.from('reviews').update({
      status: success ? 'posted' : 'approved',
      posted_at: success ? new Date().toISOString() : null,
    }).eq('id', review.id)
  }

  // Întrebări aprobate
  const { data: approvedQuestions } = await supabase
    .from('questions')
    .select('*')
    .eq('status', 'approved')
    .limit(10)

  for (const question of approvedQuestions || []) {
    console.log(`  📝 Postez răspuns la întrebarea #${question.id}...`)
    const success = await postQuestionReply(context, question.product_url, question.emag_question_id, question.final_reply)
    
    await supabase.from('questions').update({
      status: success ? 'posted' : 'approved',
      posted_at: success ? new Date().toISOString() : null,
    }).eq('id', question.id)
  }

  await context.close()
  console.log('✅ Queue procesat!')
}

processQueue().catch(console.error)
