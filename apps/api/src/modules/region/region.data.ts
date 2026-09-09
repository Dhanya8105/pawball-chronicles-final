/**
 * apps/api/src/modules/region/region.data.ts
 *
 * Rule tables for the Region Engine. No LLM: a real-world coordinate grid
 * cell + the CV surroundings labels deterministically select a biome, and
 * the biome + a per-cell seed select a fantasy name from that biome's pool.
 */

import type { Biome } from "@pawball/shared-types";

export const BIOMES: readonly Biome[] = [
  "woodland",
  "coast",
  "sanctum",
  "citadel",
  "highland",
  "grove",
  "shadowfen",
  "mistlands",
  "dawnreach",
  "wilds",
];

/**
 * CV surroundings label -> biome. Gemini Vision is constrained to a fixed
 * 17-label vocabulary — see SYSTEM_PROMPT in modules/capture/cv.service.ts —
 * and every one of those labels is mapped here. Labels are confidence-
 * sorted, so the first that appears here wins. The extra legacy keys
 * (trees, water, marketplace, ...) are kept so older stored data still
 * resolves.
 */
const SURROUNDING_TO_BIOME: Record<string, Biome> = {
  // --- CV vocabulary (cv.service.ts SYSTEM_PROMPT) ---
  temple: "sanctum",
  shrine: "sanctum",
  garden: "grove",
  park: "grove",
  forest: "woodland",
  beach: "coast",
  coast: "coast",
  alley: "citadel",
  street: "citadel",
  market: "citadel",
  indoor: "citadel",
  rooftop: "citadel",
  construction: "citadel",
  night: "shadowfen",
  rain: "mistlands",
  sunset: "dawnreach",
  snow: "highland",
  // --- legacy labels (pre-Gemini) ---
  trees: "woodland",
  water: "coast",
  "urban alley": "citadel",
  marketplace: "citadel",
  apartment: "citadel",
  cafe: "citadel",
  village: "citadel",
  mountain: "highland",
  flowers: "grove",
  fog: "mistlands",
  morning: "dawnreach",
};

export function biomeForSurroundings(labels: string[]): Biome {
  for (const label of labels) {
    const biome = SURROUNDING_TO_BIOME[label.toLowerCase()];
    if (biome) return biome;
  }
  return "wilds";
}

/**
 * Name pools per biome. A region name is `${adjective}${noun}` — the nouns
 * begin with a lowercase syllable so the two halves fuse into one word
 * before the space, e.g. "Whisper" + "leaf Hollow" -> "Whisperleaf Hollow".
 */
export const REGION_NAME_POOLS: Record<
  Biome,
  { adjectives: readonly string[]; nouns: readonly string[] }
> = {
  woodland: {
    adjectives: ["Whisper", "Fern", "Moss", "Elder", "Thorn", "Green", "Hush", "Bramble", "Root", "Silver"],
    nouns: ["leaf Hollow", "wood Vale", "grove Reach", "shade Thicket", "bark Glade", "root Warren", "song Copse", "wild Weald", "deep Wood", "fall Glen"],
  },
  coast: {
    adjectives: ["Salt", "Pearl", "Tide", "Gull", "Coral", "Foam", "Storm", "Blue", "Drift", "Wave"],
    nouns: ["break Shore", "glass Bay", "song Cove", "reach Strand", "fall Cliffs", "watch Harbor", "wind Lagoon", "light Point", "deep Sound", "far Isles"],
  },
  sanctum: {
    adjectives: ["Gold", "Moon", "Sun", "Quiet", "Ash", "Bright", "Old", "Still", "Hallow", "Grace"],
    nouns: ["lit Temple", "stone Shrine", "bell Sanctum", "vigil Cloister", "dawn Reliquary", "vow Chapel", "ember Altar", "song Basilica", "veil Monastery", "light Spire"],
  },
  citadel: {
    adjectives: ["Iron", "Lantern", "Cobble", "High", "Copper", "Grand", "Crooked", "Amber", "Market", "Bright"],
    nouns: ["gate Citadel", "stone Quarter", "lamp District", "bridge Ward", "clock Bazaar", "tile Rookery", "hearth Commons", "coin Exchange", "arch Terrace", "wall Precinct"],
  },
  highland: {
    adjectives: ["Cloud", "Granite", "Snow", "Eagle", "Wind", "Frost", "Stone", "Peak", "Cold", "Steep"],
    nouns: ["crest Reach", "spire Pass", "fang Ridge", "watch Summit", "howl Plateau", "stone Cairns", "sky Escarpment", "ice Saddle", "far Highlands", "edge Bluff"],
  },
  grove: {
    adjectives: ["Petal", "Sun", "Honey", "Bloom", "Dew", "Bright", "Wild", "Rose", "Gilded", "Soft"],
    nouns: ["bloom Garden", "nectar Court", "petal Terrace", "hum Orchard", "light Arbor", "song Parterre", "still Conservatory", "green Trellis", "dawn Meadow", "vine Walk"],
  },
  shadowfen: {
    adjectives: ["Dusk", "Raven", "Hollow", "Night", "Pale", "Silent", "Gloom", "Umbral", "Wan", "Deep"],
    nouns: ["mire Fen", "veil Marsh", "moth Bog", "shade Moor", "whisper Hollow", "star Swamp", "quiet Wetland", "ash Lowland", "dim Reach", "cold Slough"],
  },
  mistlands: {
    adjectives: ["Grey", "Cloud", "Veil", "Soft", "Drizzle", "Fog", "Hush", "Pale", "Rain", "Muted"],
    nouns: ["fall Mistlands", "veil Downs", "drift Moor", "cloud Basin", "rain Terraces", "shroud Vale", "damp Heath", "blur Lowlands", "mizzle Flats", "quiet Weald"],
  },
  dawnreach: {
    adjectives: ["Amber", "Rose", "First", "Ember", "Gold", "Waking", "Bright", "Warm", "Kindled", "Early"],
    nouns: ["light Reach", "glow Horizon", "dawn Steppe", "ray Plateau", "morning Expanse", "sun Threshold", "flare Meadow", "blush Prairie", "wake Basin", "gleam Verge"],
  },
  wilds: {
    adjectives: ["Far", "Lone", "Wander", "Open", "Free", "Old", "Trackless", "Wide", "Quiet", "Stray"],
    nouns: ["wild Reach", "stray Expanse", "roam Country", "edge Frontier", "lost Range", "far Steppe", "open Wold", "drift Plain", "still Waste", "long Wilds"],
  },
};

export const BIOME_DESCRIPTION_TEMPLATES: Record<Biome, readonly string[]> = {
  woodland: [
    "A close green country of old trees where the light falls in coins and every path doubles back on itself.",
    "Deep woodland, loud with birds at dawn and utterly silent by dusk, where the moss keeps its own maps.",
  ],
  coast: [
    "A bright edge of the world where the tide writes and erases the same sentence twice a day.",
    "Salt wind, worn stone and long water — a shore that remembers every ship it never saw.",
  ],
  sanctum: [
    "A quiet place of bells and worn steps, kept warm by candles no one admits to lighting.",
    "Old stone raised for old reasons, where the hush itself feels like it is listening back.",
  ],
  citadel: [
    "A crowded knot of lamplit streets and leaning roofs where every window is someone's whole world.",
    "Cobble, copper and noise — a place that never fully sleeps and never fully wakes.",
  ],
  highland: [
    "Thin cold air and enormous distance, where the wind has opinions and the stone keeps score.",
    "High broken country above the treeline, all ridgelines and weather and the long way down.",
  ],
  grove: [
    "A tended, sweet-smelling place of bloom and bee-hum, generous with shade and shorter than it looks.",
    "Ordered rows of flowers gone a little wild at the edges, warm underfoot even in the evening.",
  ],
  shadowfen: [
    "Low wet ground under a low grey sky, where the reeds move when there is no wind.",
    "A dim fen of black water and moth-light, patient and not unkind, but not welcoming either.",
  ],
  mistlands: [
    "Soft country under permanent cloud, where distance dissolves at forty paces and sound carries strangely.",
    "A muted land of drizzle and hush, every colour turned down one notch, every edge left unfinished.",
  ],
  dawnreach: [
    "Open ground that faces east and takes the first light — amber, unhurried, already warm by the time you wake.",
    "A wide waking country of long shadows and kindled grass, caught permanently in the hour after sunrise.",
  ],
  wilds: [
    "Unmapped, unclaimed and largely unbothered — country that has never needed a name until now.",
    "A trackless open reach where the horizon is the only landmark and it keeps its distance.",
  ],
};
