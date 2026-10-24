import type { Gpu } from "../shared/data/types.ts";
/** A Compare-panel cell: a number, some text, or nothing (e.g. no FP4 support). */
type Cell = string | number | undefined;
import { LEVEL_BY_ID } from "./catalog.ts";
import { $, esc, f0, f2 } from "../shared/data/format.ts";
import { ALL_GPUS, GPUS } from "../shared/data/hardware.ts";
// The Compare GPUs panel (header button), open from anywhere.
/* ============ Compare GPUs panel ============ */
export function cmpBest(vals: Cell[], hi = true) {
  const v = vals.filter((x) => typeof x === "number");
  const b = hi ? Math.max(...v) : Math.min(...v);
  return (x: Cell) => x === b;
}
export function renderCompare() {
  const gs = ALL_GPUS.map((k) => GPUS[k]);
  const lv = (id: string) => {
    const l = LEVEL_BY_ID.get(id);
    return l ? `<button type="button" class="lvlink" data-level="${l.id}">W${l.world}·L${l.n}</button>` : "";
  };
  const row = (label: string, fn: (g: Gpu) => Cell, num: boolean, hi?: boolean, link?: string) => {
    const vals = gs.map(fn);
    const best = num ? cmpBest(vals, hi) : () => false;
    return `<tr><th>${label}${link ? " " + link : ""}</th>${vals.map((v) => `<td class="${best(v) ? "best" : ""}">${typeof v === "number" ? (Number.isInteger(v) ? f0(v) : String(v)) : v}</td>`).join("")}</tr>`;
  };
  const t = `<div class="tlwrap"><table class="cmp"><thead><tr><th></th>${gs.map((g) => `<th class="${g.vendor}">${esc(g.name)}<small>${g.vendor === "amd" ? "AMD" : "NVIDIA"} · ${esc(g.arch)}</small></th>`).join("")}</tr></thead><tbody>
   ${row("Memory (GB)", (g) => g.mem, true, true, lv("kv-cache-memory"))}
   ${row("Memory type", (g) => g.hbm, false)}
   ${row("Bandwidth (TB/s)", (g) => g.bw, true, true, lv("memory-bandwidth"))}
   ${row("BF16 TFLOPS", (g) => g.bf16, true, true)}
   ${row("FP8 TFLOPS", (g) => g.fp8, true, true, lv("prefill-decode"))}
   ${row("FP4 TFLOPS", (g) => g.fp4 || "—", true, true)}
   ${row("Compute blocks", (g) => (g.vendor === "amd" ? `${g.cus} CUs on 8 chiplets` : `${g.sms} SMs on ${g.dies} die${g.dies! > 1 ? "s" : ""}`), false)}
   ${row("GPU-to-GPU link", (g) => g.link, false, true, lv("hgx-board"))}
   ${row("Power (W)", (g) => g.tdp, true, false, lv("perf-per-watt"))}
   ${row("Cooling", (g) => (g.tdp > 1000 ? "liquid" : "air or liquid"), false)}
   ${row("Software", (g) => (g.vendor === "amd" ? "ROCm · HIP · RCCL" : "CUDA · cuBLAS · NCCL"), false, true, lv("amd-gpus"))}
   ${row("Price here ($/hr)", (g) => "$" + f2(g.price), false)}
  </tbody></table></div>`;
  $("#cmpBody").innerHTML =
    `<p class="map-cap">Peak dense figures from vendor data sheets (sparse figures are 2× and rarely reachable). B200 memory is the usable 180 GB of 192. Hourly prices are this game's illustrative numbers, not quotes. Green marks the best in each row; the L-buttons open the level where that row matters.</p>
   ${t}
   <div class="cmpgrid">
    <div><h4>NVIDIA, generation by generation</h4><ul>
     <li><b>H100 → H200:</b> the same Hopper chip with more and faster memory (HBM3e). Wins wherever memory is the limit; no faster for prompt reading.</li>
     <li><b>H200 → B200:</b> new Blackwell architecture: two dies acting as one GPU, ~2.3× FP8 math, new FP4, 8 TB/s, NVLink 5 at twice the speed, and 1,000 W.</li>
     <li><b>B200 → B300:</b> Blackwell Ultra: 288 GB and more FP4 math, same bandwidth, 1,400 W and liquid cooling.</li>
     <li><b>Rack scale:</b> GB200/GB300 NVL72 puts 72 GPUs on one NVLink domain instead of 8.</li></ul></div>
    <div><h4>AMD, generation by generation</h4><ul>
     <li><b>MI300X:</b> CDNA 3, built from 8 compute chiplets. Its 192 GB was the most memory per GPU when it launched, at H100-class compute.</li>
     <li><b>MI325X:</b> the same chip with 256 GB of HBM3e and 6 TB/s: AMD's version of the H100 → H200 step.</li>
     <li><b>MI355X:</b> CDNA 4: ~2× FP8 math, FP4 and FP6, 288 GB at 8 TB/s, 1,400 W and liquid cooling. Its specs sit alongside B300.</li>
     <li><b>Next:</b> the MI400 series (432 GB HBM4) and the 72-GPU Helios rack, AMD's answer to NVL72.</li></ul></div>
    <div><h4>Reading a spec sheet</h4><ul>
     <li>Match the spec to the bottleneck: memory GB for model + users, TB/s for token speed, TFLOPS for long prompts and big batches.</li>
     <li>Check whether TFLOPS are <b>dense or sparse</b>, and which precision.</li>
     <li>Check the <b>GPU-to-GPU link</b> if a model spans GPUs, and the <b>power and cooling</b> your racks can take.</li>
     <li>Software decides how much of the peak you actually get. Benchmark your model, on your inference engine, on both vendors.</li></ul></div>
    <div><h4>Beyond GPUs</h4><ul>
     <li><b>Google TPU</b> (latest: Ironwood, 192 GB HBM per chip): built only for AI, available only in Google Cloud, joined into pods of thousands of chips. Programmed with JAX or PyTorch/XLA.</li>
     <li><b>AWS Trainium</b>: Amazon's own training and inference chips, available only on AWS, programmed with the Neuron SDK.</li>
     <li>These trade portability for price and scale: your code and skills don't move to another cloud as easily.</li></ul></div>
   </div>`;
}
