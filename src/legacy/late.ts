// Pass-1 bridge (temporary, removed in pass 2). In the original single file, a few functions call
// functions defined in a LATER script. As ES modules, importing a later file would change the order
// files run in, so those calls go through this object instead. Each later file fills in its names
// when it loads; every use happens inside a function, after all files have loaded.
import type * as App from "./7-app.ts";
import type * as R6b from "./6b-render.ts";
import type * as R6c from "./6c-render.ts";
import type * as W0 from "./6d-w0.ts";
import type * as W0b from "./6e-w0b.ts";
import type * as C0 from "./7b-w0.ts";
import type * as C0b from "./7c-w0b.ts";

export const late = {} as {
  G: typeof App.G;
  checkGoals: typeof App.checkGoals;
  err: typeof App.err;
  exec: typeof App.exec;
  locked: typeof App.locked;
  print: typeof App.print; // also a browser built-in (window.print), so it must never be left unimported
  summary1: typeof App.summary1;
  summary2: typeof App.summary2;
  ctrlsMore: typeof R6b.ctrlsMore;
  renderMIG: typeof R6b.renderMIG;
  renderW3: typeof R6b.renderW3;
  renderW4: typeof R6b.renderW4;
  WL: typeof R6c.WL;
  wlCheck: typeof R6c.wlCheck;
  chipSVGamd: typeof R6c.chipSVGamd;
  pickHtml: typeof R6c.pickHtml;
  renderW0: typeof W0.renderW0;
  renderHeads: typeof W0b.renderHeads;
  renderMoE: typeof W0b.renderMoE;
  ctrlsW0: typeof C0.ctrlsW0;
  ctrlsW0b: typeof C0b.ctrlsW0b;
};
