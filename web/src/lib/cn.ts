// Minimal classname combiner. Filters falsy values and joins with spaces.
// Kept dependency-free on purpose.
export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
