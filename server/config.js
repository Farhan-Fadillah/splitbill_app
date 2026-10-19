import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const onVercel = !!process.env.VERCEL;

export const cfg = {
  root,
  onVercel,
  port: int(process.env.PORT, 3000),
  trustProxy: process.env.TRUST_PROXY || '0',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  dbPath: path.resolve(root, process.env.DB_PATH || './data/splitbill.sqlite'),
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || './uploads'),
  sumopod: {
    key: process.env.SUMOPOD_API_KEY || '',
    baseUrl: (process.env.SUMOPOD_BASE_URL || 'https://ai.sumopod.com').replace(/\/+$/, ''),
    style: (process.env.SUMOPOD_API_STYLE || 'anthropic').toLowerCase(),
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
  },
  mistral: {
    key: process.env.MISTRAL_API_KEY || '',
    baseUrl: (process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai').replace(/\/+$/, ''),
    ocrModel: process.env.MISTRAL_OCR_MODEL || 'mistral-ocr-latest',
    chatModel: process.env.MISTRAL_CHAT_MODEL || 'mistral-small-latest',
  },
  hedgeMs: int(process.env.HEDGE_MS, 12000),
  hardTimeoutMs: int(process.env.HARD_TIMEOUT_MS, 30000),
  // Vercel: fungsi dibatasi maxDuration 60 dtk (lihat vercel.json), jadi batas scan dibuat lebih pendek.
  scanDeadlineMs: int(process.env.SCAN_DEADLINE_MS, onVercel ? 52000 : 75000),
  scanConcurrency: int(process.env.SCAN_CONCURRENCY, 2),
  scanRatePerMin: int(process.env.SCAN_RATE_PER_MIN, 10),
  // Vercel membatasi body request fungsi 4,5MB. Foto dikompres browser (~1,5MB), tetapi PDF dikirim apa adanya.
  maxUploadBytes: int(process.env.MAX_UPLOAD_BYTES, onVercel ? 4 * 1024 * 1024 : 10 * 1024 * 1024),
  maxQrisBytes: 2 * 1024 * 1024,
  billTtlDays: 90,
  qaToken: process.env.QA_TOKEN || '',
  redis: {
    url: (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/+$/, ''),
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
  },
  supportEmail: process.env.SUPPORT_EMAIL || 'hello@dwimnofan.com',
  donationUrl: process.env.DONATION_URL || '',
};
