export const PROMPT_VERSION = '2026-10-v1';

export const standardMessage = (q = {}) =>
  `Extract this receipt. Client quality hints: {blur: ${!!q.blur}, dark: ${!!q.dark}, lowRes: ${!!q.lowRes}}. Return only the JSON object.`;

export const tileMessage = (i, n) =>
  `This image is part ${i} of ${n} of one long receipt, with about 15% overlap with the neighbouring parts. Extract only what is visible in THIS part. If this is not the first part, merchant and date may be absent (use null). If this is not the last part, totals may be absent (use 0). Do not repeat items you can tell belong to the overlap with the previous part only if they are cut mid-line. Return only the JSON object.`;

export const mistralStructureMessage = (markdown) =>
  `Below is OCR markdown text of one receipt. Tables may be flattened and numbers may contain OCR errors. Structure it per the schema, apply every rule, and fix obvious OCR digit confusions (O vs 0, l vs 1, S vs 5, B vs 8) only when the receipt's own math proves it. Return only the JSON object.\n\n<ocr_text>\n${markdown}\n</ocr_text>`;

export const enhancedRetryMessage = (mismatch, markdown) =>
  `The first extraction failed the math check: ${mismatch}. Here is an OCR draft of the same receipt, which may contain errors. Look at the image again, verify every number against it, and return the corrected JSON object. Do not force numbers to reconcile; report what is printed and lower confidence where unsure.\n\n<ocr_draft>\n${markdown}\n</ocr_draft>`;
