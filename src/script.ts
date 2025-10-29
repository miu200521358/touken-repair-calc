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
  | "naginata"
  | "tsurugi";

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
  tantou: { label: "短刀", coefficient: 1.0 },
  wakizashi: { label: "脇差", coefficient: 1.5 },
  uchigatana: { label: "打刀", coefficient: 2.0 },
  uchigatana_rare4: { label: "打刀(レア3)", coefficient: 4.0 },
  tachi: { label: "太刀", coefficient: 4.0 },
  ootachi: { label: "大太刀", coefficient: 6.0 },
  yari: { label: "槍", coefficient: 2.5 },
  naginata: { label: "薙刀", coefficient: 3.0 },
  tsurugi: { label: "剣", coefficient: 3.5 },
};

const resourceBaseExpressions: Record<WeaponKey, ResourceExpressionSet> = {
  tantou: {
    charcoal: "√16",
    steel: "√16",
    coolant: "√16",
    whetstone: "√16",
  },
  wakizashi: {
    charcoal: "√11",
    steel: "√16",
    coolant: "√7",
    whetstone: "√11",
  },
  uchigatana: {
    charcoal: "√12.25",
    steel: "√12.25",
    coolant: "√4.34",
    whetstone: "√12.25",
  },
  uchigatana_rare4: {
    charcoal: "√3.06",
    steel: "√9",
    coolant: "√9",
    whetstone: "√1.56",
  },
  tachi: {
    charcoal: "√3.06",
    steel: "√8.75",
    coolant: "√8.75",
    whetstone: "√1.67",
  },
  ootachi: {
    charcoal: "√1.36",
    steel: "√5.44",
    coolant: "√5.44",
    whetstone: "√0.69",
  },
  yari: {
    charcoal: "√31.36",
    steel: "√31.36",
    coolant: "√7.84",
    whetstone: "√31.36",
  },
  naginata: {
    charcoal: "√25",
    steel: "√25",
    coolant: "√6.25",
    whetstone: "√25",
  },
  tsurugi: {
    charcoal: "√9",
    steel: "√9",
    coolant: "√9",
    whetstone: "√9",
  },
};

const stageLabels: Record<StageKey, string> = {
  initial: "初",
  awakened: "極",
};

const stageMaxLevels: Record<StageKey, number> = {
  initial: 99,
  awakened: 199,
};

const INJURY_MAX = 150;

const stageWeaponMap: Record<StageKey, WeaponKey[]> = {
  initial: [
    "tantou",
    "wakizashi",
    "uchigatana",
    "uchigatana_rare4",
    "tachi",
    "ootachi",
    "yari",
    "naginata",
    "tsurugi",
  ],
  awakened: [
    "tantou",
    "wakizashi",
    "uchigatana",
    "uchigatana_rare4",
    "tachi",
    "ootachi",
    "yari",
    "naginata",
  ],
};

const phaseLabels: Record<PhaseKey, string> = {
  initial: "初",
  awakened: "極",
  bloom: "極開花",
};

const resourceKinds: ResourceKind[] = [
  "charcoal",
  "steel",
  "coolant",
  "whetstone",
];

// Cache square roots up front to keep recalculation lean.
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
  injuryInput: document.getElementById("injury") as HTMLInputElement,
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
  populateStageOptions();
  const initialStage = (cache.stageSelect.value as StageKey) || "initial";
  populateWeaponOptions(initialStage);
  bindEventListeners();
  updateOutputs();
});

// Attach input listeners so recalculation happens immediately.
function bindEventListeners(): void {
  cache.stageSelect.addEventListener("change", handleStageChange);

  const inputs: Array<HTMLInputElement | HTMLSelectElement> = [
    cache.weaponSelect,
    cache.levelInput,
    cache.injuryInput,
  ];

  inputs.forEach((element) => {
    element.addEventListener("input", updateOutputs);
  });

  cache.weaponSelect.addEventListener("change", updateOutputs);
  enableWheelAdjustment(cache.levelInput);
  enableWheelAdjustment(cache.injuryInput);
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

// Render weapon options based on the currently selected stage.
function populateWeaponOptions(stage: StageKey): void {
  const allowed =
    stageWeaponMap[stage] ?? (Object.keys(weaponCatalog) as WeaponKey[]);
  const previousSelection = cache.weaponSelect.value as WeaponKey | "";

  cache.weaponSelect.innerHTML = "";

  allowed.forEach((weapon) => {
    const option = document.createElement("option");
    option.value = weapon;
    option.textContent = weaponCatalog[weapon].label;
    cache.weaponSelect.append(option);
  });

  if (allowed.includes(previousSelection as WeaponKey)) {
    cache.weaponSelect.value = previousSelection;
  }

  if (!allowed.includes(cache.weaponSelect.value as WeaponKey) && allowed.length) {
    cache.weaponSelect.value = allowed[0];
  }
}

// Recalculate when inputs change and write results back to the UI.
function updateOutputs(): void {
  const stage = cache.stageSelect.value as StageKey;
  const allowedWeapons =
    stageWeaponMap[stage] ?? (Object.keys(weaponCatalog) as WeaponKey[]);

  if (!allowedWeapons.includes(cache.weaponSelect.value as WeaponKey) && allowedWeapons.length) {
    cache.weaponSelect.value = allowedWeapons[0];
  }

  const weapon = cache.weaponSelect.value as WeaponKey;
  const weaponDef = weaponCatalog[weapon];
  if (!weaponDef) {
    return;
  }

  const levelUpperBound = stageMaxLevels[stage] ?? 199;
  if (cache.levelInput.max !== levelUpperBound.toString()) {
    cache.levelInput.max = levelUpperBound.toString();
  }

  const rawLevel = Number.parseInt(cache.levelInput.value, 10) || 1;
  const level = clamp(rawLevel, 1, levelUpperBound);
  if (level !== rawLevel) {
    cache.levelInput.value = level.toString();
  }

  if (cache.injuryInput.max !== INJURY_MAX.toString()) {
    cache.injuryInput.max = INJURY_MAX.toString();
  }

  const rawInjury = Number.parseInt(cache.injuryInput.value, 10) || 0;
  const injury = clamp(rawInjury, 0, INJURY_MAX);
  if (injury !== rawInjury) {
    cache.injuryInput.value = injury.toString();
  }

  const coefficient = weaponDef.coefficient;
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
  const sanitized = expression.replace("√", "").trim();
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
    const levelSquared = level * level;
    const levelCubed = levelSquared * level;
    const g =
      339.325408 +
      5.5896113 * level +
      -0.0386452486 * levelSquared +
      0.0000829599381 * levelCubed;
    // NOTE:
    //   ・2025 年時点で収集した極開花（Lv100〜199）の修理秒数サンプル（減少生存1）を基に三次式で回帰。
    //   ・Lv150 以降の挙動に別定数が使われる可能性は引き続き残るため、追加データ入手時に再度フィッティングする。
    const repaired = g * coefficient * lostHp + 30;
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

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(Math.max(value, lower), upper);
}

function handleStageChange(): void {
  const stage = cache.stageSelect.value as StageKey;
  populateWeaponOptions(stage);
  updateOutputs();
}

function enableWheelAdjustment(input: HTMLInputElement): void {
  input.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();

      const rawCurrent = Number.parseInt(input.value, 10) || 0;
      const delta = event.deltaY;
      if (delta === 0) {
        return;
      }

      const stepAttr = Number.parseInt(input.step, 10);
      const step = Number.isNaN(stepAttr) || stepAttr <= 0 ? 1 : stepAttr;
      const direction = delta < 0 ? 1 : -1;

      const minAttr = Number.parseInt(input.min, 10);
      const maxAttr = Number.parseInt(input.max, 10);
      const minValue = Number.isNaN(minAttr)
        ? Number.NEGATIVE_INFINITY
        : minAttr;
      const maxValue = Number.isNaN(maxAttr)
        ? Number.POSITIVE_INFINITY
        : maxAttr;

      const nextValue = clamp(rawCurrent + direction * step, minValue, maxValue);

      if (nextValue === rawCurrent) {
        return;
      }

      input.value = nextValue.toString();
      updateOutputs();
    },
    { passive: false },
  );
}
