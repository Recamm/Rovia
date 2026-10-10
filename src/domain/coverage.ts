import coverage from "../data/coverage.json";
import { contains } from "../../scripts/polygon.mjs";
export function inCoverage(lat: number, lng: number) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && contains(coverage, lng, lat)
  );
}
