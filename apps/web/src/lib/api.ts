/**
 * apps/web/src/lib/api.ts
 *
 * Typed fetch wrapper over the PawBall API. Knows the
 * `{ success, data?, error? }` envelope, attaches the bearer token, and on
 * a 401 does exactly one refresh-and-retry before clearing the session.
 * All endpoint groups (auth / captures / collection / pawballs / map) are
 * exported as small typed namespaces so pages never build URLs by hand.
 */

"use client";

import type {
  ApiResponse,
  AuthResponse,
  AuthTokens,
  CaptureListResponse,
  CaptureRecord,
  CaptureResponse,
  CollectionResponse,
  CollectionStats,
  MapMarker,
  MapMarkerDetail,
  MemoryEntry,
  Paginated,
  PawBallDetail,
  PublicUser,
  SightingRecord,
  TimelineItem,
} from "@pawball/shared-types";
import { authSession } from "./store";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  let body: ApiResponse<T>;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError("BAD_RESPONSE", `Server returned ${res.status}`, res.status);
  }
  if (!res.ok || !body.success || body.data === undefined) {
    throw new ApiError(
      body.error?.code ?? "UNKNOWN_ERROR",
      body.error?.message ?? `Request failed (${res.status})`,
      res.status
    );
  }
  return body.data;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  query?: Record<string, string | number | undefined>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function send<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!isForm && opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (opts.auth) {
    const { accessToken } = authSession.get();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? "GET",
    headers,
    body: isForm
      ? (opts.body as FormData)
      : opts.body !== undefined
        ? JSON.stringify(opts.body)
        : undefined,
  });

  if (opts.auth && res.status === 401) {
    const retried = await refreshAndRetry<T>(path, opts, headers, isForm);
    if (retried.ok) return retried.data as T;
  }

  return unwrap<T>(res);
}

async function refreshAndRetry<T>(
  path: string,
  opts: RequestOptions,
  headers: Record<string, string>,
  isForm: boolean
): Promise<{ ok: boolean; data?: T }> {
  const { refreshToken } = authSession.get();
  if (!refreshToken) {
    authSession.clear();
    return { ok: false };
  }
  try {
    const tokens = await send<AuthTokens>("/auth/refresh", {
      method: "POST",
      body: { refreshToken },
    });
    authSession.setTokens(tokens.accessToken, tokens.refreshToken);
    const res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers: { ...headers, Authorization: `Bearer ${tokens.accessToken}` },
      body: isForm
        ? (opts.body as FormData)
        : opts.body !== undefined
          ? JSON.stringify(opts.body)
          : undefined,
    });
    return { ok: true, data: await unwrap<T>(res) };
  } catch {
    authSession.clear();
    return { ok: false };
  }
}

// --- endpoint groups -----------------------------------------------------

export const auth = {
  register: (input: { email: string; password: string; displayName: string }) =>
    send<AuthResponse>("/auth/register", { method: "POST", body: input }),
  login: (input: { email: string; password: string }) =>
    send<AuthResponse>("/auth/login", { method: "POST", body: input }),
  logout: (refreshToken: string) =>
    send<{ loggedOut: boolean }>("/auth/logout", {
      method: "POST",
      body: { refreshToken },
    }),
  me: () => send<PublicUser>("/auth/me", { auth: true }),
};

export const captures = {
  create: (form: FormData) =>
    send<CaptureResponse>("/captures", { method: "POST", body: form, auth: true }),
  get: (id: string) => send<CaptureRecord>(`/captures/${id}`, { auth: true }),
  list: (page = 1) =>
    send<CaptureListResponse>("/captures", { auth: true, query: { page } }),
};

export interface CollectionListParams {
  q?: string;
  sortBy?: string;
  rarity?: string;
  breed?: string;
  regionId?: string;
  bondLevel?: string;
  page?: number;
  pageSize?: number;
}

export const collection = {
  list: (params: CollectionListParams = {}) =>
    send<CollectionResponse>("/collection", {
      auth: true,
      query: params as Record<string, string | number | undefined>,
    }),
  stats: () => send<CollectionStats>("/collection/stats", { auth: true }),
};

export const pawballs = {
  get: (id: string) => send<PawBallDetail>(`/pawballs/${id}`, { auth: true }),
  timeline: (id: string, page = 1, pageSize = 20) =>
    send<Paginated<TimelineItem>>(`/pawballs/${id}/timeline`, {
      auth: true,
      query: { page, pageSize },
    }),
  sightings: (id: string, page = 1, pageSize = 20) =>
    send<Paginated<SightingRecord>>(`/pawballs/${id}/sightings`, {
      auth: true,
      query: { page, pageSize },
    }),
  memories: (id: string, page = 1, pageSize = 20, type?: string) =>
    send<Paginated<MemoryEntry>>(`/pawballs/${id}/memories`, {
      auth: true,
      query: { page, pageSize, type },
    }),
};

export const map = {
  markers: (bbox: [number, number, number, number]) =>
    send<MapMarker[]>("/map/markers", { auth: true, query: { bbox: bbox.join(",") } }),
  marker: (pawballId: string) =>
    send<MapMarkerDetail>(`/map/markers/${pawballId}`, { auth: true }),
};

export const api = { auth, captures, collection, pawballs, map };
