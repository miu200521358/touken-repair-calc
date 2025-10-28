/**
 * Touken Ranbu repair calculator frontend logic.
 * Handles master data, formulas, and DOM binding for the single page app.
 */

type WeaponKey =
  | "tantou"
  | "wakizashi"
  | "uchigatana"
  | "uchigatana_rare4"
  | "tachi"
  | "ootachi"
  | "yari"
  | "naginata";

type StageKey = "initial" | "awakened";

type PhaseKey = "initial" | "awakened" | "bloom";

type ResourceKind = "charcoal" | "steel" | "coolant" | "whetstone";

interface ResourceSet {
  charcoal: number;
  steel: number;
  coolant: number;
  whetstone: number;
}

interface WeaponDefinition {
  label: string;
  coefficient: number;
}

interface ResourceExpressionSet {
  charcoal: string;
  steel: string;
  coolant: string;
  whetstone: string;
}

// --- Master data ------------------------------------------------------------------------------------
const weaponCatalog: Record<WeaponKey, WeaponDefinition> = {
  tantou: { label: "\u77ed\u5200", coefficient: 1.0 },
  wakizashi: { label: "\u8108\u5dee", coefficient: 1.5 },
  uchigatana: { label: "\u6253\u5200", coefficient: 2.0 },
  uchigatana_rare4: { label: "\u30ec\u30a24\u6253\u5200", coefficient: 4.0 },
  tachi: { label: "\u592a\u5200", coefficient: 4.0 },
  ootachi: { label: "\u5927\u592a\u5200", coefficient: 6.0 },
  yari: { label: "\u69cd", coefficient: 2.5 },
  naginata: { label: "\u85a9\u5200", coefficient: 3.0 },
};

const resourceBaseExpressions: Record<WeaponKey, ResourceExpressionSet> = {
  tantou: {
    charcoal: "\u221a16",
    steel: "\u221a16",
    coolant: "\u221a16",
    whetstone: "\u221a16",
  },
  wakizashi: {
    charcoal: "\u221a11",
    steel: "\u221a16",
    coolant: "\u221a7",
    whetstone: "\u221a11",
  },
  uchigatana: {
    charcoal: "\u221a12.25",
    steel: "\u221a12.25",
    coolant: "\u221a4.34",
    whetstone: "\u221a12.25",
  },
  uchigatana_rare4: {
    charcoal: "\u221a3.06",
    steel: "\u221a9",
    coolant: "\u221a9",
    whetstone: "\u221a1.56",
  },
  tachi: {
    charcoal: "\u221a3.06",
    steel: "\u221a8.75",
    coolant: "\u221a8.75",
    whetstone: "\u221a1.67",
  },
  ootachi: {
    charcoal: "\u221a1.36",
    steel: "\u221a5.44",
    coolant: "\u221a5.44",
    whetstone: "\u221a0.69",
  },
  yari: {
    charcoal: "\u221a31.36",
    steel: "\u221a31.36",
    coolant: "\u221a7.84",
    whetstone: "\u221a31.36",
  },
  naginata: {
    charcoal: "\u221a25",
    steel: "\u221a25",
    coolant: "\u221a6.25",
    whetstone: "\u221a25",
  },
};

const stageLabels: Record<StageKey, string> = {
  initial: "\u521d",
  awakened: "\u6975",
};

const phaseLabels: Record<PhaseKey, string> = {
  initial: "\u521d",
  awakened: "\u6975",
  bloom: "\u6975\u958b\u82b1",
};

const resourceKinds: ResourceKind[] = [
  "charcoal",
  "steel",
  "coolant",
  "whetstone",
];

// Cache the square-root results so we only pay the cost once.
const precomputedResourceBases: Record<WeaponKey, ResourceSet> =
  Object.keys(resourceBaseExpressions).reduce((accumulator, weapon) => {
    const weaponKey = weapon as WeaponKey;
    const expressionSet = resourceBaseExpressions[weaponKey];

    accumulator[weaponKey] = resourceKinds.reduce<ResourceSet>(
      (resourceAcc, resource) => {
        resourceAcc[resource] = parseInnerRoot(expressionSet[resource]);
        return resourceAcc;
      },
      {
        charcoal: 0,
        steel: 0,
        coolant: 0,
        whetstone: 0,
      },
    );

    return accumulator;
  }, {} as Record<WeaponKey, ResourceSet>);

// DOM references are reused frequently; keep them in one place.
const cache = {
  weaponSelect: document.getElementById("weapon") as HTMLSelectElement,
  stageSelect: document.getElementById("stage") as HTMLSelectElement,
  levelInput: document.getElementById("level") as HTMLInputElement,
  levelValue: document.getElementById("levelValue") as HTMLSpanElement,
  injuryInput: document.getElementById("injury") as HTMLInputElement,
  injuryValue: document.getElementById("injuryValue") as HTMLSpanElement,
  phaseDisplay: document.getElementById("phaseDisplay") as HTMLSpanElement,
  timeOutput: document.getElementById("timeOutput") as HTMLSpanElement,
  resourceOutputs: {
    charcoal: document.getElementById("charcoalOutput") as HTMLSpanElement,
    steel: document.getElementById("steelOutput") as HTMLSpanElement,
    coolant: document.getElementById("coolantOutput") as HTMLSpanElement,
    whetstone: document.getElementById("whetstoneOutput") as HTMLSpanElement,
  },
};

document.addEventListener("DOMContentLoaded", () => {
  populateWeaponOptions();
  populateStageOptions();
  bindEventListeners();
  updateOutputs();
});

// Attach input listeners so recalculation happens immediately.
function bindEventListeners(): void {
  const inputs = [
    cache.weaponSelect,
    cache.stageSelect,
    cache.levelInput,
    cache.injuryInput,
  ];

  inputs.forEach((element) => {
    element.addEventListener("input", updateOutputs);
  });
}

// Render the weapon select options from the master catalog.
function populateWeaponOptions(): void {
  cache.weaponSelect.innerHTML = "";

  Object.entries(weaponCatalog).forEach(([value, { label }]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    cache.weaponSelect.append(option);
  });
}

// Stage select is static but we still build it programmatically for clarity.
function populateStageOptions(): void {
  cache.stageSelect.innerHTML = "";

  Object.entries(stageLabels).forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    cache.stageSelect.append(option);
  });
}

// Recalculate when inputs change and write results back to the UI.
function updateOutputs(): void {
  const weapon = cache.weaponSelect.value as WeaponKey;
  const stage = cache.stageSelect.value as StageKey;
  const level = Number.parseInt(cache.levelInput.value, 10) || 1;
  const injury = Number.parseInt(cache.injuryInput.value, 10) || 0;

  cache.levelValue.textContent = level.toString();
  cache.injuryValue.textContent = injury.toString();

  const coefficient = weaponCatalog[weapon].coefficient;
  const phase = determinePhase(level, stage);
  const repairSeconds = calculateRepairSeconds(level, injury, coefficient, phase);
  const resourceCost = calculateResourceCost(weapon, injury, coefficient);

  cache.phaseDisplay.textContent = phaseLabels[phase];
  cache.timeOutput.textContent = formatSeconds(repairSeconds);

  resourceKinds.forEach((kind) => {
    cache.resourceOutputs[kind].textContent = resourceCost[kind].toString();
  });
}

// Interpret a string like "√16" as sqrt(16) and return 4.
function parseInnerRoot(expression: string): number {
  const sanitized = expression.replace("\u221a", "").trim();
  const numericValue = Number.parseFloat(sanitized);

  if (Number.isNaN(numericValue)) {
    throw new Error(`Invalid resource expression: ${expression}`);
  }

  return Math.sqrt(numericValue);
}

// Determine which formula should be used based on level and stage.
function determinePhase(level: number, stage: StageKey): PhaseKey {
  if (level >= 100) {
    return "bloom";
  }

  return stage === "awakened" ? "awakened" : "initial";
}

// Calculate repair time in seconds, guaranteeing the 30-second minimum.
function calculateRepairSeconds(
  level: number,
  lostHp: number,
  coefficient: number,
  phase: PhaseKey,
): number {
  if (lostHp <= 0) {
    return 30;
  }

  if (phase === "bloom") {
    const repaired =
      (629.2407 - 0.264066 * level) * coefficient * lostHp + 30;
    return Math.max(30, Math.round(repaired));
  }

  const aTerm = level <= 11 ? 0 : Math.floor(Math.sqrt(level - 11)) * 10 + 50;
  const repaired = (level * 5 + aTerm) * coefficient * lostHp + 30;
  return Math.max(30, Math.round(repaired));
}

// Compute rounded resource costs for each material.
function calculateResourceCost(
  weapon: WeaponKey,
  lostHp: number,
  coefficient: number,
): ResourceSet {
  if (lostHp <= 0) {
    return {
      charcoal: 0,
      steel: 0,
      coolant: 0,
      whetstone: 0,
    };
  }

  const base = precomputedResourceBases[weapon];

  return resourceKinds.reduce<ResourceSet>((accumulator, kind) => {
    const value = Math.round(base[kind] * coefficient * lostHp);
    accumulator[kind] = Math.max(0, value);
    return accumulator;
  }, {} as ResourceSet);
}

// Format a number of seconds as hh:mm:ss for display.
function formatSeconds(totalSeconds: number): string {
  const clamped = Math.max(30, Math.round(totalSeconds));

  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;

  return [hours, minutes, seconds]
    .map((segment) => segment.toString().padStart(2, "0"))
    .join(":");
}

