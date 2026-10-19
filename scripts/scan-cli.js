// Uji pipeline OCR pada satu file. Pemakaian: npm run scan:cli -- path/ke/struk.jpg
import fs from 'node:fs';
import { sniffMime } from '../server/services/ocr/preprocess.js';
import { scanReceipt } from '../server/services/ocr/index.js';
import { fmtRp } from '../server/lib/money.js';

const file = process.argv[2];
if (!file) { console.error('Pemakaian: npm run scan:cli -- <file>'); process.exit(1); }
const buffer = fs.readFileSync(file);
const mime = sniffMime(buffer);
if (!mime) { console.error('Format file tidak dikenali'); process.exit(1); }
try {
  const r = await scanReceipt({ buffer, mime });
  console.log(`\n${r.merchant || '(tanpa nama)'}  ${r.date || ''}  [${r.receipt_type}]  engine=${r.engine}  ${r.ms} ms`);
  console.log('prep:', JSON.stringify(r.prep), ' reconciled:', r.reconciled);
  for (const it of r.items) console.log(`  ${String(it.qty).padStart(3)} x ${it.name.padEnd(34).slice(0, 34)} ${fmtRp(it.unit_price).padStart(14)} ${fmtRp(it.line_total).padStart(14)}  ${it.needs_review ? '← cek ulang' : ''}`);
  console.log(`  subtotal ${fmtRp(r.subtotal)} | diskon ${fmtRp(r.discount)} | service ${fmtRp(r.service_charge)} | pajak ${fmtRp(r.tax)} | ongkir ${fmtRp(r.delivery_fee)} | platform ${fmtRp(r.platform_fee)} | tip ${fmtRp(r.tip)} | pembulatan ${fmtRp(r.rounding)}`);
  console.log(`  TOTAL ${fmtRp(r.total)}`);
  if (r.warnings.length) console.log('  peringatan:', r.warnings.join(' | '));
} catch (e) {
  console.error(`\nGAGAL [${e.code || 'error'}]: ${e.message}`, e.details ? JSON.stringify(e.details) : '');
  process.exit(1);
}
