require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')

async function createContext(headless = true) {
  return chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    {
      headless,
      args: ['--no-sandbox'],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    }
  )
}

/**
 * Extrage token-ul din sesiunea browser-ului
 */
async function getToken(page, productUrl) {
  // Încărcăm pagina produsului și interceptăm token-ul din primul request product-feedback
  return new Promise(async (resolve) => {
    let resolved = false

    page.on('request', req => {
      if (!resolved && req.url().includes('product-feedback') && req.url().includes('token=')) {
        const url = new URL(req.url())
        const token = url.searchParams.get('token')
        if (token) {
          resolved = true
          resolve(token)
        }
      }
    })

    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    // waitForTimeout poate crasha dacă pagina se închide — folosim setTimeout
    await new Promise(r => setTimeout(r, 5000))

    if (!resolved) {
      // Fallback: extrage din EM.user_token
      const token = await page.evaluate(() => window.EM && window.EM.user_token ? window.EM.user_token : null)
      resolve(token)
    }
  })
}

/**
 * Scrapeaza recenziile 1-3 stele via API
 */
async function scrapeReviews(page, productUrl) {
  const reviews = []

  try {
    // Extrage SEF name din URL
    // ex: https://www.emag.ro/[sef-name]/pd/[PNK]/
    const urlMatch = productUrl.match(/emag\.ro\/(.+?)\/pd\/([A-Z0-9]+)/)
    if (!urlMatch) throw new Error('URL produs invalid: ' + productUrl)
    const sefName = urlMatch[1]
    const pnk = urlMatch[2]

    console.log(`  📦 SEF: ${sefName.substring(0, 50)}...`)
    console.log(`  📦 PNK: ${pnk}`)

    // Obține token
    console.log('  🔑 Obțin token...')
    const token = await getToken(page, productUrl)
    if (!token) throw new Error('Token negăsit')
    console.log('  ✅ Token obținut')

    const baseUrl = `https://www.emag.ro/product-feedback/${sefName}/pd/${pnk}/reviews/list`

    // Fetch recenzii pentru fiecare rating 1, 2, 3
    for (const rating of [1, 2, 3]) {
      let offset = 0
      const limit = 50
      let hasMore = true

      while (hasMore) {
        const result = await page.evaluate(async ({ url, token, rating, offset, limit }) => {
          try {
            const params = new URLSearchParams({
              token,
              source_id: '7',
              'filters[rating]': rating,
              'page[limit]': limit,
              'page[offset]': offset,
              'sort[created]': 'desc'
            })
            const res = await fetch(`${url}?${params}`, {
              headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
              }
            })
            return { ok: res.ok, status: res.status, data: await res.json() }
          } catch(e) {
            return { ok: false, error: e.message }
          }
        }, { url: baseUrl, token, rating, offset, limit })

        if (!result.ok) {
          console.error(`    ❌ Rating ${rating}, offset ${offset}: ${result.error || result.status}`)
          break
        }

        const items = result.data.reviews?.items || []
        const count = result.data.reviews?.count || 0

        console.log(`    ⭐${rating} stele - offset ${offset}: ${items.length} recenzii (total: ${count})`)

        for (const item of items) {
          reviews.push({
            rating: item.rating || rating,
            author: item.user?.name || item.user?.nickname || 'Anonim',
            content: item.content || item.title || '',
            reviewDate: item.created || item.published || '',
            reviewId: String(item.id || ''),
            title: item.title || ''
          })
        }

        if (offset + items.length < count && items.length === limit) {
          offset += limit
        } else {
          hasMore = false
        }
      }
    }

  } catch (e) {
    console.error(`  ❌ Eroare scraping recenzii: ${e.message}`)
  }

  // Deduplicate
  const seen = new Set()
  return reviews.filter(r => {
    if (seen.has(r.reviewId)) return false
    seen.add(r.reviewId)
    return r.content && r.content.length > 3
  })
}

/**
 * Scrapeaza întrebările fără răspuns
 */
async function scrapeQuestions(page, productUrl) {
  const questions = []

  try {
    // Extrage SEF name și PNK
    const urlMatch = productUrl.match(/emag\.ro\/(.+?)\/pd\/([A-Z0-9]+)/)
    if (!urlMatch) throw new Error('URL produs invalid')
    const sefName = urlMatch[1]
    const pnk = urlMatch[2]

    // Obține token (pagina deja încărcată dacă am rulat scrapeReviews)
    const token = await page.evaluate(() => {
      // Extrage din cookies sau window
      const cookies = document.cookie.split(';')
      return window.EM?.user_token || null
    })

    // Folosim endpoint-ul de questions
    const baseUrl = `https://www.emag.ro/product-feedback/${sefName}/pd/${pnk}/questions/list`

    let offset = 0
    const limit = 50
    let hasMore = true

    while (hasMore) {
      const result = await page.evaluate(async ({ url, token, offset, limit }) => {
        try {
          const params = new URLSearchParams({
            source_id: '7',
            'page[limit]': limit,
            'page[offset]': offset,
            'sort[created]': 'desc',
            'filters[has_answer]': '0'
          })
          if (token) params.set('token', token)

          const res = await fetch(`${url}?${params}`, {
            headers: {
              'Accept': 'application/json',
              'X-Requested-With': 'XMLHttpRequest'
            }
          })
          return { ok: res.ok, status: res.status, data: await res.json() }
        } catch(e) {
          return { ok: false, error: e.message }
        }
      }, { url: baseUrl, token, offset, limit })

      if (!result.ok) {
        console.log(`    ⚠️ Questions API: ${result.status || result.error} - încercăm fără filtru...`)
        // Încearcă fără filtrul has_answer
        const result2 = await page.evaluate(async ({ url, token, offset, limit }) => {
          try {
            const params = new URLSearchParams({
              source_id: '7',
              'page[limit]': limit,
              'page[offset]': offset
            })
            if (token) params.set('token', token)
            const res = await fetch(`${url}?${params}`, {
              headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
            })
            return { ok: res.ok, status: res.status, data: await res.json() }
          } catch(e) {
            return { ok: false, error: e.message }
          }
        }, { url: baseUrl, token, offset, limit })

        if (!result2.ok) {
          console.error(`    ❌ Questions API eșuat: ${result2.error || result2.status}`)
          break
        }

        const items = result2.data.questions?.items || result2.data.items || []
        const count = result2.data.questions?.count || 0
        console.log(`    ❓ offset ${offset}: ${items.length} întrebări (total: ${count})`)

        for (const item of items) {
          if (!item.answers || item.answers.length === 0) {
            questions.push({
              question: item.content || item.question || '',
              author: item.user?.name || item.user?.nickname || 'Anonim',
              askedDate: item.created || '',
              questionId: String(item.id || ''),
              hasAnswer: false
            })
          }
        }

        if (offset + items.length < count && items.length === limit) {
          offset += limit
        } else {
          break
        }
        continue
      }

      const items = result.data.questions?.items || result.data.items || []
      const count = result.data.questions?.count || 0
      console.log(`    ❓ offset ${offset}: ${items.length} întrebări fără răspuns (total: ${count})`)

      for (const item of items) {
        questions.push({
          question: item.content || item.question || '',
          author: item.user?.name || item.user?.nickname || 'Anonim',
          askedDate: item.created || '',
          questionId: String(item.id || ''),
          hasAnswer: false
        })
      }

      if (offset + items.length < count && items.length === limit) {
        offset += limit
      } else {
        hasMore = false
      }
    }

  } catch (e) {
    console.error(`  ❌ Eroare scraping întrebări: ${e.message}`)
  }

  return questions
}

/**
 * Postează răspuns la o recenzie
 */
async function postReviewReply(context, productUrl, reviewId, replyText) {
  const page = await context.newPage()
  try {
    const urlMatch = productUrl.match(/emag\.ro\/(.+?)\/pd\/([A-Z0-9]+)/)
    const sefName = urlMatch[1]
    const pnk = urlMatch[2]
    const reviewUrl = `https://www.emag.ro/product-feedback/${sefName}/pd/${pnk}/review/${reviewId}`

    await page.goto(reviewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    const addCommentBtn = await page.$('.js-add-comment-link, .em-add-comment')
    if (!addCommentBtn) throw new Error('Buton răspuns negăsit')
    await addCommentBtn.click()
    await page.waitForTimeout(1500)

    const textarea = await page.waitForSelector('.add-feedback-form textarea', { timeout: 5000 })
    await textarea.fill(replyText)
    await page.waitForTimeout(500)

    const submitBtn = await page.$('.js-submit-comment button[type="submit"], .js-submit-feedback')
    if (!submitBtn) throw new Error('Submit negăsit')
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

/**
 * Postează răspuns la o întrebare
 */
async function postQuestionReply(context, productUrl, questionId, replyText) {
  const page = await context.newPage()
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(3000)

    await page.evaluate(() => {
      const el = document.querySelector('#user-questions-section')
      if (el) el.scrollIntoView()
    })
    await page.waitForTimeout(2000)

    const answerBtn = questionId
      ? await page.$(`[data-id="${questionId}"] button, #question-${questionId} button`)
      : null
    if (!answerBtn) throw new Error('Buton răspuns întrebare negăsit')
    await answerBtn.click()
    await page.waitForTimeout(1500)

    const textarea = await page.waitForSelector('#add-question-form textarea, .collapse.show textarea', { timeout: 5000 })
    await textarea.fill(replyText)
    await page.waitForTimeout(500)

    const submitBtn = await page.$('#add-question-form button[type="submit"], .collapse.show .btn-primary')
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

module.exports = { createContext, scrapeReviews, scrapeQuestions, postReviewReply, postQuestionReply }
