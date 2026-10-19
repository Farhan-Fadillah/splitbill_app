// Entry point serverless Vercel: seluruh API (Express) ditangani satu fungsi.
// Halaman statis dilayani CDN dari folder public/ (lihat vercel.json).
import { createApp } from '../server/index.js';

export default createApp();
