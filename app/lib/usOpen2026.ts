export const US_OPEN_2026_TOURNAMENT_NAME = "2026 US Open";

export type UsOpen2026Tier = 1 | 2 | 3 | 4 | 5 | 6 | "A";

const TIER_1 = [
  "Scottie Scheffler",
  "Rory McIlroy",
  "Cameron Young",
  "Matt Fitzpatrick",
  "Tommy Fleetwood",
  "Jon Rahm",
  "Xander Schauffele",
  "Ludvig Aberg",
  "Bryson DeChambeau",
  "Brooks Koepka",
];

const TIER_2 = [
  "Russell Henley",
  "Collin Morikawa",
  "Chris Gotterup",
  "Justin Thomas",
  "Si Woo Kim",
  "Tyrrell Hatton",
  "Patrick Reed",
  "Sam Burns",
  "Wyndham Clark",
  "Patrick Cantlay",
];

const TIER_3 = [
  "Justin Rose",
  "J.J. Spaun",
  "Ben Griffin",
  "Robert MacIntyre",
  "Hideki Matsuyama",
  "Viktor Hovland",
  "Min Woo Lee",
  "Maverick McNealy",
  "Jordan Spieth",
  "Joaquin Niemann",
];

const TIER_4 = [
  "Aaron Rai",
  "Sepp Straka",
  "Harris English",
  "Kurt Kitayama",
  "Bud Cauley",
  "Alex Smalley",
  "Jake Knapp",
  "Shane Lowry",
  "Adam Scott",
  "David Puig",
];

const TIER_5 = [
  "Ryan Gerard",
  "Jacob Bridgeman",
  "Kristoffer Reitan",
  "Nicolai Hojgaard",
  "J.T. Poston",
  "Rickie Fowler",
  "Gary Woodland",
  "Jason Day",
  "Alex Fitzpatrick",
  "Sudarshan Yellamaraju",
];

const AMATEURS = [
  "Hamilton Coleman",
  "Ryder Cowan",
  "Ethan Fang",
  "Marek Fleming",
  "Vaughn Harber",
  "Jackson Herrington",
  "Brandon Holtz",
  "Mason Howell",
  "Jackson Koivun",
  "Chase Kyes",
  "Bryan Lee",
  "Eric Lee",
  "Jackson Ormond",
  "Giuseppe Puebla",
  "Mateo Pulcini",
  "Logan Reilly",
  "Matthew Robles",
  "Miles Russell",
  "Preston Stout",
  "Arni Sveinsson",
];

const TIER_RULES: Record<string, string> = {
  "Tier 1": "Cap: Choose 1 Max",
  "Tier 2": "Cap: Choose 1 Max",
  "Tier 3": "Cap: Choose 3 Max",
  "Tier 4": "Cap: Choose 3 Max",
  "Tier 5": "Cap: Choose 3 Max",
  "Tier 6": "RULE: Choose 4 Max - Minimum: Must Have 1 Tier 6 or Amateur",
  Amateur: "Cap: Choose 4 Max - Minimum: Must Have 1 Tier 6 or Amateur",
};

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

const tierByName = new Map<string, UsOpen2026Tier>();
[
  [TIER_1, 1],
  [TIER_2, 2],
  [TIER_3, 3],
  [TIER_4, 4],
  [TIER_5, 5],
].forEach(([names, tier]) => {
  (names as string[]).forEach((name) => tierByName.set(normalizeName(name), tier as UsOpen2026Tier));
});
AMATEURS.forEach((name) => tierByName.set(normalizeName(name), "A"));

export function isUsOpen2026TournamentName(name?: string | null) {
  return /2026\s+u\.?s\.?\s+open/i.test(String(name || ""));
}

export function usOpen2026PlayerMeta(name: string) {
  const tier = tierByName.get(normalizeName(name)) || 6;
  const isAmateur = tier === "A";
  return {
    tier,
    isAmateur,
    satisfiesRequiredValuePick: isAmateur || tier === 6,
    label: isAmateur ? "Amateur" : `Tier ${tier}`,
    sortOrder: isAmateur ? 7 : Number(tier),
  };
}

export function validateUsOpen2026Selection(names: string[]) {
  const counts = usOpen2026SelectionCounts(names);

  if (counts.tier1 > 1) return "2026 US Open rule: pick no more than 1 player from Tier 1 per round.";
  if (counts.tier2 > 1) return "2026 US Open rule: pick no more than 1 player from Tier 2 per round.";
  if (counts.tier3 > 3) return "2026 US Open rule: pick no more than 3 players from Tier 3 per round.";
  if (counts.tier4 > 3) return "2026 US Open rule: pick no more than 3 players from Tier 4 per round.";
  if (counts.tier5 > 3) return "2026 US Open rule: pick no more than 3 players from Tier 5 per round.";
  if (counts.requiredValue < 1) return "2026 US Open rule: pick at least 1 Amateur or Tier 6 player per round.";
  return "";
}

export function usOpen2026SelectionCounts(names: string[]) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, value: 0 };

  names.forEach((name) => {
    const meta = usOpen2026PlayerMeta(name);
    if (meta.tier === 1) counts[1] += 1;
    if (meta.tier === 2) counts[2] += 1;
    if (meta.tier === 3) counts[3] += 1;
    if (meta.tier === 4) counts[4] += 1;
    if (meta.tier === 5) counts[5] += 1;
    if (meta.satisfiesRequiredValuePick) counts.value += 1;
  });

  return {
    tier1: counts[1],
    tier2: counts[2],
    tier3: counts[3],
    tier4: counts[4],
    tier5: counts[5],
    requiredValue: counts.value,
  };
}

export function getUsOpen2026TierCapError(names: string[]) {
  const counts = usOpen2026SelectionCounts(names);
  if (counts.tier1 > 1) return "Only 1 Tier 1 player is allowed per round.";
  if (counts.tier2 > 1) return "Only 1 Tier 2 player is allowed per round.";
  if (counts.tier3 > 3) return "Only 3 Tier 3 players are allowed per round.";
  if (counts.tier4 > 3) return "Only 3 Tier 4 players are allowed per round.";
  if (counts.tier5 > 3) return "Only 3 Tier 5 players are allowed per round.";
  return "";
}

export function getUsOpen2026TierRule(label: string) {
  return TIER_RULES[label] || "";
}
