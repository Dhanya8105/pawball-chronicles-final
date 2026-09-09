/**
 * apps/api/src/modules/lore/lore.data.ts
 *
 * All of the Lore Engine's rule tables and text pools in one place, so the
 * mappings can be reviewed and tuned without touching engine logic and
 * without any model dependency.
 *
 * Determinism split:
 *   - rarity / class / element  -> pure lookups (no seed)
 *   - name / lore prose / weekly text / stat spread -> seeded selection off
 *     the PawBall's seed (see lib/seededRandom.ts)
 */

import type {
  Biome,
  Element,
  FantasyClass,
  Rarity,
} from "@pawball/shared-types";

export type TimeOfDay = "dawn" | "day" | "dusk" | "night";
export type Weather = "clear" | "rain" | "fog" | "sunset";

// ---------------------------------------------------------------------------
// Rarity — deterministic score from breed + surroundings + time + weather
// ---------------------------------------------------------------------------

export const BREED_RARITY_WEIGHT: Record<string, number> = {
  "domestic shorthair": 0,
  "domestic longhair": 0,
  calico: 1,
  "british shorthair": 1,
  "russian blue": 1,
  "scottish fold": 1,
  abyssinian: 1,
  siamese: 1,
  persian: 2,
  bengal: 2,
  "maine coon": 2,
  ragdoll: 2,
  sphynx: 3,
};

export const SURROUNDING_RARITY_WEIGHT: Record<string, number> = {
  temple: 3,
  mountain: 3,
  forest: 2,
  beach: 2,
  water: 2,
  night: 2,
  fog: 2,
  rain: 2,
  sunset: 1,
  garden: 1,
  village: 1,
  flowers: 1,
  trees: 1,
  morning: 1,
  street: 0,
  apartment: 0,
  cafe: 0,
  marketplace: 0,
  "urban alley": 0,
};

export const TIME_RARITY_WEIGHT: Record<TimeOfDay, number> = {
  night: 3,
  dawn: 2,
  dusk: 2,
  day: 0,
};

export const WEATHER_RARITY_WEIGHT: Record<Weather, number> = {
  rain: 2,
  fog: 2,
  sunset: 1,
  clear: 0,
};

/** Inclusive lower bounds, checked high-to-low. */
export const RARITY_THRESHOLDS: ReadonlyArray<{ min: number; rarity: Rarity }> = [
  { min: 9, rarity: "legendary" },
  { min: 6, rarity: "epic" },
  { min: 4, rarity: "rare" },
  { min: 2, rarity: "uncommon" },
  { min: 0, rarity: "common" },
];

// ---------------------------------------------------------------------------
// Class — deterministic lookup: breed group x surrounding group
// ---------------------------------------------------------------------------

type BreedGroup = "plain" | "sleek" | "regal";
type SurroundingGroup = "wild" | "urban" | "sacred" | "liminal";

export const BREED_GROUP: Record<string, BreedGroup> = {
  "domestic shorthair": "plain",
  "domestic longhair": "plain",
  calico: "plain",
  siamese: "sleek",
  abyssinian: "sleek",
  "russian blue": "sleek",
  sphynx: "sleek",
  bengal: "sleek",
  persian: "regal",
  "maine coon": "regal",
  ragdoll: "regal",
  "british shorthair": "regal",
  "scottish fold": "regal",
};

export const SURROUNDING_GROUP: Record<string, SurroundingGroup> = {
  forest: "wild",
  trees: "wild",
  mountain: "wild",
  water: "wild",
  beach: "wild",
  street: "urban",
  "urban alley": "urban",
  marketplace: "urban",
  apartment: "urban",
  cafe: "urban",
  village: "urban",
  temple: "sacred",
  garden: "sacred",
  flowers: "sacred",
  night: "liminal",
  fog: "liminal",
  rain: "liminal",
  sunset: "liminal",
  morning: "liminal",
};

export const CLASS_TABLE: Record<
  BreedGroup,
  Record<SurroundingGroup, FantasyClass>
> = {
  plain: { wild: "Ranger", urban: "Rogue", sacred: "Bard", liminal: "Mystic" },
  sleek: { wild: "Ranger", urban: "Warrior", sacred: "Mage", liminal: "Mystic" },
  regal: { wild: "Guardian", urban: "Sentinel", sacred: "Mage", liminal: "Guardian" },
};

export const DEFAULT_BREED_GROUP: BreedGroup = "plain";
export const DEFAULT_SURROUNDING_GROUP: SurroundingGroup = "wild";

export const CLASS_TITLE_WORD: Record<FantasyClass, string> = {
  Rogue: "Shadow",
  Mage: "Seer",
  Guardian: "Guardian",
  Warrior: "Blade",
  Mystic: "Oracle",
  Ranger: "Warden",
  Bard: "Voice",
  Sentinel: "Watcher",
};

export interface StatBlock {
  attack: number;
  defense: number;
  agility: number;
  spirit: number;
  wisdom: number;
}

/** Per-class stat tilt, applied deterministically before the seeded spread
 * so a Warrior reads as an attacker and a Guardian as a wall. */
export const CLASS_STAT_TILT: Record<
  FantasyClass,
  Partial<Record<keyof StatBlock, number>>
> = {
  Warrior: { attack: 10, defense: 4, wisdom: -6 },
  Guardian: { defense: 12, spirit: 3, agility: -6 },
  Sentinel: { defense: 8, wisdom: 4, attack: -4 },
  Rogue: { agility: 12, attack: 4, defense: -6 },
  Ranger: { agility: 8, attack: 5, spirit: -4 },
  Mage: { wisdom: 12, spirit: 4, defense: -6 },
  Mystic: { spirit: 12, wisdom: 4, attack: -6 },
  Bard: { spirit: 8, agility: 4, defense: -3 },
};

export const STAT_ORDER: ReadonlyArray<keyof StatBlock> = [
  "attack",
  "defense",
  "agility",
  "spirit",
  "wisdom",
];

export const STAT_BASE_BY_RARITY: Record<Rarity, number> = {
  common: 42,
  uncommon: 54,
  rare: 66,
  epic: 80,
  legendary: 95,
};

export const STAT_SPREAD = 15;

// ---------------------------------------------------------------------------
// Element — deterministic lookup: coat colour x time of day
// ---------------------------------------------------------------------------

export const ELEMENT_TABLE: Record<string, Record<TimeOfDay, Element>> = {
  orange: { dawn: "Solar", day: "Solar", dusk: "Ember", night: "Ember" },
  black: { dawn: "Storm", day: "Storm", dusk: "Shadow", night: "Shadow" },
  white: { dawn: "Frost", day: "Frost", dusk: "Moon", night: "Moon" },
  grey: { dawn: "Frost", day: "Storm", dusk: "Storm", night: "Moon" },
  brown: { dawn: "Verdant", day: "Verdant", dusk: "Ember", night: "Shadow" },
  calico: { dawn: "Solar", day: "Verdant", dusk: "Tide", night: "Moon" },
  cream: { dawn: "Solar", day: "Solar", dusk: "Tide", night: "Moon" },
};

export const DEFAULT_ELEMENT_COLOR_KEY = "grey";

// ---------------------------------------------------------------------------
// Names — 30 prefixes x 30 suffixes, seeded pick of each, fused
// ---------------------------------------------------------------------------

export const NAME_PREFIXES: readonly string[] = [
  "Mor", "Vel", "Ash", "Kir", "Sol", "Bram", "Thal", "Nyx", "Corv", "Elu",
  "Fenn", "Gwyn", "Hesp", "Ir", "Jor", "Kael", "Lir", "Maed", "Oren", "Pyr",
  "Quill", "Rhu", "Syl", "Tor", "Umbr", "Vesh", "Wren", "Xan", "Yrr", "Zeph",
];

export const NAME_SUFFIXES: readonly string[] = [
  "wyn", "rath", "iel", "dorn", "essa", "mir", "oth", "ara", "wick", "vane",
  "isk", "orn", "eth", "alla", "ux", "ith", "mora", "del", "yr", "ock",
  "iana", "wex", "aunt", "ely", "orin", "ade", "usk", "iah", "enn", "ova",
];

// ---------------------------------------------------------------------------
// Lore prose — assembled from seeded picks, 3-5 sentences.
// Slots: {name} {region} {breed} {class} {element} {trait}
// ---------------------------------------------------------------------------

export const BIOME_OPENERS: Record<Biome, readonly string[]> = {
  woodland: [
    "{name} was first seen slipping between the trees of {region}, more shadow than {breed}.",
    "They found {name} in {region}, sat perfectly still on a fallen trunk as though waiting to be introduced.",
    "{region}'s undergrowth raised {name}: a {breed} who learned patience from the moss and silence from the owls.",
    "{name} came out of the deep wood of {region} without a sound, and has never fully lost that trick.",
    "In {region}, where the canopy keeps its own hours, {name} keeps them too.",
  ],
  coast: [
    "{name} was born to the salt wind of {region} and still turns to face weather most cats would flee.",
    "The tideline of {region} is {name}'s first memory: cold, loud, and entirely theirs.",
    "They found {name} on the rocks at {region}, unbothered by the spray, watching the horizon like it owed them money.",
    "{region} gave {name} a taste for open water and a coat that never quite dries.",
    "{name} walked out of the sea-mist at {region} one morning and simply stayed.",
  ],
  sanctum: [
    "{name} was raised among the worn steps and low bells of {region}, and moves through the world like it is still a quiet place.",
    "The keepers of {region} swear {name} was already there when they arrived.",
    "{name} kept the long candle-lit halls of {region} company, and picked up their unhurried way of walking.",
    "In {region}, where the hush listens back, {name} learned to be worth listening to.",
    "{name} came from the sanctum at {region} with a {breed}'s face and a much older stare.",
  ],
  citadel: [
    "{name} learned the lamplit streets of {region} rooftop by rooftop, and owns most of them by now.",
    "The crowds of {region} never noticed {name} growing up in their gaps, which was rather the point.",
    "{name} is a {breed} of {region}: quick across cobbles, quicker up a drainpipe, and impossible to corner.",
    "They found {name} working the market at {region}, charming half of it and robbing the other half of scraps.",
    "{region}'s noise raised {name}, and {name} has been making sense of it ever since.",
  ],
  highland: [
    "{name} came down from the ridgelines of {region} with frost still in their fur and no intention of explaining themselves.",
    "The thin air of {region} is where {name} is easiest — everywhere lower feels a little crowded.",
    "{name} was seen on the high stones of {region}, small against the drop, entirely unconcerned.",
    "{region} taught {name} that the wind has opinions and the smart move is to lean into them.",
    "{name} is a {breed} shaped by {region}: lean, sure-footed, and used to the long view.",
  ],
  grove: [
    "{name} grew up in the bloom and bee-hum of {region} and still smells faintly of it.",
    "The tended rows of {region} are {name}'s territory, patrolled twice daily whether or not anyone asked.",
    "They found {name} asleep in the warm soil of {region}, dusted with pollen, deeply unrepentant.",
    "{region} gave {name} a sweet tooth for sunlight and a habit of following the warmth around the garden.",
    "{name} came out of the {region} greenery like something the flowers had decided to keep.",
  ],
  shadowfen: [
    "{name} was born to the black water and moth-light of {region}, and has never needed much of either sun or company.",
    "The reeds of {region} move when there is no wind, and often that is just {name}.",
    "They found {name} at the fen's edge in {region}, patient as the mud, watching nothing in particular very closely.",
    "{region} raised {name} quiet and careful, which reads as eerie until you know them.",
    "{name} is a {breed} of {region}: low to the ground, slow to trust, and entirely unbothered by the dark.",
  ],
  mistlands: [
    "{name} came out of the permanent cloud over {region}, edges first, the rest arriving a moment later.",
    "In {region}, where distance dissolves at forty paces, {name} has always known exactly where everything is.",
    "The drizzle of {region} is {name}'s weather — anything brighter feels a little rude.",
    "They found {name} in the hush of {region}, grey on grey, only the eyes giving them away.",
    "{region} taught {name} to travel by sound, and they have not stopped listening since.",
  ],
  dawnreach: [
    "{name} takes the first light of {region} every morning, and has done since before anyone was keeping track.",
    "The east-facing grass of {region} is where {name} is warmest and least willing to move.",
    "They found {name} on the threshold of {region} at sunrise, backlit, unhurried, already awake.",
    "{region} gave {name} a {breed}'s frame and a temperament stuck permanently in the hour after dawn.",
    "{name} came up out of {region} with the sun behind them and has been hard to look at directly ever since.",
  ],
  wilds: [
    "{name} came in from the open reach of {region}, a place with no name until they arrived to need one.",
    "Nobody raised {name}; {region} simply failed to stop them.",
    "They found {name} a long way out in {region}, following a horizon that kept its distance.",
    "{region} is trackless, unclaimed and largely unbothered, which suited {name} exactly.",
    "{name} is a {breed} of nowhere in particular, and of {region} most of all.",
  ],
};

export const CLASS_SENTENCES: Record<FantasyClass, readonly string[]> = {
  Rogue: [
    "As a {class}, {name} treats every wall as a door and every door as a suggestion.",
    "{name} fights like a {class}: never where you swung, always where you didn't.",
    "The {class} in {name} keeps three exits in mind at all times and uses none of them dramatically.",
  ],
  Mage: [
    "{name} carries a {class}'s stillness, the kind that makes a room lower its voice.",
    "As a {class}, {name} reads a situation twice before it has finished happening.",
    "The {class} in {name} would rather solve a fight than win one, and usually does.",
  ],
  Guardian: [
    "{name} stands like a {class}: between the trouble and whatever the trouble wanted.",
    "As a {class}, {name} is slow to move and impossible to move once moved.",
    "The {class} in {name} counts everyone in before deciding the day is done.",
  ],
  Warrior: [
    "{name} closes distance like a {class} — early, decisively, and with obvious relish.",
    "As a {class}, {name} believes most problems yield to being met head-on, and tests this often.",
    "The {class} in {name} does not bluff; the tail-lash is the only warning you get.",
  ],
  Mystic: [
    "{name} has a {class}'s way of knowing things a beat before they are knowable.",
    "As a {class}, {name} listens to rooms, weather and silences the way others listen to speech.",
    "The {class} in {name} is calm in a way that unsettles people who were counting on panic.",
  ],
  Ranger: [
    "{name} moves like a {class}: economical, unhurried, and always already halfway to cover.",
    "As a {class}, {name} notices the one thing out of place and says nothing about it.",
    "The {class} in {name} maps a place once and never needs to again.",
  ],
  Bard: [
    "{name} works a crowd like a {class}, trading charm for scraps and information for both.",
    "As a {class}, {name} can make an enemy laugh, which is often enough.",
    "The {class} in {name} remembers every name and exactly one embarrassing fact per name.",
  ],
  Sentinel: [
    "{name} keeps a {class}'s watch — same post, same patience, nothing gets past twice.",
    "As a {class}, {name} would rather a boring night than an interesting one, and works to ensure it.",
    "The {class} in {name} is awake at the hour everyone else forgot to cover.",
  ],
};

export const AURA_SENTENCES: readonly string[] = [
  "Those who have spent time with {name} describe an air of {trait} that is hard to shake afterward.",
  "{name}'s {trait} shows most in the quiet moments, when they think no one is reading them.",
  "There is a {trait} to {name} that older cats seem to recognise and defer to.",
  "Handlers note {name}'s {trait} first and everything else second.",
  "The {trait} in {name} is not performance; it is simply how they are built.",
  "Even asleep, {name} radiates a low, steady {trait}.",
  "{name} wears their {trait} lightly, which somehow makes it more convincing.",
  "Whatever {name} is doing, the {trait} comes through — in the ears, the tail, the pause before moving.",
];

export const ELEMENT_CLOSERS: Record<Element, readonly string[]> = {
  Moon: [
    "They say {name}'s Moon-touched coat catches light that isn't there, and that {region} is a little brighter for it.",
    "{name} answers to the Moon: calmest at the full, restless at the new, and never quite ordinary in between.",
  ],
  Solar: [
    "{name} runs on Solar warmth, storing the afternoon in their fur and spending it slowly after dark.",
    "The Solar in {name} means {region} always seems to have one more hour of daylight where they are sitting.",
  ],
  Storm: [
    "{name} carries a Storm charge — fur that crackles before rain, and a temper that arrives on the same schedule.",
    "The Storm in {name} makes the air over {region} feel like the pressure just dropped.",
  ],
  Ember: [
    "{name} keeps an Ember lit somewhere behind the ribs; you feel it before you see them.",
    "The Ember in {name} means they seek out the last warm stone in {region} and defend it absolutely.",
  ],
  Frost: [
    "{name} is Frost-natured, unbothered by cold that sends everything else indoors, and faintly cool to the touch.",
    "The Frost in {name} leaves {region}'s morning grass untouched where they have walked.",
  ],
  Verdant: [
    "Green things lean toward {name}; the Verdant in them is why {region} always looks a season ahead near their den.",
    "{name} is Verdant to the core — patient, rooted, and slow to be hurried by anyone.",
  ],
  Shadow: [
    "{name} is Shadow-aligned, easiest to lose track of at exactly the moment you needed to keep it.",
    "The Shadow in {name} pools a little deeper than it should in the corners of {region}.",
  ],
  Tide: [
    "{name} moves on a Tide of their own — coming and going on a schedule only they can read.",
    "The Tide in {name} means {region}'s water is never quite still while they are near it.",
  ],
};

/** Optional middle sentence, added ~half the time (seeded), for length variety. */
export const MIDDLE_DETAILS: readonly string[] = [
  "They answer to {name} about a third of the time, and only when it suits them.",
  "Their one soft spot is a warm windowsill; everything else is negotiable.",
  "They have precisely one enemy — a specific gate — and the feud is ongoing.",
  "They will accept food from anyone and trust almost no one, and see no contradiction in this.",
  "They keep to a route through {region} that has never been written down and never varies.",
];

// ---------------------------------------------------------------------------
// Weekly life updates — 8 variants per element, seeded rotation by week no.
// Slots: {name} {region} {trait} {element}
// ---------------------------------------------------------------------------

export const WEEKLY_TEMPLATES: Record<Element, readonly string[]> = {
  Moon: [
    "This week {name} kept to the rooftops of {region} after dark, tracing the moon from ridge to ridge.",
    "A quiet week: {name} spent it half-asleep in moonlight, {trait} on full display to no audience at all.",
    "{name} was found three streets from their usual range in {region}, following a reflection nobody else could see.",
    "The new moon made {name} restless; they patrolled {region} twice a night and reported nothing.",
    "{name} adopted a second sleeping spot this week, chosen — as far as anyone can tell — for the sightline to the sky.",
    "Locals in {region} left out milk for {name} on the full-moon night, an old habit the {element} in them seems to encourage.",
    "{name} spent the week teaching a younger cat the safe way across {region}'s rooftops. The lesson was mostly silence.",
    "Nothing dramatic: {name} watched {region} from the same high wall each night, {trait} and unbothered.",
  ],
  Solar: [
    "{name} claimed a new sun-warmed stone in {region} this week and has not meaningfully moved since.",
    "A warm week suited {name}; they banked the afternoons in their fur and spent the evenings glowing about it.",
    "{name} followed the light around {region} all week, den to wall to windowsill, on a circuit of their own design.",
    "The {element} in {name} ran hot this week — up before dawn, flat-out asleep by noon, insufferable in between.",
    "{name} shared their sun-spot with a stray for two days, which is, for {name}, an extraordinary act of {trait}.",
    "{name} was seen escorting a child home across {region} at sunset, then returning to the exact same stone.",
    "A slow, bright week. {name} did very little and did it extremely well.",
    "{name} defended their warm corner of {region} against all comers this week, winning on reputation alone.",
  ],
  Storm: [
    "{name} predicted every rain in {region} this week by going indoors ten minutes early, fur already crackling.",
    "A charged week: {name}'s temper tracked the barometer, and {region} learned to read the tail.",
    "{name} spent the storm nights of {region} out in it, apparently on purpose, and came back looking pleased.",
    "The {element} in {name} was loud this week — territory disputes settled fast and decisively.",
    "{name} stood down a much larger dog in {region} on Tuesday. Witnesses cite {trait} and a very flat set of ears.",
    "{name} adopted a sheltered doorway as a storm bunker and now considers it sovereign territory.",
    "Quieter toward the weekend: the front passed, and so did {name}'s mood.",
    "{name} led two other cats out of a flooding culvert in {region} this week, then would not be thanked.",
  ],
  Ember: [
    "{name} found the last warm stone in {region} this week and has been holding it against the season.",
    "The {element} in {name} kept them close to hearths and engine blocks all week, radiating heat and mild menace.",
    "{name} saw off a rival for the bakery vent in {region} on Wednesday, a contest of pure {trait}.",
    "A banked-coals sort of week: {name} moved little, watched everything, and stayed unmistakably lit.",
    "{name} escorted the night-shift baker home through {region} twice this week, then returned to the vent.",
    "{name} let a kitten share the warm stone for one evening. The kitten has told everyone.",
    "Nothing burned down. {name} would like this noted.",
    "{name} spent the cold snap curled at the base of a chimney in {region}, unbothered and faintly smug.",
  ],
  Frost: [
    "{name} crossed {region}'s frosted grass all week without leaving a print, which unsettled at least one dog.",
    "The {element} in {name} suited the cold snap; while everything else went indoors, {name} went exploring.",
    "{name} claimed a north-facing ledge in {region} that no other cat wants, and could not be happier.",
    "A still, cold week. {name} sat through it with {trait} and a coat that never quite thawed.",
    "{name} broke a thin ice sheet on a {region} puddle every morning, apparently just to check it was still there.",
    "{name} guided an older cat along the gritted path through {region} this week, matching their slow pace exactly.",
    "The freeze kept everything quiet; {name} used the silence to map two new routes.",
    "{name} was found asleep in a snowbank in {region}, entirely fine, mildly offended at being checked on.",
  ],
  Verdant: [
    "The green near {name}'s den in {region} came in a week early again; the {element} in them tends to do that.",
    "{name} spent the week rooted in one sunny patch of {region}, patient as a plant, impossible to hurry.",
    "{name} adopted a fledgling's fallen nest-tree as a lookout and now defends the whole hedge.",
    "A slow-growing week: {name} did their rounds of {region} at half speed and missed nothing.",
    "{name} shared their patch with a nervous rabbit for three days, an act {region} is still discussing — pure {trait}.",
    "{name} walked the {region} allotments each evening this week, inspecting the beds like a landlord.",
    "Nothing moved fast. {name} least of all, and by choice.",
    "{name} was found half-buried in warm compost in {region}, deeply asleep, smelling of spring.",
  ],
  Shadow: [
    "{name} was technically present all week and verifiably seen twice; the {element} in them prefers it that way.",
    "A low, quiet week in {region}: {name} kept to the deep corners and let the dusk do the work.",
    "{name} shadowed the {region} night patrol for three evenings, unnoticed, then lost interest.",
    "The dark suited {name}; they extended their range and told no one.",
    "{name} steered a lost tourist out of {region}'s worst alley on Friday without ever being quite visible — {trait}, from the shadows.",
    "{name} found a new bolt-hole under {region} and has furnished it with one leaf.",
    "Nothing to report, which from {name} is itself a kind of report.",
    "{name} spent the week teaching a kitten to be un-findable. Both were, for the record, extremely un-findable.",
  ],
  Tide: [
    "{name} kept tide-time all week, appearing at {region}'s water on a schedule only they can read.",
    "The {element} in {name} had them restless on the turn and settled on the slack — {region} set its clock by it.",
    "{name} walked the {region} shoreline at every low water this week, inspecting what the sea left.",
    "A coming-and-going week: {name} was everywhere and nowhere, always just leaving.",
    "{name} pulled a gull's tangled line off the {region} rocks on Thursday, an oddly gentle bit of {trait}.",
    "{name} adopted an upturned boat in {region} as a between-tides den and guards it at both ends.",
    "The water was never quite still while {name} was near it this week.",
    "{name} escorted a fisherman's cat home along the {region} wall each dusk, then turned back with the tide.",
  ],
};

// ---------------------------------------------------------------------------
// Abilities — seeded pick of one passive (by class) and one ultimate (by
// element). Slots: {element} {trait} {class} {name}
// ---------------------------------------------------------------------------

export const CLASS_PASSIVES: Record<
  FantasyClass,
  ReadonlyArray<{ name: string; description: string }>
> = {
  Rogue: [
    { name: "Slip", description: "The first attack against {name} each encounter misses; they were never quite there." },
    { name: "Light Feet", description: "Ignores rough or unstable ground — rooftops, rubble and rails are treated as open road." },
    { name: "Pickpocket's Eye", description: "Spots the one loose, valuable or edible thing in any room within a heartbeat." },
  ],
  Mage: [
    { name: "Second Reading", description: "Sees the shape of a fight one beat early, and rarely needs to be told twice." },
    { name: "Still Room", description: "Presence lowers tempers nearby; open hostility takes a moment longer to start." },
    { name: "Ward Sense", description: "Feels {element} magic and hidden thresholds before crossing them." },
  ],
  Guardian: [
    { name: "Bulwark", description: "Any ally directly behind {name} takes reduced harm while {name} holds position." },
    { name: "Immovable", description: "Cannot be pushed, pulled or startled off a spot once {name} has chosen to hold it." },
    { name: "Head Count", description: "Always knows how many friendly creatures are near and whether one has gone missing." },
  ],
  Warrior: [
    { name: "Closing Speed", description: "Covers the first stretch of open ground faster than anything its size should." },
    { name: "No Bluff", description: "The warning lash of the tail lands as a real threat; nearby foes flinch first." },
    { name: "Second Wind", description: "Shrugs off the first serious hit and keeps moving forward." },
  ],
  Mystic: [
    { name: "Foreknowing", description: "Reacts to danger a moment before it is visible; ambushes rarely land clean." },
    { name: "Quiet Mind", description: "Immune to fear effects and to being goaded into a rushed move." },
    { name: "Listening", description: "Reads weather, rooms and silences for information others miss entirely." },
  ],
  Ranger: [
    { name: "Cover Instinct", description: "Is always within one bound of concealment, wherever the fight started." },
    { name: "Tracker", description: "Follows a trail hours cold and names what left it." },
    { name: "One Look", description: "Maps an unfamiliar place on first sight and never needs to again." },
  ],
  Bard: [
    { name: "Disarming", description: "Can defuse a hostile creature's first move with sheer charm once per encounter." },
    { name: "Everyone's Name", description: "Knows every local by name and one useful fact about each." },
    { name: "Crowd Cover", description: "Vanishes into any group of three or more creatures at will." },
  ],
  Sentinel: [
    { name: "The Watch", description: "Cannot be surprised from a held post; the first alarm is always {name}'s." },
    { name: "Long Vigil", description: "Suffers no penalty for going without sleep across a single long night." },
    { name: "Line of Sight", description: "Anything entering {name}'s watched ground is noted the instant it does." },
  ],
};

export const ELEMENT_ULTIMATES: Record<
  Element,
  ReadonlyArray<{ name: string; description: string }>
> = {
  Moon: [
    { name: "Full Silver", description: "Under open sky, {name} becomes hard to see and harder to hit until the next dawn." },
    { name: "Tidepull", description: "Draws every nearby creature's attention to a point of {name}'s choosing for one crucial moment." },
    { name: "Nightbloom", description: "Restores an ally to their feet with a slow, cold, moonlit second chance — once per night." },
  ],
  Solar: [
    { name: "Overburn", description: "Spends a day's banked warmth at once: a single, blinding, decisive burst of speed and force." },
    { name: "Long Afternoon", description: "Extends the daylight over a small area, denying cover to anything that relies on shadow." },
    { name: "Kindling", description: "Shares stored Solar warmth with allies, shrugging off cold, fear and fatigue for a spell." },
  ],
  Storm: [
    { name: "Break", description: "Calls the waiting weather down early — a single crash of wind and rain that scatters a line of foes." },
    { name: "Static Field", description: "Charges the air around {name}; the next creature to close the distance regrets it." },
    { name: "Eye of It", description: "Steps into a pocket of dead calm: no effects, no noise, no interference, for three breaths." },
  ],
  Ember: [
    { name: "Bank the Coals", description: "{name} refuses to go down; while any warmth remains in them, they keep fighting." },
    { name: "Flashpoint", description: "Turns a held position into open flame for a moment — nothing crosses {name}'s stone." },
    { name: "Hearthlight", description: "The warm glow steadies every ally who can see it, mending small hurts over time." },
  ],
  Frost: [
    { name: "Deep Freeze", description: "Locks the ground around a single target solid; they are going nowhere for a while." },
    { name: "Whiteout", description: "Raises a stinging veil of frost and grit that blinds pursuers and covers a retreat." },
    { name: "Killing Cold", description: "Draws the heat out of one blow entirely, then hands the chill back with interest." },
  ],
  Verdant: [
    { name: "Roothold", description: "Green things surge up at {name}'s call, snaring a foe or bracing an ally in place." },
    { name: "Overgrowth", description: "A patch of ground erupts into cover — a thicket where a second ago there was none." },
    { name: "Season Ahead", description: "Speeds an ally's recovery as if days had passed, all in the space of a rest." },
  ],
  Shadow: [
    { name: "Un-findable", description: "{name} and one ally simply cannot be located by any means until they choose to be." },
    { name: "Long Dusk", description: "Pulls the shadows of an area together into true dark that only {name} sees through." },
    { name: "The Quiet Way", description: "Opens a soundless path out of any enclosed space, used once, then gone." },
  ],
  Tide: [
    { name: "Slack Water", description: "Freezes the momentum of a fight for one held breath — nothing advances, nothing retreats." },
    { name: "Undertow", description: "Drags a single foe off their footing and out of position, no matter their size." },
    { name: "Turn of the Tide", description: "Reverses the last exchange: a hit that landed on an ally is unmade, once." },
  ],
};

export const DEFAULT_TRAIT = "quiet presence";
