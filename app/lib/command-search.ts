/**
 * Ranking for the command palette (⌘K): finds cards, boards and actions from a
 * typed query. Every word of the query has to appear somewhere in the item; titles
 * rank above other fields, and a match at the start of a word ranks above one in
 * the middle. Pure and unit tested.
 */

export interface Searchable {
  /** The main label (card title, board name, action name) */
  title: string;
  /** Other text that should match: notes, tags, board, column, assignee, keywords */
  extra?: (string | null | undefined)[];
}

export interface Ranked<T> {
  item: T;
  score: number;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, ""); // "Café" matches "cafe"

export function queryWords(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

/** 0 when `word` isn't in `text`; otherwise higher for better positions. */
function wordScore(text: string, word: string): number {
  const at = text.indexOf(word);
  if (at === -1) return 0;
  if (at === 0) return 3; // start of the text
  // Start of a later word ("launch" in "Draft Q4 launch")
  if (new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text)) return 2;
  return 1;
}

/** Score an item against the query words; 0 means it doesn't match. */
export function scoreItem(item: Searchable, words: string[]): number {
  if (words.length === 0) return 1;
  const title = normalize(item.title);
  const extra = normalize((item.extra ?? []).filter(Boolean).join(" \u0000 "));
  let total = 0;
  for (const word of words) {
    const inTitle = wordScore(title, word);
    const inExtra = wordScore(extra, word);
    if (!inTitle && !inExtra) return 0; // every word has to match somewhere
    total += inTitle ? 10 + inTitle * 3 : inExtra;
  }
  // The whole query typed as-is at the start of the title is the best match of all
  if (title.startsWith(words.join(" "))) total += 20;
  return total;
}

/** Items matching the query, best first (stable for ties), at most `limit`. */
export function rankItems<T extends Searchable>(items: T[], query: string, limit = Infinity): Ranked<T>[] {
  const words = queryWords(query);
  return items
    .map((item, i) => ({ item, score: scoreItem(item, words), i }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map(({ item, score }) => ({ item, score }));
}

/**
 * Split `text` into plain and highlighted parts for the query words, so the
 * palette can show why each result matched.
 */
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const words = queryWords(query);
  if (words.length === 0) return [{ text, match: false }];
  const lower = normalize(text);
  // normalize() can change length for some characters; fall back to no highlight then
  if (lower.length !== text.length) return [{ text, match: false }];
  const marks = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    let from = 0;
    for (let at = lower.indexOf(word, from); at !== -1; at = lower.indexOf(word, from)) {
      for (let i = at; i < at + word.length; i++) marks[i] = true;
      from = at + word.length;
    }
  }
  const parts: { text: string; match: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.match === marks[i]) last.text += text[i];
    else parts.push({ text: text[i], match: marks[i] });
  }
  return parts;
}
