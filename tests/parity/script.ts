// The parity script: every step the recorder plays, identically, on the reference and on the new build.
// It only describes screen actions (open a level, type a command, click a quiz option), never game internals,
// so the same script is a fair test of both builds.
import plan from "./plan.json" with { type: "json" };

export type Step =
  | { do: "home" } // go to the home screen and record it
  | { do: "open"; id: string } // open a level or lab from the home screen
  | { do: "cmd"; text: string } // type a command into the terminal and press Enter
  | { do: "pick"; q: number; o: number } // click quiz option o of question q
  | { do: "hints" } // press the hint button until it disappears (reveals every hint and the answer)
  | { do: "closeModal" } // dismiss the win modal with "Keep exploring"
  | { do: "compare" }; // open the Compare GPUs panel, record it, close it

export interface Scene {
  name: string;
  steps: Step[];
}

type PlanLevel = (typeof plan.levels)[number];

// One scene per level: play it to a win first (so stars match the reference), then exercise the rest.
function levelScene(L: PlanLevel): Scene {
  const steps: Step[] = [
    { do: "open", id: L.id },
    { do: "cmd", text: "help" },
  ];
  if (L.quiz) {
    // One wrong pick on question 1 records the "Not quite" path; then every right answer.
    L.questions.forEach((q, i) => {
      if (i === 0) steps.push({ do: "pick", q: 0, o: (q.right + 1) % q.options });
      steps.push({ do: "pick", q: i, o: q.right });
    });
  } else {
    for (const text of L.answer) steps.push({ do: "cmd", text });
  }
  steps.push({ do: "closeModal" });
  for (const text of L.chips) steps.push({ do: "cmd", text });
  if (!L.quiz) steps.push({ do: "hints" });
  return { name: `level ${L.id}`, steps };
}

function labScene(L: (typeof plan.labs)[number]): Scene {
  return {
    name: `lab ${L.id}`,
    steps: [
      { do: "open", id: L.id },
      { do: "cmd", text: "help" },
      ...L.chips.map((text): Step => ({ do: "cmd", text })),
    ],
  };
}

// Commands that only do real work in one world, plus ones that behave differently per world.
// Typed in one level of every world, so each world's "not here" answer is recorded (design Decision 4).
export const SWEEP_COMMANDS = [
  // World 0
  "tokenize Hello world",
  "route Paris",
  "batch 32",
  "heads gqa",
  "qhead 6",
  "config llama-8b",
  "params llama-8b",
  "attend 3",
  "head 2",
  "generate",
  "kv per-token",
  "kv on",
  // World 1
  "foundry gpu h200",
  "foundry dtype fp8",
  "foundry batch 8",
  "foundry context 8192",
  "foundry bench",
  "foundry roofline",
  "foundry workload chat",
  "foundry pick h100",
  "foundry share mig",
  "nvidia-smi mig -lgip",
  "sudo nvidia-smi -i 0 -mig 1",
  "amd-smi",
  "rocm-smi --showtopo",
  // World 2
  "foundry trace",
  "foundry profile",
  "foundry graphs on",
  "foundry fuse on",
  "foundry flash on",
  "foundry mode decode",
  "docker run --gpus all nvcr.io/nvidia/pytorch:25.01-py3",
  "sudo apt install nvidia-driver-580",
  "apt update",
  "foundry driver install 580",
  "python train.py",
  // World 3
  "nvidia-smi topo -m",
  "all_reduce_perf -b 8 -e 8G -f 16 -g 8",
  "foundry server pcie",
  "foundry tp 2",
  // World 4
  "ibstat",
  "ib_write_bw node-2",
  "iperf3 -c node-2",
  "ssh node-2",
  "hostname",
  "exit",
  "ray status",
  "vllm serve meta-llama/Llama-3.1-70B-Instruct",
  "foundry nodes 2",
  "foundry net eth",
  "foundry gdr off",
  "foundry layout 8x2",
  "foundry mode serve",
  // Shared, or different in every world
  "nvidia-smi",
  "foundry load llama-70b",
  "foundry load llama-8b --dtype fp8",
  "foundry prompt 4096",
  "foundry kv fp8",
  "foundry status",
  "foundry inspect sm",
  "foundry inspect embed",
  "foundry inspect nvswitch",
  "foundry inspect nope",
  "foundry nonsense",
  "mpirun -np 2 x",
  "torchrun x",
  "kubectl get pods",
  "sudo",
  "bogus-command",
  "clear",
  "hint",
];

// One ordinary level per world (avoiding levels with long animations or special start-up logic).
const SWEEP_LEVELS = ["tokens", "gpu-anatomy", "launch-overhead", "hgx-board", "fabric"];

// The negative paths and lab sequences that reference/tests/test2.js already exercised.
const LEGACY_PATHS: Scene[] = [
  {
    name: "test2: server lab on AMD",
    steps: [
      { do: "open", id: "server-lab" },
      ...[
        "foundry server mi300x",
        "nvidia-smi",
        "amd-smi",
        "rocm-smi --showtopo",
        "all_reduce_perf -g 8",
        "foundry tp 8",
        "foundry server hgxb200",
        "foundry dtype fp4",
        "foundry status",
      ].map((text): Step => ({ do: "cmd", text })),
    ],
  },
  {
    name: "test2: GPU lab on AMD",
    steps: [
      { do: "open", id: "gpu-lab" },
      ...["foundry gpu mi355x", "foundry dtype fp4", "amd-smi", "foundry inspect cu"].map((text): Step => ({
        do: "cmd",
        text,
      })),
    ],
  },
  {
    name: "test2: cluster lab training",
    steps: [
      { do: "open", id: "cluster-lab" },
      ...["foundry mode train", "foundry nodes 4", "foundry net eth", "foundry status", "foundry layout 8x2"].map(
        (text): Step => ({ do: "cmd", text }),
      ),
    ],
  },
  {
    name: "test2: Ray cluster mistakes",
    steps: [
      { do: "open", id: "multi-node" },
      ...[
        "vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2",
        "ray start --address=node-1:6379",
        "ray start --head",
        "vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2",
        "vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8",
      ].map((text): Step => ({ do: "cmd", text })),
    ],
  },
  {
    name: "test2: MIG mistakes",
    steps: [
      { do: "open", id: "gpu-sharing" },
      ...[
        "nvidia-smi mig -cgi 1g.10gb -C",
        "sudo nvidia-smi -i 0 -mig 1",
        "nvidia-smi mig -lgip",
        "nvidia-smi mig -cgi 3g.40gb,3g.40gb,1g.10gb -C",
        "nvidia-smi mig -cgi 7g.80gb -C",
        "foundry share timeslice",
        // MIG profiles typed by number, not name (9 = 3g.40gb, 19 = 1g.10gb)
        "nvidia-smi mig -cgi 9,9 -C",
        "nvidia-smi mig -lgi",
        "nvidia-smi mig -cgi 19,19,19,19,19,19,19 -C",
        "nvidia-smi mig -lgi",
      ].map((text): Step => ({ do: "cmd", text })),
    ],
  },
];

export const SCRIPT: Scene[] = [
  { name: "home, first visit", steps: [{ do: "home" }, { do: "compare" }] },
  ...plan.levels.map(levelScene),
  ...plan.labs.map(labScene),
  ...SWEEP_LEVELS.map((id): Scene => ({
    name: `sweep in ${id}`,
    steps: [{ do: "open", id }, ...SWEEP_COMMANDS.map((text): Step => ({ do: "cmd", text }))],
  })),
  ...LEGACY_PATHS,
  { name: "home, after playing everything", steps: [{ do: "home" }] },
];
