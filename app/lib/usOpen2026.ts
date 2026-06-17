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
  if (counts.tier3 > 2) return "2026 US Open rule: pick no more than 2 players from Tier 3 per round.";
  if (counts.requiredValue < 1) return "2026 US Open rule: pick at least 1 Amateur or Tier 6 player per round.";
  return "";
}

export function usOpen2026SelectionCounts(names: string[]) {
  const counts = { 1: 0, 2: 0, 3: 0, value: 0 };

  names.forEach((name) => {
    const meta = usOpen2026PlayerMeta(name);
    if (meta.tier === 1) counts[1] += 1;
    if (meta.tier === 2) counts[2] += 1;
    if (meta.tier === 3) counts[3] += 1;
    if (meta.satisfiesRequiredValuePick) counts.value += 1;
  });

  return {
    tier1: counts[1],
    tier2: counts[2],
    tier3: counts[3],
    requiredValue: counts.value,
  };
}

export function getUsOpen2026TierCapError(names: string[]) {
  const counts = usOpen2026SelectionCounts(names);
  if (counts.tier1 > 1) return "Only 1 Tier 1 player is allowed per round.";
  if (counts.tier2 > 1) return "Only 1 Tier 2 player is allowed per round.";
  if (counts.tier3 > 2) return "Only 2 Tier 3 players are allowed per round.";
  return "";
}
