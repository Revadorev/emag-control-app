require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')

const SESSION_DIR = path.join(__dirname, '..', 'browser-session')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function debug() {
  const browser = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    args: ['--no-sandbox'],
    userAgent: UA,
    viewport: { width: 1280, height: 800 },
  })
  const page = await browser.newPage()

  console.log('Navighez la auth.emag.ro...')
  await page.goto('https://auth.emag.ro/user/login', { waitUntil: 'domcontentloaded', timeout: 15000 })
  await new Promise(r => setTimeout(r, 3000))

  const info = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')].map(i => ({
      type: i.type, name: i.name, id: i.id,
      placeholder: i.placeholder,
      class: i.className.substring(0, 60)
    }))
    const buttons = [...document.querySelectorAll('button, input[type="submit"]')].map(b => ({
      type: b.type, text: b.innerText?.substring(0, 40),
      class: b.className.substring(0, 60), id: b.id
    }))
    return { inputs, buttons, url: location.href }
  })

  console.log('\nInputs:', JSON.stringify(info.inputs, null, 2))
  console.log('\nButtons:', JSON.stringify(info.buttons, null, 2))
  console.log('\nURL:', info.url)

  // Asteapta 30s sa poti vedea pagina
  console.log('\n⏳ 30 secunde sa inspectezi pagina...')
  await new Promise(r => setTimeout(r, 30000))
  await browser.close()
}

debug().catch(console.error)
