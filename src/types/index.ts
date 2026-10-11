export type Visibility = "public" | "friends" | "private";
export type Category =
  | "cafe"
  | "bar"
  | "restaurant"
  | "ice_cream"
  | "bakery"
  | "pastry"
  | "fast_food";
export type Place = {
  id: string;
  name: string;
  category: Category;
  lat: number;
  lng: number;
  address: string | null;
  area: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  opening_hours: string | null;
  timezone: string;
  price_level: number | null;
  source: string;
  external_type: string;
  external_id: string;
  imported_at: string;
  closed: boolean;
  archived_at?: string | null;
  rating: number | null;
  review_count: number;
  distance_m?: number;
  tags?: Record<string, string>;
};
export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  bio: string | null;
  visibility: Visibility;
  visit_visibility: Visibility;
};
export type Review = {
  id: string;
  user_id: string;
  place_id: string;
  rating: number;
  comment: string;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
  hidden: boolean;
  archived?: boolean;
  profiles?: Pick<Profile, "id" | "username" | "display_name">;
  places?: Pick<Place, "id" | "name" | "category">;
  review_photos?: { id: string; path: string; thumbnail_path: string }[];
  likes?: { user_id: string }[];
};
export type RoviaList = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  visibility: Visibility;
  created_at: string;
  list_places?: { place_id: string; places?: Place }[];
  list_members?: {
    user_id: string;
    role: "editor" | "reader";
    status: "pending" | "accepted";
    profiles?: Pick<Profile, "username" | "display_name">;
  }[];
};
export type Filters = {
  categories: Category[];
  rating: number;
  price: string;
  radius: number;
  open: boolean;
};
export type MapScope = "all" | "mine";
export type PersonalFilter =
  "all" | "saved" | "want" | "visited" | "reviewed" | "lists";
export type PlaceSuggestion = {
  id: string;
  user_id: string;
  name: string;
  category: Category;
  lat: number;
  lng: number;
  address: string;
  area: string;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  opening_hours: string | null;
  explanation: string | null;
  status: "pending" | "approved" | "rejected";
  place_id: string | null;
  decision_reason: string | null;
  created_at: string;
};
export type Bounds = {
  south: number;
  west: number;
  north: number;
  east: number;
  lat: number;
  lng: number;
};
export type Notification = {
  id: string;
  kind: string;
  actor_id: string;
  reference_id: string | null;
  read_at: string | null;
  created_at: string;
};
export type Post = {
  id: string;
  user_id: string;
  place_id: string;
  visited_on: string;
  description: string;
  rating: number | null;
  visibility: Visibility;
  hidden: boolean;
  created_at: string;
  profiles?: Pick<Profile, "id" | "username" | "display_name">;
  places?: Pick<Place, "id" | "name" | "category">;
  post_photos?: { id: string; path: string; thumbnail_path: string }[];
  post_likes?: { user_id: string }[];
};
