import crypto from 'node:crypto';
export const newToken = (bytes = 16) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
export const isToken = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(s);
