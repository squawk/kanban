/** Columns on different boards match by name, ignoring case and extra spaces. */
export function columnKey(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}
