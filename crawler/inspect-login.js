require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')

async function inspectLogin() {
  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session-inspect'),
    {
      headless: true,
      args: ['--no-sandbox'],
    }
  )

  const page = await context.newPage()
  await page.goto('https://www.emag.ro/account/login/source/header', {
    waitUntil: 'domcontentloaded', timeout: 30000
  })
  await page.waitForTimeout(3000)

  // Obținem toate input-urile din pagină
  const inputs = await page.$$eval('input', els => els.map(e => ({
    id: e.id, name: e.name, type: e.type, placeholder: e.placeholder, class: e.className.substring(0,50)
  })))
  console.log('INPUTS:', JSON.stringify(inputs, null, 2))

  // HTML al formularului
  const formHtml = await page.$eval('form', el => el.innerHTML.substring(0, 2000)).catch(() => 'no form')
  console.log('\nFORM HTML (first 2000):\n', formHtml)

  await context.close()
}

inspectLogin().catch(console.error)
