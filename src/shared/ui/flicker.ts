// The chip's "busy SMs" flicker: lit squares track how busy the Tensor Cores are.
// Renderers report utilisation with setUtil() and stop the animation with stopFlicker().
let flickT: ReturnType<typeof setInterval> | undefined,
  curUtil = 0;
export function setUtil(u: number) {
  curUtil = u;
}
export function stopFlicker() {
  clearInterval(flickT);
}
export function startFlicker() {
  clearInterval(flickT);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const paint = () => {
    const cells = document.querySelectorAll("#simBody rect.sm:not(.dis)");
    if (!cells.length) return;
    const p = curUtil;
    if (reduce) {
      const n = Math.round(cells.length * p);
      cells.forEach((c, i) => c.classList.toggle("on", i < n));
      return;
    }
    cells.forEach((c) => c.classList.toggle("on", Math.random() < p));
  };
  paint();
  flickT = setInterval(paint, 320);
}
