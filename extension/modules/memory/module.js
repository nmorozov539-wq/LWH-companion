// extension/modules/memory/module.js

export const manifest = {
  id: "memory",
  name: "Memory",
  version: "1.0.0",
  description: "Flat key-value fact store for persistent world and character knowledge. " +
    "Facts are injected into every prompt so the AI never forgets established details.",
  // COMPATIBILITY: incompatible with external summarizer extensions (Summaryscription etc).
  // Running both creates divergent memory channels that contradict each other over time.
  // Users must choose: LWH memory+arc OR an external summarizer, not both.
  incompatibleWith: ["external_summarizer"],
  reads: [],
};
