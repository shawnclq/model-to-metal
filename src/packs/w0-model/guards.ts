// What other worlds say when one of World 0's commands is typed there (see src/core/manifest.ts).
import { host } from "../../shared/host.ts";
import type { WorldInfo } from "../../core/manifest.ts";

export const GUARDS: WorldInfo["guards"] = {
  commands: {
    tokenize: () => host.err("The tokenizer is in World 0, 'Words into tokens'."),
  },
};
