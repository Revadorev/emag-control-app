require('dotenv').config({ path: '/home/ubuntu/emag-reviews-project/.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fetch = require('node-fetch')
const OpenAI = require('openai')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ─── AI Reply ─────────────────────────────────────────────────────────────────
async function generateReply(type, content, product) {
  const productName = product.name || 'produsul nostru'
  const description = product.description ? `\nDescriere: ${product.description.substring(0, 500)}` : ''
  const specs = product.specs ? `\nSpecificatii: ${product.specs.substring(0, 300)}` : ''

  const system = `Esti un reprezentant profesionist de customer service pentru ${productName}, vandut pe eMAG.ro.${description}${specs}
Raspunde in limba romana, empatic si profesionist.
Daca e recenzie negativa: recunoaste problema, cere scuze, ofera solutie (contact service@kidgps.ro sau garantie).
Daca e intrebare: raspunde clar si concis folosind informatiile despre produs.
Maxim 3-4 propozitii. Fara limbaj formal excesiv.`

  const user = type === 'review'
    ? `Scrie un raspuns la aceasta recenzie negativa: "${content}"`
    : `Scrie un raspuns la aceasta intrebare: "${content}"`

  const res = await openai.chat.completions.create({
    model: 'gpt-4.1',
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_tokens: 200, temperature: 0.7
  })
  return res.choices[0].message.content.trim()
}

// ─── Reviews via HTTP (no browser needed) ─────────────────────────────────────
async function fetchReviewsHttp(product) {
  const urlMatch = product.url.match(/emag\.ro\/(.+?)\/pd\/([A-Z0-9]+)/)
  if (!urlMatch) return []
  const sefName = urlMatch[1]
  const pnk = urlMatch[2]

  const reviews = []
  for (const rating of [1, 2, 3]) {
    let offset = 0
    const limit = 50
    let hasMore = true

    while (hasMore) {
      const url = `https://www.emag.ro/product-feedback/${sefName}/pd/${pnk}/reviews/list?source_id=7&filters%5Brating%5D=${rating}&page%5Blimit%5D=${limit}&page%5Boffset%5D=${offset}&sort%5Bcreated%5D=desc`

      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })

      if (!res.ok) {
        console.log(`    ⚠️  Rating ${rating}: HTTP ${res.status}`)
        break
      }

      const json = await res.json()
      const items = json.reviews?.items || []
      const count = json.reviews?.count || 0

      console.log(`    ⭐${rating} stele - offset ${offset}: ${items.length} recenzii (total: ${count})`)

      for (const item of items) {
        reviews.push({
          rating: item.rating || rating,
          author: item.user?.name || item.user?.nickname || 'Anonim',
          content: item.content || item.title || '',
          reviewDate: item.created || '',
          reviewId: String(item.id || '')
        })
      }

      if (offset + items.length < count && items.length === limit) {
        offset += limit
        await new Promise(r => setTimeout(r, 500))
      } else {
        hasMore = false
      }
    }
  }

  // Deduplicate
  const seen = new Set()
  return reviews.filter(r => {
    if (seen.has(r.reviewId)) return false
    seen.add(r.reviewId)
    return r.content && r.content.length > 3
  })
}

// ─── Questions via HTTP ────────────────────────────────────────────────────────
async function fetchQuestionsHttp(product) {
  const urlMatch = product.url.match(/emag\.ro\/(.+?)\/pd\/([A-Z0-9]+)/)
  if (!urlMatch) return []
  const sefName = urlMatch[1]
  const pnk = urlMatch[2]

  const questions = []
  let offset = 0
  const limit = 50
  let hasMore = true

  while (hasMore) {
    const url = `https://www.emag.ro/product-feedback/${sefName}/pd/${pnk}/questions/list?source_id=7&page%5Blimit%5D=${limit}&page%5Boffset%5D=${offset}&sort%5Bcreated%5D=desc`

    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    if (!res.ok) {
      console.log(`    ⚠️  Questions: HTTP ${res.status}`)
      break
    }

    const json = await res.json()
    const items = json.questions?.items || []
    const count = json.questions?.count || 0

    console.log(`    ❓ offset ${offset}: ${items.length} întrebări (total: ${count})`)

    for (const item of items) {
      // Doar fara raspuns
      const hasAnswer = item.answers && item.answers.length > 0
      if (!hasAnswer) {
        questions.push({
          question: item.content || '',
          author: item.user?.name || item.user?.nickname || 'Anonim',
          askedDate: item.created || '',
          questionId: String(item.id || '')
        })
      }
    }

    if (offset + items.length < count && items.length === limit) {
      offset += limit
      await new Promise(r => setTimeout(r, 500))
    } else {
      hasMore = false
    }
  }

  return questions
}

// ─── Main crawl ───────────────────────────────────────────────────────────────
async function crawlProduct(product) {
  console.log(`\n📦 ${product.name}`)

  // RECENZII
  console.log('  ⭐ Recenzii 1-3 stele...')
  const reviews = await fetchReviewsHttp(product)
  console.log(`  ✅ ${reviews.length} recenzii găsite`)

  for (const review of reviews) {
    const { data: existing } = await supabase.from('reviews').select('id').eq('emag_review_id', review.reviewId).single()
    if (existing) continue

    let aiReply = null
    try {
      aiReply = await generateReply('review', review.content, product)
      console.log(`    🤖 AI reply generat pentru review ${review.reviewId}`)
    } catch(e) { console.error('    ❌ AI error:', e.message) }

    const { error } = await supabase.from('reviews').insert({
      product_id: product.id,
      emag_review_id: review.reviewId,
      author: review.author,
      rating: review.rating,
      content: review.content,
      review_date: review.reviewDate || null,
      ai_reply: aiReply,
      status: 'pending'
    })
    if (error) console.error('    ❌ Supabase:', error.message)
    else console.log(`    ✅ Review ${review.reviewId} salvat (${review.rating}⭐)`)
  }

  // ÎNTREBĂRI
  console.log('  ❓ Întrebări fără răspuns...')
  const questions = await fetchQuestionsHttp(product)
  console.log(`  ✅ ${questions.length} întrebări găsite`)

  for (const q of questions) {
    const { data: existing } = await supabase.from('questions').select('id').eq('emag_question_id', q.questionId).single()
    if (existing) continue

    let aiReply = null
    try {
      aiReply = await generateReply('question', q.question, product)
      console.log(`    🤖 AI reply generat pentru întrebare ${q.questionId}`)
    } catch(e) { console.error('    ❌ AI error:', e.message) }

    const { error } = await supabase.from('questions').insert({
      product_id: product.id,
      emag_question_id: q.questionId,
      author: q.author,
      question: q.question,
      asked_date: q.askedDate || null,
      ai_reply: aiReply,
      status: 'pending'
    })
    if (error) console.error('    ❌ Supabase:', error.message)
    else console.log(`    ✅ Întrebare ${q.questionId} salvată`)
  }
}

async function main() {
  console.log('🚀 Server Crawler (no browser) pornit\n')

  const { data: products, error } = await supabase.from('products').select('*').eq('active', true)
  if (error) { console.error('❌', error.message); process.exit(1) }

  console.log(`📋 ${products.length} produse active`)
  for (const product of products) {
    await crawlProduct(product)
    await new Promise(r => setTimeout(r, 2000))
  }

  console.log('\n🏁 Crawler finalizat!')
}

main().catch(console.error)
