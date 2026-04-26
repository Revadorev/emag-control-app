require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const OpenAI = require('openai')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ─── Setari din Supabase ──────────────────────────────────────────────────────
async function getSettings() {
  const { data } = await supabase.from('settings').select('*')
  const s = {}
  data?.forEach(row => { s[row.key] = row.value })
  return s
}

function buildPrompt(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '')
}

async function generateReply(type, content, product, settings) {
  const DEFAULT_REVIEW = `Esti un reprezentant profesionist de customer service pentru {{brand_name}}, vandut pe eMAG.ro.{{product_context}}
Raspunde in limba romana, empatic si profesionist.
Recunoaste problema, cere scuze si ofera solutie concreta (contact {{support_email}} sau garantie).
Maxim 3-4 propozitii.
Termina cu: {{signature}}`

  const DEFAULT_QUESTION = `Esti un reprezentant profesionist de customer service pentru {{brand_name}}, vandut pe eMAG.ro.{{product_context}}
Raspunde in limba romana, clar si concis, folosind informatiile despre produs.
Daca nu stii raspunsul, recomanda contactarea {{support_email}}.
Maxim 2-3 propozitii.
Termina cu: {{signature}}`

  const template = type === 'review'
    ? (settings.review_prompt || DEFAULT_REVIEW)
    : (settings.question_prompt || DEFAULT_QUESTION)

  const productContext = product?.description
    ? `\nDetalii produs: ${product.description.substring(0, 400)}`
    : ''

  const system = buildPrompt(template, {
    brand_name: settings.brand_name || 'KidGPS',
    support_email: settings.support_email || 'service@kidgps.ro',
    ai_tone: settings.ai_tone || 'profesional si empatic',
    signature: settings.signature || 'Echipa KidGPS',
    product_context: productContext,
    author_name: '',
    rating: ''
  })

  const user = type === 'review'
    ? `Scrie un raspuns la aceasta recenzie negativa: "${content}"`
    : `Scrie un raspuns la aceasta intrebare: "${content}"`

  const model = settings.ai_model || 'gpt-5.3-chat-latest'

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
        console.log(`  ⏳ Rate limit, astept 15s...`)
        await new Promise(r => setTimeout(r, 15000))
      } else throw e
    }
  }
}

async function main() {
  console.log('🔄 Regenerare răspunsuri AI cu setările noi\n')

  // Incarca setarile
  const settings = await getSettings()
  console.log(`⚙️  Setari: brand="${settings.brand_name}", semnatura="${settings.signature}", model="${settings.ai_model || 'gpt-5.3-chat-latest'}"`)

  // Incarca toate produsele (pentru context)
  const { data: products } = await supabase.from('products').select('*')
  const productMap = {}
  products?.forEach(p => { productMap[p.id] = p })

  // ── RECENZII pending ────────────────────────────────────────────────────────
  const { data: reviews } = await supabase
    .from('reviews')
    .select('*')
    .eq('status', 'pending')
    .order('id')

  console.log(`\n⭐ ${reviews?.length || 0} recenzii pending de regenerat`)

  let reviewOk = 0, reviewErr = 0
  for (let i = 0; i < (reviews?.length || 0); i++) {
    const review = reviews[i]
    const product = productMap[review.product_id]

    try {
      const aiReply = await generateReply('review', review.content, product, settings)
      await supabase.from('reviews').update({ ai_reply: aiReply }).eq('id', review.id)
      reviewOk++
      process.stdout.write('.')
    } catch(e) {
      console.error(`\n  ❌ Review ${review.id}: ${e.message}`)
      reviewErr++
    }

    // Progress la fiecare 20
    if ((i + 1) % 20 === 0) {
      console.log(`\n  [${i + 1}/${reviews.length}] ${reviewOk} ok, ${reviewErr} erori`)
    }
  }
  console.log(`\n✅ Recenzii: ${reviewOk} regenerate, ${reviewErr} erori`)

  // ── ÎNTREBĂRI pending ───────────────────────────────────────────────────────
  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('status', 'pending')
    .order('id')

  console.log(`\n❓ ${questions?.length || 0} întrebări pending de regenerat`)

  let qOk = 0, qErr = 0
  for (let i = 0; i < (questions?.length || 0); i++) {
    const q = questions[i]
    const product = productMap[q.product_id]

    try {
      const aiReply = await generateReply('question', q.question, product, settings)
      await supabase.from('questions').update({ ai_reply: aiReply }).eq('id', q.id)
      qOk++
      process.stdout.write('?')
    } catch(e) {
      console.error(`\n  ❌ Question ${q.id}: ${e.message}`)
      qErr++
    }

    if ((i + 1) % 20 === 0) {
      console.log(`\n  [${i + 1}/${questions.length}] ${qOk} ok, ${qErr} erori`)
    }
  }
  console.log(`\n✅ Întrebări: ${qOk} regenerate, ${qErr} erori`)

  console.log('\n🏁 Gata!')
}

main().catch(console.error)
