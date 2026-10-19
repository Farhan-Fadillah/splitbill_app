import { cfg } from '../../config.js';
import { postJson, HttpError } from './http.js';
import { SYSTEM_PROMPT } from './claude.js';

/** Mistral OCR: gambar -> teks markdown. */
export async function callMistralOcr({ image, mime = 'image/jpeg', signal, config = cfg }) {
  const { key, baseUrl, ocrModel } = config.mistral;
  if (!key) throw new HttpError('MISTRAL_API_KEY belum diisi', { status: 401 });
  const json = await postJson(
    `${baseUrl}/v1/ocr`,
    { authorization: `Bearer ${key}` },
    { model: ocrModel, document: { type: 'image_url', image_url: `data:${mime};base64,${image.toString('base64')}` } },
    { timeoutMs: config.hardTimeoutMs, signal },
  );
  const md = (json.pages || []).map((p) => p.markdown || '').join('\n\n').trim();
  if (!md) throw new HttpError('Mistral OCR tidak menemukan teks', { status: 200 });
  return md;
}

/** Mistral chat: teks OCR -> JSON terstruktur (response_format json_object). */
export async function callMistralStructure({ userText, signal, config = cfg }) {
  const { key, baseUrl, chatModel } = config.mistral;
  if (!key) throw new HttpError('MISTRAL_API_KEY belum diisi', { status: 401 });
  const json = await postJson(
    `${baseUrl}/v1/chat/completions`,
    { authorization: `Bearer ${key}` },
    {
      model: chatModel, temperature: 0, max_tokens: 4096, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userText }],
    },
    { timeoutMs: config.hardTimeoutMs, signal },
  );
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new HttpError('Balasan Mistral kosong', { status: 200 });
  return text;
}
