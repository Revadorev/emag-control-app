require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

async function autoLogin() {
  const email = process.env.EMAG_EMAIL
  const password = process.env.EMAG_PASSWORD

  console.log(`🔐 Login eMAG cu ${email}...`)

  // Șterg sesiunea veche dacă există
  const sessionDir = path.join(__dirname, '..', 'browser-session')
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true })
  }

  const context = await chromium.launchPersistentContext(
    sessionDir,
    {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'ro-RO',
      timezoneId: 'Europe/Bucharest',
      // Ascunde automation flags
      ignoreDefaultArgs: ['--enable-automation'],
      extraHTTPHeaders: {
        'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    }
  )

  // Override navigator.webdriver
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
    Object.defineProperty(navigator, 'languages', { get: () => ['ro-RO', 'ro', 'en'] })
  })

  const page = await context.newPage()

  try {
    // Mergem direct la login
    console.log('📍 Navighez la pagina de login...')
    await page.goto('https://www.emag.ro/account/login/source/header', {
      waitUntil: 'networkidle',
      timeout: 30000
    })
    await page.waitForTimeout(3000)

    const url = page.url()
    console.log('📍 URL curent:', url)

    // Verifică dacă e captcha
    const hasCaptcha = await page.$('canvas, .amzn-captcha-modal-title, #captcha').catch(() => null)
    if (hasCaptcha) {
      console.log('⚠️  Captcha detectat! Încerc altă abordare...')
      
      // Încearcă prin URL direct fără /source/header
      await page.goto('https://www.emag.ro/account/login', {
        waitUntil: 'networkidle',
        timeout: 30000
      })
      await page.waitForTimeout(3000)
    }

    // Screenshot pentru debug
    await page.screenshot({ path: '/tmp/emag-login-debug.png' })
    console.log('📸 Screenshot salvat la /tmp/emag-login-debug.png')

    // Găsim input-urile
    const inputs = await page.$$eval('input', els => els.map(e => ({
      id: e.id, name: e.name, type: e.type, placeholder: e.placeholder
    })))
    console.log('📋 Input-uri găsite:', JSON.stringify(inputs))

    // Încearcă diferite selectoare pentru email
    const emailSelectors = [
      'input[type="email"]',
      'input[name*="email"]',
      'input[name*="username"]',
      'input[id*="email"]',
      'input[id*="username"]',
      'input[placeholder*="email"]',
      'input[placeholder*="Email"]',
      '#my_account_login_username',
    ]

    let emailField = null
    for (const sel of emailSelectors) {
      emailField = await page.$(sel)
      if (emailField) {
        console.log('✅ Email field găsit cu selector:', sel)
        break
      }
    }

    if (!emailField) {
      console.error('❌ Câmp email negăsit. Verifică screenshot-ul.')
      await context.close()
      process.exit(1)
    }

    await emailField.click()
    await page.waitForTimeout(500)
    await emailField.fill(email)
    await page.waitForTimeout(800)

    // Parolă
    const passSelectors = [
      'input[type="password"]',
      'input[name*="password"]',
      'input[id*="password"]',
      '#my_account_login_password',
    ]

    let passField = null
    for (const sel of passSelectors) {
      passField = await page.$(sel)
      if (passField) {
        console.log('✅ Password field găsit cu selector:', sel)
        break
      }
    }

    if (!passField) {
      console.error('❌ Câmp parolă negăsit')
      await context.close()
      process.exit(1)
    }

    await passField.click()
    await page.waitForTimeout(500)
    await passField.fill(password)
    await page.waitForTimeout(800)

    // Submit
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Intră în cont")',
      'button:has-text("Login")',
      '.my-account-login-btn',
      '[data-test="login-submit"]',
    ]

    let submitBtn = null
    for (const sel of submitSelectors) {
      submitBtn = await page.$(sel)
      if (submitBtn) {
        console.log('✅ Submit button găsit cu selector:', sel)
        break
      }
    }

    if (!submitBtn) {
      console.error('❌ Buton submit negăsit')
      await context.close()
      process.exit(1)
    }

    await submitBtn.click()
    console.log('⏳ Aștept redirect după login...')
    await page.waitForTimeout(5000)

    const finalUrl = page.url()
    console.log('📍 URL după submit:', finalUrl)
    await page.screenshot({ path: '/tmp/emag-after-login.png' })

    if (finalUrl.includes('login')) {
      console.error('❌ Încă pe pagina de login — credențiale greșite sau alt captcha')
    } else {
      console.log('✅ Login reușit! Sesiunea salvată.')
    }

  } catch (e) {
    console.error('❌ Eroare:', e.message)
    await page.screenshot({ path: '/tmp/emag-error.png' }).catch(() => {})
  } finally {
    await context.close()
  }
}

autoLogin()
