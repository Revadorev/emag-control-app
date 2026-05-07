require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') })
const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')
const path = require('path')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const VENDOR_BASE = 'https://www.emag.ro/vendors/vendor/corecsrz'

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

    // Total produse (doar prima pagina)
    if (pageNum === 1) {
      totalProducts = await page.$eval(
        '.js-listing-pagination strong:last-child',
        el => parseInt(el.innerText.replace(/\D/g, '')) || 0
      ).catch(() => 0)
      const pages = Math.ceil(totalProducts / 60)
      console.log(`📊 Total: ${totalProducts} produse (~${pages} pagini)\n`)
    }

    // Extrage toate link-urile de produse
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
          name: name.substring(0, 500).split('').map(c => { var code = c.charCodeAt(0); if (code < 128) return c; if (code >= 192 && code <= 255) return c; if (code === 8230) return '...'; return ''; }).join('')
        }
      }).filter(Boolean)
    ).catch(() => [])

    // Deduplicate pe pagina curenta
    const seen = new Set()
    const unique = pageProducts.filter(p => {
      if (seen.has(p.pnk)) return false
      seen.add(p.pnk)
      return true
    })

    console.log(`  ✅ ${unique.length} produse unice găsite`)
    allProducts.push(...unique)

    // Calculeaza daca mai sunt pagini
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

  // Salvare in Supabase
  console.log('\n💾 Salvez în Supabase...')
  let saved = 0, skipped = 0, errors = 0

    for (const product of finalProducts) {
    // Sanitizare robusta - elimina orice caracter care cauzeaza ByteString error
    function sanitize(str) {
      return (str || '').split('').map(c => {
        var code = c.charCodeAt(0)
        if (code < 128) return c
        if (code >= 192 && code <= 255) return c
        if (code === 8230) return '...'
        return ''
      }).join('').trim()
    }

    const safePnk = sanitize(product.pnk)
    const safeUrl = sanitize(product.url)
    const rawName = product.name && product.name.length > 5 ? product.name : `Produs ${safePnk}`
    const name = sanitize(rawName) || `Produs ${safePnk}`

    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('emag_id', safePnk)
      .single()

    if (existing) { skipped++; continue }

    const { error } = await supabase.from('products').insert({
      name: name.substring(0, 500),
      url: safeUrl,
      emag_id: safePnk,
      active: true
    })

    if (error) {
      if (!error.message.includes('duplicate')) {
        console.error(`  ❌ ${product.pnk}: ${error.message}`)
        errors++
      } else {
        skipped++
      }
    } else {
      console.log(`  ✅ ${product.pnk}: ${name.substring(0, 60)}`)
      saved++
    }

    await new Promise(r => setTimeout(r, 100))
  }

  console.log(`\n📊 Rezultat final: ${saved} produse noi, ${skipped} existente, ${errors} erori`)
  console.log('🏁 Gata!')
}

main().catch(console.error)
