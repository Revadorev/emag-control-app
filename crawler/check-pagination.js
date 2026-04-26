require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const path = require('path')

const VENDOR_URL = 'https://www.emag.ro/vendors/vendor/corecsrz?ref=seller-page-see-all-products'

async function checkPagination() {
  const context = await chromium.launchPersistentContext(
    path.join(__dirname, '..', 'browser-session'),
    { headless: true, args: ['--no-sandbox'] }
  )
  const page = await context.newPage()

  await page.goto(VENDOR_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 2000))

  const paginationInfo = await page.evaluate(() => {
    // Cauta elementele de paginare
    const pagination = document.querySelector('.pagination, [class*="paginator"], [class*="pagination"]')
    const nextBtn = document.querySelector('a[rel="next"], .next-page, li.next a, .pagination .next, [aria-label="Next"]')
    const allPageLinks = Array.from(document.querySelectorAll('.pagination a, [class*="paginator"] a')).map(a => ({
      href: a.href,
      txt: a.innerText.trim()
    }))

    // Cauta total produse
    const totalEl = document.querySelector('[class*="total"], [class*="count"], .page-title-count')
    const total = totalEl ? totalEl.innerText : ''

    // Cauta in HTML numere de pagini
    const pageNumbers = document.body.innerHTML.match(/page=\d+/g) || []

    return {
      hasPagination: !!pagination,
      paginationHtml: pagination ? pagination.outerHTML.substring(0, 500) : 'nu gasit',
      hasNextBtn: !!nextBtn,
      nextBtnHtml: nextBtn ? nextBtn.outerHTML.substring(0, 200) : 'nu gasit',
      allPageLinks: allPageLinks.slice(0, 10),
      totalText: total,
      pageNumbersInHtml: [...new Set(pageNumbers)].slice(0, 10)
    }
  })

  console.log('\n📋 Pagination info:')
  console.log(JSON.stringify(paginationInfo, null, 2))

  // Screenshot
  await page.screenshot({ path: 'vendor-page.png' })
  console.log('\n📸 vendor-page.png salvat')

  await context.close()
}

checkPagination().catch(console.error)
