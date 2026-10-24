// What other worlds say when one of World 2's commands is typed there (see src/core/manifest.ts).
import { host } from "../../shared/host.ts";
import type { WorldInfo } from "../../core/manifest.ts";

const notHere = () =>
  host.err("docker: not needed here. This bench already has the model loaded. Containers are in World 2.");
const drivers = () => host.err("Drivers are a World 2 topic. This bench's driver is already fine.");
const apt = (t: string[]) => {
  const pk = t.find((x) => /nvidia-driver-\d+/.test(x));
  if (t[1] === "install" && pk) drivers();
  else host.err("apt: try sudo apt install nvidia-driver-580");
};
const python = () => host.err("python: not needed. foundry commands drive the bench.");

export const GUARDS: WorldInfo["guards"] = {
  commands: { docker: notHere, apt, "apt-get": apt, python, python3: python },
  foundry: {
    trace: () => void host.needWorld(2),
    graphs: () => void host.needWorld(2),
    "cuda-graphs": () => void host.needWorld(2),
    fuse: () => void host.needWorld(2),
    fusion: () => void host.needWorld(2),
    flash: () => void host.needWorld(2),
    flashattention: () => void host.needWorld(2),
    mode: () => void host.needWorld(2),
    profile: () => void host.needWorld(2),
    driver: (t) => (t[1] === "install" ? drivers() : host.err("foundry driver install VERSION")),
  },
};
