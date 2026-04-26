require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')

const SESSION_DIR = path.join(__dirname, '..', 'browser-session')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function setupLogin() {
  console.log('🔐 Setup login eMAG\n')

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    userAgent: UA,
  })

  const page = await context.newPage()
  await page.goto('https://www.emag.ro/account/login/source/header')

  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║  1. Loghează-te pe eMAG în browser               ║')
  console.log('║  2. Du-te la o recenzie si raspunde-i             ║')
  console.log('║     (ca sa se salveze sesiunea auth.emag.ro)      ║')
  console.log('║  3. Apasă ENTER aici când ai terminat             ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log('')

  await new Promise(resolve => process.stdin.once('data', resolve))

  const cookies = await context.cookies()
  const emagCookies = cookies.filter(c => c.domain.includes('emag.ro'))
  console.log(`🍪 ${emagCookies.length} cookies salvate`)

  await context.close()
  console.log('✅ Sesiunea salvata! Ruleaza: node crawler\\watch.js')
  process.exit(0)
}

setupLogin().catch(console.error)
