require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') })
const { chromium } = require('playwright')
const path = require('path')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VENDOR_BASE = 'https://www.emag.ro/vendors/vendor/corecsrz'

// Sanitizare - elimina orice caracter non-ASCII care cauzeaza ByteString errors
function sanitize(str) {
  if (!str) return ''
  let result = ''
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code <= 127) result += str[i]
    // skip orice altceva inclusiv 8230 (ellipsis unicode)
  }
  return result.trim()
}

// Supabase REST API direct cu fetch - fara client JS
async function supabaseSelect(table, filter) {
  const params = new URLSearchParams(filter)
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}&select=id`
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    }
  })
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

async function supabaseInsert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
    'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(row)
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text)
  }
}

async function main() {
  console.log('🚀 Sync Produse Vendor eMAG\n')

  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: true, args: ['--no-sandbox'] }
  )
  const page = await context.newPage()

  const allProducts = []
  let pageNum = 1
  let totalProducts = 0

  while (true) {
    const url = pageNum === 1
      ? `${VENDOR_BASE}?ref=seller-page-see-all-products`
      : `${VENDOR_BASE}/p${pageNum}`

    console.log(`📄 Pagina ${pageNum}: ${url}`)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 2000))

    if (pageNum === 1) {
      totalProducts = await page.$eval(
        '.js-listing-pagination strong:last-child',
        el => parseInt(el.innerText.replace(/\D/g, '')) || 0
      ).catch(() => 0)
      const pages = Math.ceil(totalProducts / 60)
      console.log(`📊 Total: ${totalProducts} produse (~${pages} pagini)\n`)
    }

    // Extrage produse - fara sanitizare in browser context
    const pageProducts = await page.$$eval('a[href*="/pd/"][aria-label]', links =>
      links.map(a => {
        const href = a.href
        const pnkMatch = href.match(/\/pd\/([A-Z0-9]+)/)
        if (!pnkMatch) return null
        if (href.includes('review') || href.includes('question') || href.includes('feedback')) return null
        const name = (a.getAttribute('aria-label') || '').trim()
        if (!name || name.length < 5) return null
        return {
          url: href.split('?')[0].replace(/\/$/, '') + '/',
          pnk: pnkMatch[1],
          name: name.substring(0, 500)
        }
      }).filter(Boolean)
    ).catch(() => [])

    // Sanitizare in Node.js dupa ce ies din browser
    const sanitized = pageProducts.map(p => ({
      pnk: sanitize(p.pnk),
      url: sanitize(p.url),
      name: sanitize(p.name)
    })).filter(p => p.pnk.length > 0)

    // Deduplicate
    const seen = new Set()
    const unique = sanitized.filter(p => {
      if (seen.has(p.pnk)) return false
      seen.add(p.pnk)
      return true
    })

    console.log(`  ✅ ${unique.length} produse unice găsite`)
    allProducts.push(...unique)

    const totalPages = Math.ceil(totalProducts / 60)
    if (pageNum >= totalPages || pageNum >= 20) break
    pageNum++
    await new Promise(r => setTimeout(r, 1500))
  }

  await context.close()

  // Deduplicate global
  const seenGlobal = new Set()
  const finalProducts = allProducts.filter(p => {
    if (seenGlobal.has(p.pnk)) return false
    seenGlobal.add(p.pnk)
    return true
  })

  console.log(`\n✅ Total produse unice: ${finalProducts.length} din ${totalProducts} anunțate`)
  console.log('\n💾 Salvez în Supabase...')

  let saved = 0, skipped = 0, errors = 0

  for (const product of finalProducts) {
    try {
      const existing = await supabaseSelect('products', { 'emag_id': `eq.${product.pnk}` })
      if (existing.length > 0) { skipped++; continue }

      const name = product.name.length > 5 ? product.name : `Produs ${product.pnk}`

      await supabaseInsert('products', {
        name: name.substring(0, 500),
        url: product.url,
        emag_id: product.pnk,
        active: true
      })

      console.log(`  ✅ ${product.pnk}: ${name.substring(0, 60)}`)
      saved++
    } catch (e) {
      const msg = e.message || ''
      if (msg.includes('duplicate') || msg.includes('23505')) {
        skipped++
      } else {
        console.error(`  ❌ ${product.pnk}: ${msg.substring(0, 100)}`)
        errors++
      }
    }

    await new Promise(r => setTimeout(r, 100))
  }

  console.log(`\n📊 Rezultat final: ${saved} produse noi, ${skipped} existente, ${errors} erori`)
  console.log('🏁 Gata!')
}

main().catch(console.error)
