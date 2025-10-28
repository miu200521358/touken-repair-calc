"use strict";
/**
 * Touken Ranbu repair calculator frontend logic.
 * Handles master data, formulas, and DOM binding for the single page app.
 */
// --- Master data ------------------------------------------------------------------------------------
const weaponCatalog = {
    tantou: { label: "短刀", coefficient: 1.0 },
    wakizashi: { label: "脇差", coefficient: 1.5 },
    uchigatana: { label: "打刀", coefficient: 2.0 },
    uchigatana_rare4: { label: "レア4打刀", coefficient: 4.0 },
    tachi: { label: "太刀", coefficient: 4.0 },
    ootachi: { label: "大太刀", coefficient: 6.0 },
    yari: { label: "槍", coefficient: 2.5 },
    naginata: { label: "薙刀", coefficient: 3.0 },
};
const resourceBaseExpressions = {
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
};
const stageLabels = {
    initial: "初",
    awakened: "極",
};
const stageMaxLevels = {
    initial: 99,
    awakened: 199,
};
const INJURY_MAX = 150;
const phaseLabels = {
    initial: "初",
    awakened: "極",
    bloom: "極開花",
};
const resourceKinds = [
    "charcoal",
    "steel",
    "coolant",
    "whetstone",
];
// Cache the square-root results so we only pay the cost once.
const precomputedResourceBases = Object.keys(resourceBaseExpressions).reduce((accumulator, weapon) => {
    const weaponKey = weapon;
    const expressionSet = resourceBaseExpressions[weaponKey];
    accumulator[weaponKey] = resourceKinds.reduce((resourceAcc, resource) => {
        resourceAcc[resource] = parseInnerRoot(expressionSet[resource]);
        return resourceAcc;
    }, {
        charcoal: 0,
        steel: 0,
        coolant: 0,
        whetstone: 0,
    });
    return accumulator;
}, {});
// DOM references are reused frequently; keep them in one place.
const cache = {
    weaponSelect: document.getElementById("weapon"),
    stageSelect: document.getElementById("stage"),
    levelInput: document.getElementById("level"),
    levelValue: document.getElementById("levelValue"),
    injuryInput: document.getElementById("injury"),
    injuryValue: document.getElementById("injuryValue"),
    phaseDisplay: document.getElementById("phaseDisplay"),
    timeOutput: document.getElementById("timeOutput"),
    resourceOutputs: {
        charcoal: document.getElementById("charcoalOutput"),
        steel: document.getElementById("steelOutput"),
        coolant: document.getElementById("coolantOutput"),
        whetstone: document.getElementById("whetstoneOutput"),
    },
};
document.addEventListener("DOMContentLoaded", () => {
    populateWeaponOptions();
    populateStageOptions();
    bindEventListeners();
    updateOutputs();
});
// Attach input listeners so recalculation happens immediately.
function bindEventListeners() {
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
function populateWeaponOptions() {
    cache.weaponSelect.innerHTML = "";
    Object.entries(weaponCatalog).forEach(([value, { label }]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        cache.weaponSelect.append(option);
    });
}
// Stage select is static but we still build it programmatically for clarity.
function populateStageOptions() {
    cache.stageSelect.innerHTML = "";
    Object.entries(stageLabels).forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        cache.stageSelect.append(option);
    });
}
// Recalculate when inputs change and write results back to the UI.
function updateOutputs() {
    var _a;
    const weapon = cache.weaponSelect.value;
    const stage = cache.stageSelect.value;
    const levelUpperBound = (_a = stageMaxLevels[stage]) !== null && _a !== void 0 ? _a : 199;
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
function parseInnerRoot(expression) {
    const sanitized = expression.replace("√", "").trim();
    const numericValue = Number.parseFloat(sanitized);
    if (Number.isNaN(numericValue)) {
        throw new Error(`Invalid resource expression: ${expression}`);
    }
    return Math.sqrt(numericValue);
}
// Determine which formula should be used based on level and stage.
function determinePhase(level, stage) {
    if (level >= 100) {
        return "bloom";
    }
    return stage === "awakened" ? "awakened" : "initial";
}
function clamp(value, lower, upper) {
    return Math.min(Math.max(value, lower), upper);
}
// Calculate repair time in seconds, guaranteeing the 30-second minimum.
function calculateRepairSeconds(level, lostHp, coefficient, phase) {
    if (lostHp <= 0) {
        return 30;
    }
    if (phase === "bloom") {
        const repaired = (629.2407 - 0.264066 * level) * coefficient * lostHp + 30;
        return Math.max(30, Math.round(repaired));
    }
    const aTerm = level <= 11 ? 0 : Math.floor(Math.sqrt(level - 11)) * 10 + 50;
    const repaired = (level * 5 + aTerm) * coefficient * lostHp + 30;
    return Math.max(30, Math.round(repaired));
}
// Compute rounded resource costs for each material.
function calculateResourceCost(weapon, lostHp, coefficient) {
    if (lostHp <= 0) {
        return {
            charcoal: 0,
            steel: 0,
            coolant: 0,
            whetstone: 0,
        };
    }
    const base = precomputedResourceBases[weapon];
    return resourceKinds.reduce((accumulator, kind) => {
        const value = Math.round(base[kind] * coefficient * lostHp);
        accumulator[kind] = Math.max(0, value);
        return accumulator;
    }, {});
}
// Format a number of seconds as hh:mm:ss for display.
function formatSeconds(totalSeconds) {
    const clamped = Math.max(30, Math.round(totalSeconds));
    const hours = Math.floor(clamped / 3600);
    const minutes = Math.floor((clamped % 3600) / 60);
    const seconds = clamped % 60;
    return [hours, minutes, seconds]
        .map((segment) => segment.toString().padStart(2, "0"))
        .join(":");
}
