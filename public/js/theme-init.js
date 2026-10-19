// Dijalankan di <head> sebelum render supaya tidak berkedip saat mode gelap.
try {
  const t = localStorage.getItem('sb_theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch { /* penyimpanan diblokir */ }
