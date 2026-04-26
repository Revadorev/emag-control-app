require('dotenv').config({ path: '.env.local' })
const { createContext, scrapeReviews, scrapeQuestions } = require('./emag-scraper')

const PRODUCT_URL = 'https://www.emag.ro/ceas-smartwatch-barbati-techoner-wand-pro-2-inch-super-amoled-inteligent-fitness-sport-apel-bluetooth-hd-multi-sport-ritm-cardiac-multi-point-spo2-tensiune-oxigen-limba-romana-carcasa-metalica-2-curel/pd/DRD4WVYBM/'

async function test() {
  console.log('🧪 Test scraping recenzii și întrebări...\n')
  const context = await createContext(true)
  const page = await context.newPage()

  // Test recenzii
  console.log('⭐ Scraping recenzii 1-3 stele...')
  const reviews = await scrapeReviews(page, PRODUCT_URL)
  console.log(`\n✅ Găsite ${reviews.length} recenzii 1-3 stele`)
  if (reviews.length > 0) {
    console.log('\nPrimele 3 recenzii:')
    reviews.slice(0, 3).forEach((r, i) => {
      console.log(`\n[${i+1}] ⭐${r.rating} — ${r.author}`)
      console.log(`    "${r.content.substring(0, 100)}..."`)
      console.log(`    Data: ${r.reviewDate} | ID: ${r.reviewId}`)
    })
  }

  // Test întrebări
  console.log('\n\n❓ Scraping întrebări fără răspuns...')
  const questions = await scrapeQuestions(page, PRODUCT_URL)
  console.log(`\n✅ Găsite ${questions.length} întrebări fără răspuns`)
  if (questions.length > 0) {
    console.log('\nPrimele 3 întrebări:')
    questions.slice(0, 3).forEach((q, i) => {
      console.log(`\n[${i+1}] ${q.author} — ${q.askedDate}`)
      console.log(`    "${q.question.substring(0, 100)}..."`)
    })
  }

  await context.close()
  console.log('\n🏁 Test finalizat!')
}

test().catch(console.error)
