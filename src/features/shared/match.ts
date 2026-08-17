/** Fuzzy name matching shared by booking / hotel / course chat flows. */

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

/** Length of the longest common substring of a and b. */
function longestCommonSubstring(a: string, b: string): number {
  let best = 0;
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev + 1;
        if (dp[j] > best) best = dp[j];
      } else {
        dp[j] = 0;
      }
      prev = tmp;
    }
  }
  return best;
}

/**
 * The one item whose name overlaps the text best, or null if nothing overlaps
 * enough (`minLen`) or two items tie for best (ambiguous — the bot should ask).
 * Uses longest-common-substring so a partial Thai name like "โยคะ" still matches
 * "คอร์สโยคะเบื้องต้น", while "นวด" alone (too short) stays ambiguous.
 */
export function uniqueBestMatch<T>(
  text: string,
  items: T[],
  getName: (item: T) => string,
  minLen = 4,
): T | null {
  const n = normalize(text);
  let best = 0;
  let bestItem: T | null = null;
  let tie = false;
  for (const item of items) {
    const score = longestCommonSubstring(n, normalize(getName(item)));
    if (score > best) {
      best = score;
      bestItem = item;
      tie = false;
    } else if (score === best && best > 0) {
      tie = true;
    }
  }
  if (best < minLen || tie) return null;
  return bestItem;
}
