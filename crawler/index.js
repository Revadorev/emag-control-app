require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')
const OpenAI = require('openai')
const path = require('path')

// Data limită: nu luăm recenzii mai vechi de 01.04.2026
const SINCE_DATE = new Date('2026-04-01T00:00:00Z')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const fromArg = process.argv.find(a => a.startsWith('--from='))
const FROM_INDEX = fromArg ? parseInt(fromArg.split('=')[1]) - 1 : 0

// ─── Setari din Supabase (cached) ────────────────────────────────────────────
let AI_SETTINGS = null
async function getSettings() {
  if (AI_SETTINGS) return AI_SETTINGS
  const { data } = await supabase.from('settings').select('*')
  const s = {}
  data?.forEach(row => { s[row.key] = row.value })
  AI_SETTINGS = s
  console.log(`⚙️  Setari: brand="${s.brand_name || 'KidGPS'}", semnatura="${s.signature || 'Echipa KidGPS'}", model="${s.ai_model || 'gpt-5.3-chat-latest'}"`)
  return s
}

function buildPrompt(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '')
}

// ─── AI cu retry ──────────────────────────────────────────────────────────────
async function generateReply(type, content, product, rating) {
  const s = await getSettings()

  const DEFAULT_REVIEW = `Esti un reprezentant profesionist de customer service pentru {{brand_name}}, vandut pe eMAG.ro.{{product_context}}
Raspunde in limba romana, empatic si profesionist.
Clientul a acordat {{rating}} stele din 5.
Daca recenzia este pozitiva (4-5 stele): multumeste-i sincer pentru feedback, apreciaza experienta lui si incurajeaza-l sa revina. NU cere scuze, NU sugera probleme, NU intreba daca are nemultumiri.
Daca recenzia este negativa (1-3 stele): recunoaste problema, cere scuze si ofera solutie concreta (contact {{support_email}} sau garantie).
Maxim 3-4 propozitii.
Termina cu: {{signature}}`

  const DEFAULT_QUESTION = `Esti un reprezentant profesionist de customer service pentru {{brand_name}}, vandut pe eMAG.ro.{{product_context}}
Raspunde in limba romana, clar si concis, folosind informatiile despre produs.
Daca nu stii raspunsul, recomanda contactarea {{support_email}}.
Maxim 2-3 propozitii.
Termina cu: {{signature}}`

  const template = type === 'review'
    ? (s.review_prompt || DEFAULT_REVIEW)
    : (s.question_prompt || DEFAULT_QUESTION)

  const productContext = product.description
    ? `\nDetalii produs: ${product.description.substring(0, 400)}`
    : ''

  const system = buildPrompt(template, {
    brand_name: s.brand_name || 'KidGPS',
    support_email: s.support_email || 'service@kidgps.ro',
    ai_tone: s.ai_tone || 'profesional si empatic',
    signature: s.signature || 'Echipa KidGPS',
    product_context: productContext,
    author_name: '',
    rating: rating || ''
  })

  const review_rating = rating || ''

  const user = type === 'review'
    ? `Scrie un raspuns la aceasta recenzie de ${review_rating} stele: "${content}"`
    : `Scrie un raspuns la aceasta intrebare: "${content}"`

  const model = s.ai_model || 'gpt-5.3-chat-latest'

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await openai.chat.completions.create({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_completion_tokens: 200
      })
      return res.choices[0].message.content.trim()
    } catch(e) {
      if (attempt < 3 && (e.status === 429 || String(e.message).includes('rate'))) {
        console.log(`\n  ⏳ Rate limit AI, astept 15s...`)
        await new Promise(r => setTimeout(r, 15000))
      } else if (attempt === 3) {
        throw e
      }
    }
  }
}

// ─── Fetch reviews via API ────────────────────────────────────────────────────
async function fetchReviews(page, productUrl) {
  const urlMatch = productUrl.match(/emag\.ro\/(.+?)\/pd\/([A-Z0-9]+)/)
  if (!urlMatch) return []
  const [, sefName, pnk] = urlMatch
  const reviews = []

  for (const rating of [1, 2, 3, 4, 5]) {
    let offset = 0
    let hasMore = true
    while (hasMore) {
      const url = `https://www.emag.ro/product-feedback/${sefName}/pd/${pnk}/reviews/list?source_id=7&filters%5Brating%5D=${rating}&page%5Blimit%5D=50&page%5Boffset%5D=${offset}&sort%5Bcreated%5D=desc`
      try {
        const json = await page.evaluate(async (fetchUrl) => {
          const r = await fetch(fetchUrl, { headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } })
          return r.ok ? r.json() : null
        }, url)
        if (!json) break
        const items = json.reviews?.items || []
        const count = json.reviews?.count || 0
        let hitDateLimit = false
        for (const item of items) {
          const itemDate = item.created ? new Date(item.created) : null
          if (itemDate && itemDate < SINCE_DATE) { hitDateLimit = true; break }
          reviews.push({
            rating: item.rating || rating,
            author: item.user?.name || item.user?.nickname || 'Anonim',
            content: (item.content || item.title || '').replace(/<br\s*\/?>/gi, '\n').replace(/&lt;br\s*\/?&gt;/gi, '\n').trim(),
            reviewDate: item.created || '',
            reviewId: String(item.id || '')
          })
        }
        if (hitDateLimit) hasMore = false
        else if (offset + items.length < count && items.length === 50) offset += 50
        else hasMore = false
      } catch(e) { break }
    }
  }

  const seen = new Set()
  return reviews.filter(r => {
    if (seen.has(r.reviewId)) return false
    seen.add(r.reviewId)
    return r.content && r.content.length > 3
  })
}

// ─── Fetch questions via API ──────────────────────────────────────────────────
async function fetchQuestions(page, productUrl) {
  const urlMatch = productUrl.match(/emag\.ro\/(.+?)\/pd\/([A-Z0-9]+)/)
  if (!urlMatch) return []
  const [, sefName, pnk] = urlMatch
  const questions = []
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const url = `https://www.emag.ro/product-feedback/${sefName}/pd/${pnk}/questions/list?source_id=7&page%5Blimit%5D=50&page%5Boffset%5D=${offset}&sort%5Bcreated%5D=desc`
    try {
      const json = await page.evaluate(async (fetchUrl) => {
        const r = await fetch(fetchUrl, { headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } })
        return r.ok ? r.json() : null
      }, url)
      if (!json) break
      const items = json.questions?.items || []
      const count = json.questions?.count || 0
      let hitDateLimitQ = false
      for (const item of items) {
        const itemDateQ = item.created ? new Date(item.created) : null
        if (itemDateQ && itemDateQ < SINCE_DATE) { hitDateLimitQ = true; break }
        if (!item.answers?.length) {
          questions.push({
            question: (item.content || '').replace(/<br\s*\/?>/gi, '\n').replace(/&lt;br\s*\/?&gt;/gi, '\n').trim(),
            author: item.user?.name || item.user?.nickname || 'Anonim',
            askedDate: item.created || '',
            questionId: String(item.id || '')
          })
        }
      }
      if (hitDateLimitQ) hasMore = false
      else if (offset + items.length < count && items.length === 50) offset += 50
      else hasMore = false
    } catch(e) { break }
  }
  return questions
}

// ─── Crawl un produs ──────────────────────────────────────────────────────────
async function crawlProduct(page, product, index, total) {
  console.log(`\n[${index}/${total}] 📦 ${product.name.substring(0, 60)}`)

  let newReviews = 0, newQuestions = 0

  const reviews = await fetchReviews(page, product.url)
  if (reviews.length > 0) console.log(`  ⭐ ${reviews.length} recenzii 1-5 stele`)

  for (const review of reviews) {
    const { data: existing } = await supabase.from('reviews').select('id').eq('emag_review_id', review.reviewId).single()
    if (existing) continue

    let aiReply = null
    try { aiReply = await generateReply('review', review.content, product, review.rating) } catch(e) {
      console.error(`\n  ❌ AI review error: ${e.message}`)
    }

    const { error } = await supabase.from('reviews').insert({
      product_id: product.id, emag_review_id: review.reviewId,
      author: review.author, rating: review.rating, content: review.content,
      review_date: review.reviewDate || null, ai_reply: aiReply, status: 'pending'
    })
    if (!error) { newReviews++; process.stdout.write('.') }
  }

  const questions = await fetchQuestions(page, product.url)
  if (questions.length > 0) console.log(`\n  ❓ ${questions.length} intrebari fara raspuns`)

  for (const q of questions) {
    const { data: existing } = await supabase.from('questions').select('id').eq('emag_question_id', q.questionId).single()
    if (existing) continue

    let aiReply = null
    try { aiReply = await generateReply('question', q.question, product) } catch(e) {
      console.error(`\n  ❌ AI question error: ${e.message}`)
    }

    const { error } = await supabase.from('questions').insert({
      product_id: product.id, emag_question_id: q.questionId,
      author: q.author, question: q.question,
      asked_date: q.askedDate || null, ai_reply: aiReply, status: 'pending'
    })
    if (!error) { newQuestions++; process.stdout.write('?') }
  }

  if (newReviews > 0 || newQuestions > 0) {
    console.log(`\n  ✅ Salvat: ${newReviews} recenzii noi, ${newQuestions} intrebari noi`)
  } else if (reviews.length === 0 && questions.length === 0) {
    process.stdout.write(` ✓`)
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Crawler eMAG - UN singur browser pentru toate produsele\n')
  if (FROM_INDEX > 0) console.log(`⏩ Pornesc de la produsul #${FROM_INDEX + 1}\n`)

  // Incarca setarile o singura data la inceput
  await getSettings()

  const { data: products, error } = await supabase.from('products').select('*').eq('active', true).order('id')
  if (error) { console.error('❌', error.message); process.exit(1) }
  console.log(`📋 ${products.length} produse active\n`)

  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: true, args: ['--no-sandbox'] }
  )
  const page = await context.newPage()

  console.log('🌐 Initializez sesiunea eMAG...')
  await page.goto('https://www.emag.ro', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 2000))
  console.log('✅ Sesiune activa\n')

  const startTime = Date.now()

  for (let i = FROM_INDEX; i < products.length; i++) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await crawlProduct(page, products[i], i + 1, products.length)
        break
      } catch(e) {
        if (attempt < 3) {
          console.log(`  ⚠️  Reîncerc (${attempt}/3): ${e.message}`)
          await new Promise(r => setTimeout(r, 3000))
          try { await page.goto('https://www.emag.ro', { waitUntil: 'domcontentloaded', timeout: 15000 }) } catch(_) {}
        } else {
          console.error(`  ❌ Sarit dupa 3 incercari: ${e.message}`)
        }
      }
    }

    if ((i + 1) % 10 === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000 / 60)
      const done = i + 1 - FROM_INDEX
      const eta = done > 0 ? Math.round((elapsed / done) * (products.length - i - 1)) : '?'
      console.log(`\n⏱️  ${i + 1}/${products.length} | ${elapsed} min trecut | ~${eta} min ramas\n`)
    }
  }

  await context.close()
  const elapsed = Math.round((Date.now() - startTime) / 1000 / 60)
  console.log(`\n\n🏁 Gata! Durata totala: ${elapsed} minute`)
}

main().catch(console.error)
