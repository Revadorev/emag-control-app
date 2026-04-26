/**
 * import-products.js
 * Importă lista de produse în Supabase
 * 
 * Uso: editează products.json cu URL-urile tale, apoi rulează:
 * node crawler/import-products.js
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function importProducts() {
  const filePath = path.join(__dirname, '..', 'products.json')
  
  if (!fs.existsSync(filePath)) {
    console.error('❌ Fișierul products.json nu există!')
    console.log('Creează products.json cu formatul:')
    console.log(JSON.stringify([
      { "name": "Nume produs 1", "url": "https://www.emag.ro/produs-1/pd/XXXXX" },
      { "name": "Nume produs 2", "url": "https://www.emag.ro/produs-2/pd/YYYYY" }
    ], null, 2))
    return
  }

  const products = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  console.log(`📦 Importez ${products.length} produse...`)

  let success = 0
  let skipped = 0

  for (const product of products) {
    const { error } = await supabase
      .from('products')
      .upsert({ name: product.name, url: product.url, active: true }, { onConflict: 'url' })
    
    if (error) {
      console.error(`  ❌ Eroare ${product.name}: ${error.message}`)
    } else {
      success++
    }
  }

  console.log(`\n✅ Import finalizat: ${success} produse importate, ${skipped} skipped`)
}

importProducts().catch(console.error)
