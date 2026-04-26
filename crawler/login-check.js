/**
 * login-check.js
 * Deschide browserul, verifică dacă ești logat și salvează sesiunea
 * Browserul rămâne deschis până apeși ENTER
 */
require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

async function loginCheck() {
  // Șterg sesiunea veche
  const sessionDir = path.join(__dirname, '..', 'browser-session')
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true })
    console.log('🗑️  Sesiune veche ștearsă')
  }

  console.log('🌐 Deschid browserul...')

  const context = await chromium.launchPersistentContext(
    sessionDir,
    {
      headless: false,  // VIZIBIL
      viewport: { width: 1280, height: 800 },
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    }
  )

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  const page = await context.newPage()
  await page.goto('https://www.emag.ro/account/login', { waitUntil: 'domcontentloaded', timeout: 30000 })

  console.log('\n📋 Browserul este deschis pe pagina de login eMAG.')
  console.log('👉 Loghează-te manual în browser.')
  console.log('👉 După ce ești logat și vezi "Contul meu", revino aici.\n')

  // Așteptăm ca userul să se logheze - verificăm automat la fiecare 3 secunde
  let loggedIn = false
  let checks = 0

  while (!loggedIn && checks < 40) {
    await new Promise(r => setTimeout(r, 3000))
    checks++

    try {
      const isLogged = await page.evaluate(() => {
        return window.EM && window.EM.is_logged_in === true
      })

      const currentUrl = page.url()
      console.log(`⏳ Check ${checks}: URL=${currentUrl.substring(0, 60)} | Logged=${isLogged}`)

      if (isLogged || currentUrl.includes('myaccount') || currentUrl.includes('dashboard')) {
        loggedIn = true
        console.log('\n✅ LOGIN DETECTAT! Sesiunea se salvează...')
      }
    } catch(e) {}
  }

  if (!loggedIn) {
    console.log('\n⚠️  Nu am detectat login automat.')
    console.log('👉 Apasă ENTER în terminal când ești sigur că ești logat...')
    await new Promise(resolve => process.stdin.once('data', resolve))
  }

  // Verificare finală
  await page.goto('https://www.emag.ro', { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForTimeout(2000)

  const finalCheck = await page.evaluate(() => ({
    isLoggedIn: window.EM && window.EM.is_logged_in,
    userId: window.EM && window.EM.eUserInfo && window.EM.eUserInfo.user_id
  }))

  console.log('\n📊 Verificare finală:', finalCheck)

  if (finalCheck.isLoggedIn) {
    console.log('✅ Ești logat cu succes! Sesiunea a fost salvată.')
  } else {
    console.log('❌ NU ești logat. Încearcă din nou.')
  }

  await context.close()
  console.log('\n🎉 Gata! Rulează: node crawler/test-scraper.js')
  process.exit(0)
}

loginCheck().catch(console.error)
