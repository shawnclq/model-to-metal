// Formatting and DOM helpers used everywhere: number formats, HTML escaping, safe localStorage.
// The page markup is fixed and every selector the game uses exists, so this returns an element (as the original code assumes).
export const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
export const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[c],
  );
export const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  },
};
export const nf = (n: number, d = 0) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const f0 = (n: number) => nf(Math.round(n));
export const f1 = (n: number) => nf(n, 1);
export const f2 = (n: number) => nf(n, 2);
export function fmtT(sec: number) {
  if (!isFinite(sec)) return "—";
  if (sec < 1e-3) return f1(sec * 1e6) + " µs";
  if (sec < 1) return f1(sec * 1e3) + " ms";
  return f2(sec) + " s";
}
export function fmtMoney(x: number) {
  if (!isFinite(x)) return "—";
  if (x >= 100) return "$" + f0(x);
  if (x >= 10) return "$" + f1(x);
  return "$" + f2(x);
}
export function parseNum(v: string | number | undefined) {
  v = String(v || "")
    .trim()
    .toLowerCase()
    .replace(/,/g, "");
  const m = v.match(/^(\d*\.?\d+)(k)?$/);
  if (!m) return NaN;
  return Math.round(parseFloat(m[1]) * (m[2] ? 1024 : 1));
}
export function pad(s: string | number, n: number) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
export function lpad(s: string | number, n: number) {
  s = String(s);
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}
export function kfmt(n: number) {
  return n >= 1024 && n % 1024 === 0 ? n / 1024 + "k" : f0(n);
}
