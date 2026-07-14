export const OPEN_CHAMPIONSHIP_2026_TOURNAMENT_NAME = "2026 British Open";
export const OPEN_CHAMPIONSHIP_2026_AMATEUR_BONUS_STROKES = 2;

export type OpenChampionship2026Tier = "UK" | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | "A";

const UK_NATIVES = [
  "Sam Bairstow",
  "Matthew Baldwin",
  "Dan Bradbury",
  "Laurie Canter",
  "Joe Dean",
  "Alex Fitzpatrick",
  "Matt Fitzpatrick",
  "Tommy Fleetwood",
  "Harry Hall",
  "Tyrrell Hatton",
  "Matthew Jordan",
  "Aaron Rai",
  "Matthew Southgate",
  "Andy Sullivan",
  "Matt Wallace",
  "Jack McDonald",
  "Robert MacIntyre",
  "Rory McIlroy",
  "Shane Lowry",
  "Tom McKibbin",
  "Darren Clarke",
  "Padraig Harrington",
  "Stuart Grehan",
  "David Howard",
];

const TIER_1 = [
  "Scottie Scheffler",
  "Cameron Young",
  "Russell Henley",
  "Chris Gotterup",
  "Collin Morikawa",
  "Wyndham Clark",
  "Justin Rose",
];

const TIER_2 = [
  "Jon Rahm",
  "Viktor Hovland",
  "J.J. Spaun",
  "Xander Schauffele",
  "Ben Griffin",
  "Sam Burns",
  "Justin Thomas",
  "Ludvig Aberg",
];

const TIER_3 = [
  "Si Woo Kim",
  "Sepp Straka",
  "Min Woo Lee",
  "Alexander Noren",
  "Patrick Reed",
  "Kristoffer Reitan",
  "Ryan Gerard",
  "Akshay Bhatia",
  "Jacob Bridgeman",
];

const TIER_4 = [
  "Hideki Matsuyama",
  "Harris English",
  "Tom Kim",
  "J.T. Poston",
  "Nicolai Hojgaard",
  "Kurt Kitayama",
  "Bryson DeChambeau",
  "Patrick Cantlay",
  "Maverick McNealy",
  "Bud Cauley",
];

const TIER_5 = [
  "Keegan Bradley",
  "Rickie Fowler",
  "Gary Woodland",
  "Alex Smalley",
  "Jake Knapp",
  "Sam Stevens",
  "Joaquin Niemann",
  "Daniel Berger",
  "Marco Penge",
];

const TIER_6 = [
  "Jordan Spieth",
  "Nicolas Echavarria",
  "Corey Conners",
  "Jason Day",
  "Michael Kim",
  "Ryan Fox",
  "Adam Scott",
  "John Keefer",
  "Eugenio Lopez-Chacarra",
  "Michael Brennan",
  "Pierceson Coody",
  "Ryo Hisatsune",
  "Matthew McCarty",
  "Brian Harman",
  "David Puig",
  "Nick Taylor",
  "Keith Mitchell",
  "Andrew Novak",
  "Michael Thorbjornsen",
  "Eric Cole",
  "Sami Valimaki",
  "Max Homa",
  "Max Greyserman",
  "Jordan L. Smith",
  "Thomas Detry",
  "Sahith Theegala",
  "Casey Jarvis",
  "Aldrich Potgieter",
  "Jayden Trey Schaper",
  "Sungjae Im",
  "Rasmus Hojgaard",
  "Keita Nakajima",
];

const TIER_7 = [
  "Rasmus Neergaard-Petersen",
  "Shaun Norris",
  "John Parry",
  "Lucas Herbert",
  "Daniel Hillier",
  "Hao-Tong Li",
  "Kota Kaneko",
  "Angel Ayora Fanegas",
  "Jackson Suber",
  "Brooks Koepka",
  "Hennie Du Plessis",
  "Adrien Saddier",
  "Jose Luis Ballester",
  "Daniel Brown",
  "Cameron Smith",
  "Travis Smyth",
  "Michael Hollick",
  "Scott Vincent",
  "Bernd Wiesberger",
  "Joakim Lagergren",
  "Victor Perez",
  "Jesper Svensson",
  "Billy Horschel",
  "Martin Couvra",
  "Kazuki Higa",
  "Peter Uihlein",
  "Alistair Docherty",
  "Antoine Rozner",
  "Austen Truslow",
];

const TIER_8 = [
  "Baard Bjoernevik Skogen",
  "Caleb Surratt",
  "Cameron John",
  "David Duval",
  "Francesco Laporta",
  "Francesco Molinari",
  "Frederic Lacroix",
  "Henrik Stenson",
  "James Nicholas",
  "Jeongwoo Ham",
  "Jiho Yang",
  "Kazuma Kobori",
  "Marcus Plunkett",
  "MJ Daffue",
  "Naoyuki Kataoka",
  "Ren Yonezawa",
  "Ryutaro Nagano",
  "Stewart Cink",
  "Thomas Sloman",
  "Tiger Christensen",
];

const AMATEURS = [
  "Jackson Buchanan",
  "Alejandro De Castro Piera",
  "Stuart Grehan",
  "Lev Grinberg",
  "David Howard",
  "Mason Howell",
  "Fifa Laopakdee",
  "Mateo Pulcini",
  "Nevill Ruiter",
  "Tim Wiedemeyer",
];

export const OPEN_CHAMPIONSHIP_2026_FIELD = [
  ...UK_NATIVES,
  ...TIER_1,
  ...TIER_2,
  ...TIER_3,
  ...TIER_4,
  ...TIER_5,
  ...TIER_6,
  ...TIER_7,
  ...TIER_8,
  ...AMATEURS.filter((name) => !UK_NATIVES.includes(name)),
];

const TIER_RULES: Record<string, string> = {
  "UK/Ireland Natives": "Required: choose exactly 1 each round",
  "Tier 1": "Cap: Choose 1 Max",
  "Tier 2": "Cap: Choose 1 Max",
  "Tier 3": "Cap: Choose 1 Max",
  "Tier 4": "Cap: Choose 1 Max",
  "Tier 5": "No cap",
  "Tier 6": "No cap",
  "Tier 7": "No cap",
  "Tier 8": "No cap",
  Amateur: "No cap - Bonus: subtract 2 strokes each round selected",
};

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const tierByName = new Map<string, OpenChampionship2026Tier>();
UK_NATIVES.forEach((name) => tierByName.set(normalizeName(name), "UK"));
[
  [TIER_1, 1],
  [TIER_2, 2],
  [TIER_3, 3],
  [TIER_4, 4],
  [TIER_5, 5],
  [TIER_6, 6],
  [TIER_7, 7],
  [TIER_8, 8],
].forEach(([names, tier]) => {
  (names as string[]).forEach((name) => tierByName.set(normalizeName(name), tier as OpenChampionship2026Tier));
});
const amateurNames = new Set(AMATEURS.map(normalizeName));
AMATEURS.forEach((name) => {
  const normalized = normalizeName(name);
  if (!tierByName.has(normalized)) tierByName.set(normalized, "A");
});

export function isOpenChampionship2026TournamentName(name?: string | null) {
  const value = String(name || "");
  return /2026/i.test(value) && /(british\s+open|open\s+championship)/i.test(value);
}

export function openChampionship2026PlayerMeta(name: string) {
  const tier = tierByName.get(normalizeName(name)) || 8;
  const isUkNative = tier === "UK";
  const isAmateur = amateurNames.has(normalizeName(name));
  const label = isUkNative ? "UK/Ireland Natives" : isAmateur ? "Amateur" : `Tier ${tier}`;
  return {
    tier,
    isUkNative,
    isAmateur,
    label,
    badgeLabel: isUkNative && isAmateur ? "UK/Ireland Native + Amateur" : label,
    sortOrder: isUkNative ? 0 : isAmateur ? 9 : Number(tier),
  };
}

export function openChampionship2026SelectionCounts(names: string[]) {
  const counts = { uk: 0, 1: 0, 2: 0, 3: 0, 4: 0 };

  names.forEach((name) => {
    const meta = openChampionship2026PlayerMeta(name);
    if (meta.isUkNative) counts.uk += 1;
    if (meta.tier === 1) counts[1] += 1;
    if (meta.tier === 2) counts[2] += 1;
    if (meta.tier === 3) counts[3] += 1;
    if (meta.tier === 4) counts[4] += 1;
  });

  return {
    ukNative: counts.uk,
    tier1: counts[1],
    tier2: counts[2],
    tier3: counts[3],
    tier4: counts[4],
  };
}

export function validateOpenChampionship2026Selection(names: string[]) {
  const counts = openChampionship2026SelectionCounts(names);

  if (counts.ukNative < 1) return "2026 British Open rule: pick exactly 1 UK/Ireland Native each round.";
  if (counts.ukNative > 1) return "2026 British Open rule: pick only 1 UK/Ireland Native each round.";
  if (counts.tier1 > 1) return "2026 British Open rule: pick no more than 1 player from Tier 1 per round.";
  if (counts.tier2 > 1) return "2026 British Open rule: pick no more than 1 player from Tier 2 per round.";
  if (counts.tier3 > 1) return "2026 British Open rule: pick no more than 1 player from Tier 3 per round.";
  if (counts.tier4 > 1) return "2026 British Open rule: pick no more than 1 player from Tier 4 per round.";
  return "";
}

export function getOpenChampionship2026TierCapError(names: string[]) {
  const counts = openChampionship2026SelectionCounts(names);
  if (counts.ukNative > 1) return "Only 1 UK/Ireland Native player is allowed per round.";
  if (counts.tier1 > 1) return "Only 1 Tier 1 player is allowed per round.";
  if (counts.tier2 > 1) return "Only 1 Tier 2 player is allowed per round.";
  if (counts.tier3 > 1) return "Only 1 Tier 3 player is allowed per round.";
  if (counts.tier4 > 1) return "Only 1 Tier 4 player is allowed per round.";
  return "";
}

export function getOpenChampionship2026TierRule(label: string) {
  return TIER_RULES[label] || "";
}

export function isOpenChampionship2026Amateur(name: string) {
  return openChampionship2026PlayerMeta(name).isAmateur;
}

export function applyOpenChampionship2026AmateurBonus(
  tournamentName: string | null | undefined,
  golferName: string,
  score: number
) {
  if (!isOpenChampionship2026TournamentName(tournamentName)) return score;
  if (!isOpenChampionship2026Amateur(golferName)) return score;
  return score - OPEN_CHAMPIONSHIP_2026_AMATEUR_BONUS_STROKES;
}
