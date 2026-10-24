import type { W0State } from "../../core/types.ts";
import type { Level, LevelDef, Question } from "../../core/types.ts";
import { GEN_OUT } from "./engine.ts";
// World 0 · Inside the model: its eight levels, in order.
const W0L = [
  {
    id: "tokens",
    world: 0,
    title: "Words into tokens",
    concept: "Tokens",
    layers: { on: [6], near: [1, 3] },
    panels: ["tok"],
    controls: [],
    brief: `<p>Models don't read letters or words. They read <b>tokens</b>: chunks of text from a fixed vocabulary. Llama 3's vocabulary has <b>128,256</b> of them. Common words are usually one token; rare words, names and long numbers break into pieces.</p><p>Everything in this game is counted in tokens: context length, speed (tokens per second) and price (dollars per million tokens).</p><p>Type your own text in the box, or use <code>tokenize …</code> in the terminal. Find a word that splits into several tokens, and try a number or another language.</p>`,
    setup(S) {},
    goals: [
      { t: "Tokenize your own text", ok: (S) => !!S.flags.owntext },
      { t: "Find a word that splits into 2 or more tokens", ok: (S) => !!S.flags.split },
      { t: "Try a number or non-English text", ok: (S) => !!S.flags.numintl },
    ],
    hints: [
      "Click in the text box and type anything, or run tokenize followed by your text.",
      "Long or unusual words split (try 'Tokenization' or 'Singaporean'). Numbers split every 3 digits (try 1234567).",
    ],
    answer: () => "tokenize Tokenization of 1234567 Singaporean dollars",
    chips: [
      "tokenize Hello world",
      "tokenize Tokenization of 1234567 Singaporean dollars",
      "tokenize Selamat pagi, apa khabar?",
    ],
    debrief: `<p>Tokens are the model's alphabet. Roughly:</p><ul><li><b>1 token ≈ ¾ of an English word</b>, so 1,000 tokens ≈ 750 words ≈ 1.5 pages.</li><li>Other languages, code and numbers often take <b>more tokens per word</b>, so they cost more and fill the context faster.</li><li>Llama 3 splits numbers into chunks of up to 3 digits, one reason models can be shaky at arithmetic.</li><li>This page uses an approximation of Llama 3's rules; real tokenizers (like OpenAI's tiktoken or Hugging Face's) split slightly differently.</li></ul><p>Each token is then looked up in the model's <b>embedding table</b> and becomes a list of numbers. That's next.</p>`,
    links: {
      up: "Context windows, rate limits and API bills (layers 1–3) are all counted in tokens.",
      down: "Every token becomes a vector of numbers that flows through the model's layers.",
    },
  },

  {
    id: "parameters",
    world: 0,
    title: "What's in 8 billion parameters",
    concept: "Weights & layers",
    layers: { on: [6], near: [7, 9] },
    panels: ["anatomy"],
    controls: ["model0"],
    brief: `<p>A <b>parameter</b> (or <b>weight</b>) is one number the model learned in training. Llama 3.1 8B has 8.03 billion of them, arranged in big grids called <b>matrices</b>.</p><p>The model is a stack. An <b>embedding table</b> turns each token into a list of 4,096 numbers. Then <b>32 identical layers</b> each refine that list with two blocks: <b>attention</b> (tokens look at each other) and a <b>feed-forward (MLP)</b> block (each token is processed on its own). Finally an <b>output head</b> scores every token in the vocabulary to pick the next one.</p><p>Tap the blocks to see their sizes. Then switch to 70B: same design, wider and deeper.</p>`,
    setup(S) {
      S.model = "llama-8b";
    },
    goals: [
      { t: "Inspect an attention block", ok: (S) => S.inspected.includes("attn") },
      { t: "Inspect a feed-forward (MLP) block", ok: (S) => S.inspected.includes("mlp") },
      { t: "Look inside Llama 3.1 70B", ok: (S) => !!S.flags.saw70 },
    ],
    hints: [
      "Tap 'Attention' and 'MLP' in any layer of the stack, or type foundry inspect attn.",
      "Use the Model buttons, or type params llama-70b.",
    ],
    answer: () => "foundry inspect attn && foundry inspect mlp && params llama-70b",
    chips: ["config llama-8b", "foundry inspect attn", "foundry inspect mlp", "params llama-70b"],
    debrief: `<p>Parameter count comes from just a few numbers in the model's config: hidden size (width), number of layers (depth), vocabulary, and the MLP's inner size.</p><ul><li>Most parameters sit in the <b>MLP blocks</b> (about 70% in 8B, 80% in 70B): that's where much of the model's knowledge is stored.</li><li>Weights are fixed after training. Every user shares one copy, and every run of the model uses all of them, which is why the GPU must read the whole model for each token.</li><li>Size in memory = parameters × bytes per parameter: 8.03 B × 2 bytes (BF16) ≈ 16 GB. That's {{lvl:memory-fit}}.</li></ul>`,
    links: {
      up: "Model choice (layer 6) fixes these numbers; optimisation (layer 7) changes the bytes per parameter.",
      down: "These matrices are what the GPU streams from memory to its SMs for every token.",
    },
  },

  {
    id: "attention",
    world: 0,
    title: 'Who is "it"?',
    concept: "Attention: queries, keys, values",
    layers: { on: [6], near: [8] },
    panels: ["attn"],
    controls: ["head"],
    brief: `<p>Attention is how a token gathers context from the tokens before it. Each token makes three vectors:</p><ul><li><b>Query</b>: what am I looking for?</li><li><b>Key</b>: what do I contain?</li><li><b>Value</b>: what do I pass on if I'm chosen?</li></ul><p>A token compares its query with every earlier token's key. Good matches get more weight, and the token takes a weighted mix of their values.</p><p>Click <b>"it"</b> in the sentence: which word does it look at? Then switch to head 2: each layer has many heads, each looking for something different. Finally click the first word.</p>`,
    setup(S) {
      S.att = { i: -1, head: 1 };
    },
    goals: [
      { t: 'See what "it" attends to (head 1)', ok: (S) => !!S.flags.attIt },
      { t: "Switch to head 2", ok: (S) => !!S.flags.head2 },
      { t: 'Click the first word, "The"', ok: (S) => !!S.flags.attFirst },
    ],
    hints: [
      "Click the word 'it' in the sentence, or type attend it.",
      "Use the Head buttons (or head 2), then click 'The' (attend The).",
    ],
    answer: () => "attend it && head 2 && attend The",
    chips: ["attend it", "attend tired", "head 2", "attend The"],
    debrief: `<p>Head 1 linked "it" back to "cat"; head 2 just looked at the previous word. Real models have dozens of heads per layer, each learning its own pattern. The patterns here are illustrative, but these two kinds really occur.</p><ul><li><b>Attention only looks backwards.</b> "The" could only see itself. That's why models write left to right, one token at a time.</li><li>An earlier token's <b>keys and values never change</b> when later tokens arrive. So they can be computed once and saved: that's the <b>KV cache</b> ({{lvl:kv-cache-basics}}).</li><li>Llama 3.1 8B has 32 query heads but only <b>8 key/value heads</b> per layer. Sharing keys and values between heads (<i>grouped-query attention</i>) makes the KV cache 4× smaller. {{lvl:attention-heads}} shows how.</li></ul>`,
    links: {
      up: "Long context means attending over many more tokens, which means more keys and values to store and read.",
      down: "Attention kernels like FlashAttention (World 2) compute this efficiently on the GPU.",
    },
  },

  {
    id: "generation",
    world: 0,
    title: "One word at a time",
    concept: "Generating text: prefill & decode",
    layers: { on: [6], near: [5] },
    panels: ["gen"],
    controls: ["gen"],
    brief: `<p>A language model only ever does one thing: given the text so far, <b>score every possible next token</b>. To write an answer, you run the whole model, pick a token, append it, and run again.</p><p>The first run reads your whole prompt at once (<b>prefill</b>). Every run after that adds one token (<b>decode</b>). Each run uses every weight in the model.</p><p>Step through the answer to <i>"The capital of France is"</i>. Watch the counters, and tap a run to see the model's top choices.</p>`,
    setup(S) {
      S.gen = { k: 0, cache: true, sel: null };
    },
    goals: [
      { t: "Run the first step (prefill)", ok: (S) => S.gen.k >= 1 },
      { t: "Look at a run's top choices (tap a row)", ok: (S) => !!S.flags.genSel },
      { t: "Generate the full answer, until the model stops", ok: (S) => S.gen.k >= GEN_OUT.length },
    ],
    hints: [
      "Press 'Next step' or type generate step.",
      "Tap any row in the runs table. Keep stepping until the model outputs its end-of-turn token.",
    ],
    answer: () => "generate step && generate inspect 1 && generate all",
    chips: ["generate step", "generate all", "generate inspect 3", "generate reset"],
    debrief: `<p>The answer took <b>8 full runs</b> of the model: 1 prefill plus 7 decodes. Each run read all 16 GB of weights to produce a single token, which is why decode speed depends on memory bandwidth ({{lvl:memory-bandwidth}}).</p><ul><li>The model stops by predicting a special <b>end-of-turn token</b>, or when it hits a maximum length you set.</li><li>Here we always took the top choice (<i>greedy</i>). Real chat apps usually <b>sample</b> with a temperature, so answers vary between runs.</li><li>Prompt length drives the first run (time to first token); answer length drives how many decode runs follow.</li></ul>`,
    links: {
      up: "Output tokens are usually priced higher than input tokens: each one costs a full run of the model.",
      down: "{{lvl:memory-bandwidth}} to {{lvl:prefill-decode}} show how GPU bandwidth and compute set the speed of each run.",
    },
  },

  {
    id: "kv-cache-basics",
    world: 0,
    title: "Notes to self",
    concept: "The KV cache",
    layers: { on: [6], near: [5, 9] },
    panels: ["gen", "kv"],
    controls: ["gen", "cache"],
    brief: `<p>Attention needs the keys and values of every earlier token. Without saving them, each new token would have to <b>recompute them for the whole conversation so far</b>.</p><p>The <b>KV cache</b> stores each token's keys and values, in every layer, the first time they're computed. It trades <b>memory</b> for <b>compute</b>.</p><p>Generate the answer with the cache <b>off</b>, then <b>on</b>, and compare the work. Then use the calculator to see how much memory the cache needs per token for Llama 3.1 70B.</p><div class="mathbox">KV per token = 2 (key + value) × layers × KV heads × head size × bytes
Llama 3.1 8B = 2 × 32 × 8 × 128 × 2 = 131,072 bytes ≈ 0.13 MB</div>`,
    setup(S) {
      S.gen = { k: 0, cache: false, sel: null };
    },
    goals: [
      { t: "Generate the full answer with the cache off", ok: (S) => !!S.flags.genOff },
      { t: "Generate the full answer with the cache on", ok: (S) => !!S.flags.genOn },
      { t: "Work out KV per token for Llama 3.1 70B", ok: (S) => !!S.flags.kv70 },
    ],
    hints: [
      "Press 'Run all' with the cache off. Then switch the cache on and press 'Run all' again (it resets automatically).",
      "Pick 70B in the calculator's Model buttons, or type kv per-token llama-70b.",
    ],
    answer: () => "kv off && generate all && kv on && generate all && kv per-token llama-70b",
    chips: ["kv off", "kv on", "generate all", "kv per-token llama-70b", "generate reset"],
    debrief: `<p>Without the cache, the model processed 68 tokens to write 8; with it, 12. For real conversations the gap is enormous: a 1,000-token answer to a 1,000-token prompt is about 1.5 million token-passes without a cache and 2,000 with one.</p><ul><li>The price is memory: every token keeps its keys and values in every layer. For Llama 3.1 70B that's ~0.33 MB per token, ~43 GB for a single 128k-token conversation.</li><li>Now the GPU picture makes sense: <b>weights</b> are fixed and shared (blue in World 1's memory bar); the <b>KV cache</b> grows with every token of every user (yellow).</li><li>Fewer KV heads (grouped-query attention) and FP8 KV storage both shrink it.</li></ul>`,
    links: {
      up: "Serving engines manage the KV cache (paging, reuse across requests, eviction): layer 5.",
      down: "{{lvl:kv-cache-memory}} and {{lvl:kv-quantisation}}: the KV cache decides how many users fit on a GPU.",
    },
  },

  {
    id: "quiz-inside-model",
    world: 0,
    title: "Checkpoint: inside the model",
    concept: "World 0 quiz",
    quiz: true,
    layers: { on: [6], near: [5] },
    questions: [
      {
        q: "Roughly how many English words fit in 1,000 tokens?",
        o: ["About 250", "About 750", "About 1,000", "About 4,000"],
        a: 1,
        why: "A token averages about ¾ of an English word. Other languages and code usually need more tokens per word.",
      },
      {
        q: "What is a model's parameter count?",
        o: [
          "The number of tokens it was trained on",
          "The number of learned numbers in its weight matrices",
          "Its context length",
          "The number of GPUs it needs",
        ],
        a: 1,
        why: "8B parameters means 8 billion learned numbers. Size in memory = parameters × bytes per parameter.",
      },
      {
        q: "In attention, what does a token compare its query against?",
        o: [
          "The values of later tokens",
          "The keys of earlier tokens (and itself)",
          "The whole vocabulary",
          "The model's weights only",
        ],
        a: 1,
        why: "Queries match against keys of earlier tokens; the best matches decide whose values get mixed in. Attention never looks ahead.",
      },
      {
        q: "Why does writing a 500-token answer take about 500 runs of the model?",
        o: [
          "The GPU is slow",
          "Each token depends on the ones before it, so they're produced one per run",
          "It reads the prompt 500 times",
          "Tokens are written in parallel but checked one by one",
        ],
        a: 1,
        why: "The model predicts one next token per run, then appends it and runs again. The prompt, by contrast, is read in one run.",
      },
      {
        q: "What does the KV cache store, and what does it cost?",
        o: [
          "The model's weights; it costs compute",
          "Each earlier token's keys and values; it costs memory that grows with every token",
          "The user's prompt as text; it costs disk space",
          "The top-3 choices for each token; it costs bandwidth",
        ],
        a: 1,
        why: "Saving keys and values avoids recomputing earlier tokens, at the price of memory per token, per layer, per user.",
      },
    ],
    debrief: `<p>You now have the model's side of the picture: tokens in, weights shared by everyone, attention looking back, one run per output token, and a KV cache that grows with every token. World 1 puts all of that on a GPU.</p>`,
    links: {
      up: "The serving layer (5) is built around these mechanics.",
      down: "World 1: what the GPU has to do to run them.",
    },
  },
] satisfies LevelDef<W0State>[] as LevelDef<W0State>[] as Level<W0State>[];
const MOE_LV = {
  id: "moe-experts",
  world: 0,
  title: "A team of experts",
  concept: "Mixture of experts (MoE)",
  layers: { on: [6], near: [9] },
  panels: ["moe"],
  controls: ["moebatch"],
  brief: `<p>In {{lvl:parameters}}, every token went through every layer's whole <b>MLP block</b>. That's a <b>dense</b> model.</p><p>A <b>mixture-of-experts</b> model replaces each MLP block with many smaller MLPs, called <b>experts</b>, plus a small <b>router</b>. For each token, the router scores every expert and sends the token to only the top few. Qwen3 235B-A22B has <b>128 experts per layer and uses 8</b> for each token.</p><p>Tap a few different tokens and watch which experts light up. Then raise the number of tokens processed at once to 32 and see how many experts get used.</p>`,
  setup(S) {
    S.moe = { tok: -1, batch: 1, seen: [] };
  },
  goals: [
    { t: "Route a token through the router", ok: (S) => S.moe.seen.length >= 1 },
    { t: "Compare a second, different token", ok: (S) => S.moe.seen.length >= 2 },
    { t: "Process 32 or more tokens at once", ok: (S) => S.moe.batch >= 32 },
  ],
  hints: [
    "Tap any token chip, or type route Paris.",
    "Tap another token, then use the Tokens at once buttons (or batch 32).",
  ],
  answer: () => "route Paris && route gracias && batch 32",
  chips: ["route Paris", "route def", "route gracias", "batch 32", "batch 1"],
  debrief: `<p>Each token used only 8 of 128 experts, so it did about <b>22 B parameters' worth of work</b> in a 235 B model. That's the MoE deal: the knowledge of a huge model at the speed of a much smaller one.</p><ul><li><b>Memory still holds everything.</b> Any token might pick any expert, so all 235 B parameters must sit in GPU memory.</li><li><b>Many users wake up most experts.</b> With 32 tokens in one step, around 87% of the experts were picked by someone, so the GPU has to read most of the weights again. That's what you'll see in {{lvl:moe-on-gpu}}.</li><li>Each layer has its own router and its own experts; this shows one layer of 94. Real routing is learned in training; the picks here are illustrative.</li><li>Many MoE models also have a <b>shared expert</b> that every token uses, for knowledge everything needs.</li></ul>`,
  links: {
    up: "Most frontier models (DeepSeek, Qwen, Llama 4, gpt-oss, Kimi) are MoE, so model choice now means choosing total vs active size.",
    down: "Big MoE models spread experts across many GPUs (expert parallelism), which needs fast GPU-to-GPU links (World 3).",
  },
} satisfies LevelDef<W0State> as LevelDef<W0State> as Level<W0State>;
const HEADS_LV = {
  id: "attention-heads",
  world: 0,
  title: "Many heads, shared notes",
  concept: "Attention heads & KV heads",
  layers: { on: [6], near: [5, 9] },
  panels: ["heads"],
  controls: ["hdesign"],
  brief: `<p>A token's vector in Llama 3.1 8B has 4,096 numbers. Attention splits it into <b>32 heads of 128 numbers</b>. Each head runs its own small attention, so each can learn a different question: one follows the previous word, another links "it" to "cat".</p><p>Every query head needs <b>keys and values</b> to search, and those keys and values are what the KV cache stores. Llama 3.1 lets <b>groups of 4 query heads share one key/value head</b> (grouped-query attention), so it stores 8 KV heads, not 32.</p><p>Tap a query head to see which KV head it shares. Then switch between the three designs and watch what happens to memory.</p>`,
  setup(S) {
    S.hd = { design: "gqa", q: -1 };
  },
  goals: [
    { t: "Tap a query head to see its shared KV head", ok: (S) => !!S.flags.qhead },
    { t: "Try multi-head attention (32 KV heads)", ok: (S) => !!S.flags.mha },
    { t: "Try multi-query attention (1 KV head)", ok: (S) => !!S.flags.mqa },
  ],
  hints: [
    "Tap any small box in the query heads row, or type qhead 5.",
    "Use the Design buttons, or type heads mha and heads mqa.",
  ],
  answer: () => "qhead 5 && heads mha && heads mqa && heads gqa",
  chips: ["qhead 5", "heads mha", "heads gqa", "heads mqa"],
  debrief: `<p>Query heads cost nothing to store: a query is used once, when its token is processed. Keys and values must be kept, because every later token searches them. So the number of <b>KV heads</b> sets the KV cache size.</p><ul><li><b>Multi-head (32 KV heads):</b> most flexible, biggest cache. About 0.5 MB per token for an 8B-sized model.</li><li><b>Grouped-query (8):</b> 4× smaller cache, little quality loss. Llama 3, Qwen and most current models use it.</li><li><b>Multi-query (1):</b> 32× smaller, but every head searches the same notes, which can cost quality.</li><li>So the KV formula uses KV heads: 2 × layers × <b>KV heads</b> × head size × bytes.</li></ul>`,
  links: {
    up: "Fewer KV heads means more users or longer conversations per GPU: a cost lever chosen when the model is designed.",
    down: "{{lvl:kv-cache-memory}} and {{lvl:kv-quantisation}}: the KV cache decides how many users fit.",
  },
} satisfies LevelDef<W0State> as LevelDef<W0State> as Level<W0State>;
const W0Q_MORE = [
  {
    q: "A mixture-of-experts model has 235 B total and 22 B active parameters. What does 'active' mean?",
    o: [
      "The parameters loaded into memory",
      "The parameters each token actually uses, through the experts the router picks",
      "The parameters that were trained recently",
      "The parameters in the attention blocks",
    ],
    a: 1,
    why: "All 235 B sit in memory, but each token goes through only the chosen experts, about 22 B parameters' worth of work.",
  },
  {
    q: "Why does Llama 3.1 8B store 8 key/value heads per layer instead of 32?",
    o: [
      "It only has 8 attention heads",
      "Groups of 4 query heads share one key/value head, making the KV cache 4× smaller",
      "Keys and values are compressed to 8 bits",
      "Only 8 layers keep a cache",
    ],
    a: 1,
    why: "Grouped-query attention keeps 32 query heads (32 different questions) but stores only 8 sets of keys and values.",
  },
] satisfies Question[];
// The final order. The checkpoint quiz also asks about MoE and heads.
const [tokens, parameters, attention, generation, kvCache, quiz] = W0L;
quiz.questions!.push(...W0Q_MORE);
export const LEVELS: Level<W0State>[] = [tokens, parameters, MOE_LV, attention, HEADS_LV, generation, kvCache, quiz];
