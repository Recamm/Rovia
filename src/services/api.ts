import type {
  Bounds,
  Filters,
  Place,
  Review,
  RoviaList,
  Profile,
  Visibility,
  MapScope,
  PersonalFilter,
} from "../types";
import { db, configured, fail } from "./supabase";
import { distance, openState } from "../domain/rules";
export type Catalog = {
  area: string;
  imported_at: string;
  coverage: string;
  places: Place[];
  source: string;
};
export async function catalog(signal?: AbortSignal): Promise<Catalog> {
  const r = await fetch("/catalog.json", { signal });
  if (!r.ok)
    throw new Error("No pudimos cargar el catálogo. Intentá nuevamente.");
  return r.json();
}
export async function searchPlaces(
  b: Bounds,
  filters: Filters,
  text: string,
  signal?: AbortSignal,
  mapScope: MapScope = "all",
  personalFilter: PersonalFilter = "all",
  listId: string | null = null,
): Promise<Place[]> {
  let rows: Place[];
  if (configured) {
    let request = db().rpc("map_places", {
      south: b.south,
      west: b.west,
      north: b.north,
      east: b.east,
      center_lat: b.lat,
      center_lng: b.lng,
      search: text,
      cats: filters.categories,
      min_rating: filters.rating,
      price: filters.price ? Number(filters.price) : null,
      radius: filters.radius || null,
      map_scope: mapScope,
      personal_filter: personalFilter,
      list_id: listId,
    });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    fail(error);
    rows = data as Place[];
  } else {
    if (mapScope === "mine") return [];
    const snapshot = await catalog(signal);
    rows = snapshot.places
      .filter(
        (p) =>
          !p.closed &&
          !p.archived_at &&
          p.lat >= b.south &&
          p.lat <= b.north &&
          p.lng >= b.west &&
          p.lng <= b.east,
      )
      .filter(
        (p) =>
          !text ||
          [p.name, p.address, p.area, p.category]
            .join(" ")
            .toLocaleLowerCase()
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .includes(
              text
                .toLocaleLowerCase()
                .normalize("NFD")
                .replace(/\p{Diacritic}/gu, ""),
            ),
      )
      .filter(
        (p) =>
          !filters.categories.length || filters.categories.includes(p.category),
      )
      .filter((p) => !filters.rating || (p.rating ?? 0) >= filters.rating)
      .filter((p) => !filters.price || p.price_level === Number(filters.price))
      .map((p) => ({ ...p, distance_m: distance(b.lat, b.lng, p.lat, p.lng) }))
      .filter((p) => !filters.radius || p.distance_m <= filters.radius)
      .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
  }
  return rows
    .filter((p) => !filters.open || openState(p) === "open")
    .slice(0, 200);
}
export async function placeById(id: string): Promise<Place | null> {
  if (!configured)
    return (await catalog()).places.find((p) => p.id === id) ?? null;
  const { data, error } = await db()
    .from("places")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  fail(error);
  if (!data) return null;
  if (data.merged_into) return placeById(data.merged_into as string);
  const { data: rating, error: e } = await db().rpc("public_rating", {
    pid: id,
  });
  fail(e);
  return { ...data, ...rating?.[0] } as Place;
}
export async function reviewsFor(id: string) {
  if (!configured) return [];
  const { data, error } = await db()
    .from("reviews")
    .select(
      "*,profiles!reviews_user_id_fkey(id,username,display_name),review_photos(id,path,thumbnail_path),likes(user_id)",
    )
    .eq("place_id", id)
    .eq("archived", false)
    .order("created_at", { ascending: false })
    .limit(50);
  fail(error);
  return data as Review[];
}
export async function ownLists() {
  const ids = (await rpc("my_list_ids", {})) as string[];
  if (!ids.length) return [];
  const { data, error } = await db()
    .from("lists")
    .select(
      "*,list_places(place_id,places(*)),list_members(user_id,role,status,profiles(username,display_name))",
    )
    .in("id", ids)
    .order("created_at", { ascending: false })
    .limit(100);
  fail(error);
  const lists = data as RoviaList[];
  const rows = lists.flatMap(
    (l) => l.list_places?.flatMap((i) => (i.places ? [i.places] : [])) ?? [],
  );
  const rated = await withRatings(rows);
  const byId = new Map(rated.map((p) => [p.id, p]));
  return lists.map((l) => ({
    ...l,
    list_places: l.list_places?.map((i) => ({
      ...i,
      places: byId.get(i.place_id),
    })),
  }));
}
export async function withRatings(places: Place[]) {
  if (!places.length || !configured) return places;
  const ratings = new Map<string, Place>();
  const ids = [...new Set(places.map((p) => p.id))];
  for (let i = 0; i < ids.length; i += 200) {
    const rows = (await rpc("place_summaries", {
      ids: ids.slice(i, i + 200),
    })) as Place[];
    rows.forEach((p) => ratings.set(p.id, p));
  }
  return places.map((p) => ratings.get(p.id) ?? p);
}
export async function saveReview(
  placeId: string,
  rating: number,
  comment: string,
  visibility: Visibility,
  id?: string,
) {
  const query = id
    ? db()
        .from("reviews")
        .update({ rating, comment: comment.trim(), visibility })
        .eq("id", id)
    : db().from("reviews").insert({
        place_id: placeId,
        rating,
        comment: comment.trim(),
        visibility,
      });
  const { data, error } = await query.select().single();
  fail(error);
  return data as Review;
}
export async function toggle(
  table: "saved_places" | "want_places" | "likes" | "follows",
  key: string,
  id: string,
  active: boolean,
  userId: string,
) {
  const userKey = table === "follows" ? "follower_id" : "user_id";
  if (active) {
    const { error } = await db()
      .from(table)
      .delete()
      .eq(userKey, userId)
      .eq(key, id);
    fail(error);
    return;
  }
  let error;
  if (table === "follows") {
    ({ error } = await db()
      .from("follows")
      .insert({ follower_id: userId, followed_id: id }));
  } else if (table === "likes") {
    ({ error } = await db()
      .from("likes")
      .insert({ user_id: userId, review_id: id }));
  } else {
    ({ error } = await db()
      .from(table)
      .insert({ user_id: userId, place_id: id }));
  }
  fail(error);
}
export async function signedPhoto(path: string, bucket = "review-photos") {
  const { data, error } = await db()
    .storage.from(bucket)
    .createSignedUrl(path, 60);
  fail(error);
  return data?.signedUrl ?? null;
}
export async function publicProfile(id: string) {
  const { data, error } = await db().rpc("profile_get", { uid: id });
  fail(error);
  return data as Profile & {
    accessible: boolean;
    friends: number | null;
    followers: number | null;
    following: number | null;
  };
}
export async function people(query: string) {
  const { data, error } = await db()
    .from("profiles")
    .select("*")
    .or(
      `username.ilike.%${query.replace(/[^\p{L}\p{N}_ ]/gu, "")}%,display_name.ilike.%${query.replace(/[^\p{L}\p{N}_ ]/gu, "")}%`,
    )
    .order("username")
    .limit(30);
  fail(error);
  return data as Profile[];
}
export async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await db().rpc(name, args);
  fail(error);
  return data;
}
export async function deleteRow(table: string, key: string, id: string) {
  const { error } = await db().from(table).delete().eq(key, id);
  fail(error);
}
