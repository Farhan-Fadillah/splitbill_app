// Parser nominal uang dari berbagai format struk. Mengembalikan integer (rupiah) atau NaN.
// Contoh: "1.250.000" "1,250,000" "12.500,00" "12500" "12.5k" "12rb" "Rp 15.000" "-1.000" "(1.000)"
export function parseAmount(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isInteger(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;

  let s = value.trim().toLowerCase();
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[,.]-+$/, ''); // "15.000,-" = tanpa sen, bukan negatif
  if (/^[^\d]*[-−]/.test(s)) negative = true;

  let multiplier = 1;
  const suffix = s.match(/(\d)\s*(k|rb|ribu|jt|juta)\b/);
  if (suffix) multiplier = /jt|juta/.test(suffix[2]) ? 1_000_000 : 1000;

  s = s.replace(/idr|rp\.?|usd|sgd|myr|jpy|¥|\$|€|£|\s/g, '');
  s = s.replace(/(k|rb|ribu|jt|juta)$/, '');
  s = s.replace(/[^0-9.,]/g, '');
  if (!s || !/\d/.test(s)) return NaN;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let normalized;
  if (lastDot !== -1 && lastComma !== -1) {
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    normalized = s.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? '.' : ',';
    const parts = s.split(sep);
    if (parts.length > 2) normalized = parts.join('');
    else if (parts[1].length === 3 && !suffix) normalized = parts.join('');
    else normalized = parts[0] + '.' + parts[1];
  } else normalized = s;

  const n = parseFloat(normalized);
  if (!Number.isFinite(n)) return NaN;
  const result = Math.round(n * multiplier);
  return negative ? -result : result;
}

export const fmtRp = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n));
