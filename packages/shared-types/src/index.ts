// packages/shared-types/src/index.ts
// Single source of truth for shapes shared between apps/web and apps/api.
// apps/api re-exports these for its Mongoose schema typing; apps/web uses
// them directly for API response typing. This is what keeps frontend/backend
// contract drift from silently happening.

export type BondLevel =
  | 'stranger'
  | 'acquaintance'
  | 'friend'
  | 'trusted_companion'
  | 'guardian'
  | 'legend';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type AgeGroup = 'kitten' | 'adult' | 'senior';

export type CaptureStatus =
  | 'pending_analysis'
  | 'analyzed'
  | 'generating_art'
  | 'complete'
  | 'failed';

export interface ConfidenceValue<T extends string = string> {
  label: T;
  /**
   * Real model confidence, 0-1. Never fabricated — null when no calibrated
   * confidence is available from the underlying model/heuristic, per the
   * "never invent confidence values" requirement.
   */
  confidence: number | null;
}

export interface CvAnalysisResult {
  isCat: boolean;
  confidence: number;
  breed: ConfidenceValue;
  pose: ConfidenceValue<
    'sitting' | 'sleeping' | 'running' | 'loaf' | 'standing' | 'unknown'
  >;
  faceOrientation: ConfidenceValue;
  eyeOpenness: ConfidenceValue<'open' | 'half' | 'closed'>;
  earOrientation: ConfidenceValue<'forward' | 'alert' | 'relaxed' | 'flat'>;
  tailVisible: boolean;
  coat: { color: string; pattern: string; confidence: number | null };
  estimatedAgeGroup: ConfidenceValue<AgeGroup>;
  surroundings: { label: string; confidence: number }[];
}

export interface AuraTrait {
  trait: string;
  sourceFeature: string;
  sourceValue: string;
}

export interface PawBallIdentity {
  fantasyName: string;
  title: string;
  class: string;
  rarity: Rarity;
  element: string;
}

export interface PawBallAbilities {
  passive: { name: string; description: string };
  ultimate: { name: string; description: string };
}

export type FantasyClass =
  | 'Rogue'
  | 'Mage'
  | 'Guardian'
  | 'Warrior'
  | 'Mystic'
  | 'Ranger'
  | 'Bard'
  | 'Sentinel';

export type Element =
  | 'Moon'
  | 'Solar'
  | 'Storm'
  | 'Ember'
  | 'Frost'
  | 'Verdant'
  | 'Shadow'
  | 'Tide';

export type Biome =
  | 'woodland'
  | 'coast'
  | 'sanctum'
  | 'citadel'
  | 'highland'
  | 'grove'
  | 'shadowfen'
  | 'mistlands'
  | 'dawnreach'
  | 'wilds';

export type MemoryType =
  | 'weekly_life'
  | 'bond_unlock'
  | 'title_earned'
  | 'seasonal_event';

/** The five card stats. Base value comes from the rarity tier, then a
 * seeded ±15 spread is applied per stat (see apps/api modules/lore). */
export interface PawBallStats {
  attack: number;
  defense: number;
  agility: number;
  spirit: number;
  wisdom: number;
}

export interface PawBallSummary {
  id: string;
  identity: PawBallIdentity;
  thumbnailUrl: string;
  bondLevel: BondLevel;
  breed: string;
  regionName: string;
  lastSeenAt: string; // ISO date
}

export interface PawBallDetail extends PawBallSummary {
  visualProfile: {
    breed: string;
    breedConfidence: number | null;
    coatColor: string;
    coatPattern: string;
    estimatedAgeGroup: AgeGroup;
  };
  abilities: PawBallAbilities;
  aura: { traits: string[]; derivedFrom: AuraTrait[] };
  bond: {
    level: BondLevel;
    levelNumeric: number;
    sightingCount: number;
    firstSeenAt: string;
    lastSeenAt: string;
  };
  artwork: { currentImageUrl: string };
  originalPhotoUrl: string;
  titlesEarned: { title: string; earnedAt: string; reason: string }[];
  stats: PawBallStats;
  loreText: string;
  favoriteRestingPlace: { lat: number; lng: number; label: string } | null;
}

export interface MapMarker {
  pawballId: string;
  lat: number;
  lng: number;
  thumbnailUrl: string;
  rarity: Rarity;
}

export interface MapMarkerDetail {
  pawballId: string;
  identity: PawBallIdentity;
  thumbnailUrl: string;
  artworkUrl: string;
  storySnippet: string;
  lat: number;
  lng: number;
  regionName: string;
  lastSeenAt: string;
  bondLevel: BondLevel;
}

// ---- Collection / Journal / Timeline (Milestone 4/5 read models) ----

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type CollectionSortBy = 'recent' | 'name' | 'rarity' | 'bond';

export interface CollectionQuery {
  q?: string;
  sortBy?: CollectionSortBy;
  rarity?: Rarity;
  breed?: string;
  regionId?: string;
  bondLevel?: BondLevel;
  page?: number;
  pageSize?: number;
}

export type CollectionResponse = Paginated<PawBallSummary>;

export interface CollectionStats {
  total: number;
  byRarity: Record<Rarity, number>;
  byBondLevel: Record<BondLevel, number>;
  byBreed: { breed: string; count: number }[];
  byRegion: { regionName: string; count: number }[];
}

export interface MemoryEntry {
  id: string;
  pawballId: string;
  type: MemoryType;
  text: string;
  occurredAt: string;
  createdAt: string;
}

export interface SightingRecord {
  id: string;
  pawballId: string | null;
  captureId: string;
  lat: number;
  lng: number;
  regionName: string;
  capturedAt: string;
  cvSnapshot: CvAnalysisResult | null;
}

export type TimelineItem =
  | ({ kind: 'sighting' } & SightingRecord)
  | ({ kind: 'memory' } & MemoryEntry);

export type TimelineResponse = Paginated<TimelineItem>;

export interface JournalGroup {
  pawballId: string;
  pawballName: string;
  thumbnailUrl: string;
  entries: MemoryEntry[];
}

export interface JournalResponse {
  groups: JournalGroup[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RegionInfo {
  id: string;
  fantasyName: string;
  description: string;
  biome: Biome;
}

export interface CaptureResponse {
  captureId: string;
  status: CaptureStatus;
}

export interface CaptureRecord {
  _id: string;
  ownerId: string;
  status: CaptureStatus;
  originalImageUrl: string;
  location: { lat: number; lng: number };
  capturedAt: string;
  cvResult: CvAnalysisResult | null;
  generatedArtUrl: string | null;
  error: { stage: string; message: string } | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CaptureListResponse {
  items: CaptureRecord[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- Auth (Milestone 2) ----

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

export interface ApiError {
  code: string;
  message: string;
  retryAfterSeconds?: number;
  stage?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}
