// extension/modules/templates.js
//
// Provides scenario templates that define default module state payloads.

const RAW_TEMPLATES = [
  {
    id: "classic",
    name: "Classic Adventurer",
    description: "Gold pouch, travel rations, and combat readiness baseline.",
    payload: {
      resources: {
        gold: 42,
        rations: 5,
      },
      combat: {
        inProgress: false,
      },
      weather: {
        condition: "overcast",
        temperature: "cold",
      },
    },
  },
  {
    id: "urban",
    name: "Urban Investigator",
    description: "City-based campaign: coin stash, informants, light combat kit.",
    payload: {
      resources: {
        gold: 18,
        rations: 2,
        contacts: 3,
      },
      combat: {
        inProgress: false,
        equipped: "pistol",
      },
      weather: {
        condition: "drizzle",
        temperature: "cool",
      },
    },
  },
  {
    id: "survival",
    name: "Wilderness Survival",
    description: "Harsh environment emphasis on supplies and status effects.",
    payload: {
      resources: {
        gold: 5,
        rations: 12,
        water: 8,
      },
      combat: {
        inProgress: false,
        injuries: [],
      },
      weather: {
        condition: "blizzard",
        temperature: "freezing",
      },
      status: {
        fatigue: 2,
        morale: 6,
      },
    },
  },
];

function clonePayload(payload) {
  if (typeof structuredClone === "function") {
    return structuredClone(payload);
  }
  return JSON.parse(JSON.stringify(payload));
}

export function loadTemplates() {
  return RAW_TEMPLATES.map((tpl) => ({
    ...tpl,
    payload: clonePayload(tpl.payload),
  }));
}

export function findTemplateById(id) {
  const tpl = RAW_TEMPLATES.find((t) => t.id === id);
  if (!tpl) return null;
  return {
    ...tpl,
    payload: clonePayload(tpl.payload),
  };
}
