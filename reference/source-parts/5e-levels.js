<script>
"use strict";
const MOE_LV={world:0,title:"A team of experts",concept:"Mixture of experts (MoE)",layers:{on:[6],near:[9]},panels:["moe"],controls:["moebatch"],
  brief:`<p>In the last level, every token went through every layer's whole <b>MLP block</b>. That's a <b>dense</b> model.</p><p>A <b>mixture-of-experts</b> model replaces each MLP block with many smaller MLPs, called <b>experts</b>, plus a small <b>router</b>. For each token, the router scores every expert and sends the token to only the top few. Qwen3 235B-A22B has <b>128 experts per layer and uses 8</b> for each token.</p><p>Tap a few different tokens and watch which experts light up. Then raise the number of tokens processed at once to 32 and see how many experts get used.</p>`,
  setup(S){S.moe={tok:-1,batch:1,seen:[]}},
  goals:[{t:"Route a token through the router",ok:S=>S.moe.seen.length>=1},{t:"Compare a second, different token",ok:S=>S.moe.seen.length>=2},{t:"Process 32 or more tokens at once",ok:S=>S.moe.batch>=32}],
  hints:["Tap any token chip, or type route Paris.","Tap another token, then use the Tokens at once buttons (or batch 32)."],
  answer:()=>"route Paris && route gracias && batch 32",chips:["route Paris","route def","route gracias","batch 32","batch 1"],
  debrief:`<p>Each token used only 8 of 128 experts, so it did about <b>22 B parameters' worth of work</b> in a 235 B model. That's the MoE deal: the knowledge of a huge model at the speed of a much smaller one.</p><ul><li><b>Memory still holds everything.</b> Any token might pick any expert, so all 235 B parameters must sit in GPU memory.</li><li><b>Many users wake up most experts.</b> With 32 tokens in one step, around 87% of the experts were picked by someone, so the GPU has to read most of the weights again. That's what you'll see in World 1, Level 8.</li><li>Each layer has its own router and its own experts; this shows one layer of 94. Real routing is learned in training; the picks here are illustrative.</li><li>Many MoE models also have a <b>shared expert</b> that every token uses, for knowledge everything needs.</li></ul>`,
  links:{up:"Most frontier models (DeepSeek, Qwen, Llama 4, gpt-oss, Kimi) are MoE, so model choice now means choosing total vs active size.",down:"Big MoE models spread experts across many GPUs (expert parallelism), which needs fast GPU-to-GPU links (World 3)."}};
const HEADS_LV={world:0,title:"Many heads, shared notes",concept:"Attention heads & KV heads",layers:{on:[6],near:[5,9]},panels:["heads"],controls:["hdesign"],
  brief:`<p>A token's vector in Llama 3.1 8B has 4,096 numbers. Attention splits it into <b>32 heads of 128 numbers</b>. Each head runs its own small attention, so each can learn a different question: one follows the previous word, another links "it" to "cat".</p><p>Every query head needs <b>keys and values</b> to search, and those keys and values are what the KV cache stores. Llama 3.1 lets <b>groups of 4 query heads share one key/value head</b> (grouped-query attention), so it stores 8 KV heads, not 32.</p><p>Tap a query head to see which KV head it shares. Then switch between the three designs and watch what happens to memory.</p>`,
  setup(S){S.hd={design:"gqa",q:-1}},
  goals:[{t:"Tap a query head to see its shared KV head",ok:S=>!!S.flags.qhead},{t:"Try multi-head attention (32 KV heads)",ok:S=>!!S.flags.mha},{t:"Try multi-query attention (1 KV head)",ok:S=>!!S.flags.mqa}],
  hints:["Tap any small box in the query heads row, or type qhead 5.","Use the Design buttons, or type heads mha and heads mqa."],
  answer:()=>"qhead 5 && heads mha && heads mqa && heads gqa",chips:["qhead 5","heads mha","heads gqa","heads mqa"],
  debrief:`<p>Query heads cost nothing to store: a query is used once, when its token is processed. Keys and values must be kept, because every later token searches them. So the number of <b>KV heads</b> sets the KV cache size.</p><ul><li><b>Multi-head (32 KV heads):</b> most flexible, biggest cache. About 0.5 MB per token for an 8B-sized model.</li><li><b>Grouped-query (8):</b> 4× smaller cache, little quality loss. Llama 3, Qwen and most current models use it.</li><li><b>Multi-query (1):</b> 32× smaller, but every head searches the same notes, which can cost quality.</li><li>So the KV formula uses KV heads: 2 × layers × <b>KV heads</b> × head size × bytes.</li></ul>`,
  links:{up:"Fewer KV heads means more users or longer conversations per GPU: a cost lever chosen when the model is designed.",down:"World 1, Levels 3 and 7: the KV cache decides how many users fit."}};
const W0Q_MORE=[
 {q:"A mixture-of-experts model has 235 B total and 22 B active parameters. What does 'active' mean?",o:["The parameters loaded into memory","The parameters each token actually uses, through the experts the router picks","The parameters that were trained recently","The parameters in the attention blocks"],a:1,why:"All 235 B sit in memory, but each token goes through only the chosen experts, about 22 B parameters' worth of work."},
 {q:"Why does Llama 3.1 8B store 8 key/value heads per layer instead of 32?",o:["It only has 8 attention heads","Groups of 4 query heads share one key/value head, making the KV cache 4× smaller","Keys and values are compressed to 8 bits","Only 8 layers keep a cache"],a:1,why:"Grouped-query attention keeps 32 query heads (32 different questions) but stores only 8 sets of keys and values."}
];
(function(){
  const p=LEVELS.findIndex(l=>l.title==="What's in 8 billion parameters");LEVELS.splice(p+1,0,MOE_LV);
  const a=LEVELS.findIndex(l=>l.title==="Who is \"it\"?");LEVELS.splice(a+1,0,HEADS_LV);
  LEVELS.find(l=>l.title==="Checkpoint: inside the model").questions.push(...W0Q_MORE);
  LEVELS.forEach((l,i)=>{l.id=i+1});const cnt={};LEVELS.forEach(l=>{cnt[l.world]=(cnt[l.world]||0)+1;l.n=cnt[l.world]});
  const att=LEVELS.find(l=>l.title==="Who is \"it\"?");att.debrief=att.debrief.replace("makes the KV cache 4× smaller.</li>","makes the KV cache 4× smaller. The next level shows how.</li>").replace("that's the <b>KV cache</b> (Level 5)","that's the <b>KV cache</b> (Level 7)");
  const kv=LEVELS.find(l=>l.title==="Notes to self");
  const ex=LEVELS.find(l=>l.title==="Many experts");ex.brief=ex.brief.replace("<p>Find a GPU and model that hit the target.","<p>(World 0, Level 3 shows how the router picks experts.) Find a GPU and model that hit the target.");
  void kv;
})();
</script>
