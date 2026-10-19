import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cfg } from '../../config.js';
import { postJson, HttpError } from './http.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
export const SYSTEM_PROMPT = fs.readFileSync(path.join(dir, 'prompts', 'system.txt'), 'utf8');

const joinUrl = (base, p) => (/\/v1$/.test(base) && p.startsWith('/v1') ? base + p.slice(3) : base + p);

function extractText(style, json) {
  if (style === 'openai') {
    const c = json?.choices?.[0]?.message?.content;
    if (Array.isArray(c)) return c.map((p) => p.text || '').join('');
    return c || '';
  }
  const blocks = json?.content;
  if (Array.isArray(blocks)) return blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
  // beberapa gateway "anthropic" membalas format OpenAI
  return json?.choices?.[0]?.message?.content || '';
}

/**
 * Panggil Claude lewat gateway Sumopod. Mendukung dua format (SUMOPOD_API_STYLE):
 *  - anthropic: POST /v1/messages
 *  - openai:    POST /v1/chat/completions
 * `image` = Buffer JPEG/PNG. Mengembalikan teks balasan model.
 */
export async function callClaude({ image, mime = 'image/jpeg', userText, signal, config = cfg }) {
  const { key, baseUrl, style, model } = config.sumopod;
  if (!key) throw new HttpError('SUMOPOD_API_KEY belum diisi', { status: 401 });
  const b64 = image.toString('base64');

  const build = (withTemperature) => {
    if (style === 'openai') {
      return {
        url: joinUrl(baseUrl, '/v1/chat/completions'),
        headers: { authorization: `Bearer ${key}` },
        body: {
          model, max_tokens: 4096, ...(withTemperature ? { temperature: 0 } : {}),
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } }, { type: 'text', text: userText }] },
          ],
        },
      };
    }
    return {
      url: joinUrl(baseUrl, '/v1/messages'),
      headers: { 'x-api-key': key, authorization: `Bearer ${key}`, 'anthropic-version': '2023-06-01' },
      body: {
        model, max_tokens: 4096, ...(withTemperature ? { temperature: 0 } : {}),
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } }, { type: 'text', text: userText }] }],
      },
    };
  };

  const run = async (withTemperature) => {
    const r = build(withTemperature);
    return postJson(r.url, r.headers, r.body, { timeoutMs: config.hardTimeoutMs, signal });
  };

  let json;
  try {
    json = await run(true);
  } catch (e) {
    // Beberapa model terbaru menolak parameter temperature; coba sekali tanpa itu.
    if (e instanceof HttpError && e.status === 400 && /temperature|sampling/i.test(e.body)) json = await run(false);
    else throw e;
  }
  const text = extractText(style, json);
  if (!text) throw new HttpError('Balasan model kosong', { status: 200 });
  return text;
}
