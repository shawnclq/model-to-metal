import { esc } from "../data/format.ts";
import { INFO } from "../data/info.ts";
// The "inspect" box under a sim panel: what the tapped part is, with a tip.
export function infoHtml(id: string | null) {
  const x = INFO[id as string];
  if (!x)
    return `<span class="tip">Tap part of the chip to learn what it does: the small squares (SMs), the stacks beside the die (HBM), or the moving dashes (bandwidth).</span>`;
  return `<b>${esc(x.t)}</b>${esc(x.d)}<div class="tip" style="margin-top:4px">${esc(x.tip)}</div>`;
}
