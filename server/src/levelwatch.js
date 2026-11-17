// Finds level ups from the levels TikTok sends with every gift, chat and like, for when TikTok does not
// send its own level-up message to the web (tiktok.js mapTikTokLevelUp).
// Someone seen at gifter level 30 and later at 31 in the same connection went up a level. Only levels seen
// in this connection count: a level remembered from an earlier live may have gone up between lives, and
// that is not news now. The highest level seen is kept, so a message carrying an older, lower level does
// not make the next one look like a level up.
// Each level up is announced once, whether TikTok's own message or the levels on a message came first.
export function createLevelWatch() {
  const highest = new Map();
  const announced = new Set();

  const key = (user, kind) => `${user.id}:${kind}`;

  // Records that this level up was shown (from TikTok's own message). Returns false if it already was.
  function claim(user, kind, level) {
    if (!user?.id) return true;
    const tag = `${key(user, kind)}:${level}`;
    if (announced.has(tag)) return false;
    announced.add(tag);
    if (announced.size > 5000) announced.clear();
    highest.set(key(user, kind), Math.max(highest.get(key(user, kind)) || 0, level));
    return true;
  }

  // The level ups shown by this user's levels on a message: [{ kind, level }], usually none.
  function check(user) {
    if (!user?.id) return [];
    const found = [];
    for (const [kind, level] of [["gifter", Number(user.gifterLevel) || 0], ["fan", Number(user.fanLevel) || 0]]) {
      if (!level) continue;
      const before = highest.get(key(user, kind)) || 0;
      if (level <= before) continue;
      highest.set(key(user, kind), level);
      if (before && claim(user, kind, level)) found.push({ kind, level });
    }
    return found;
  }

  // A new connection starts over.
  function clear() {
    highest.clear();
    announced.clear();
  }

  return { check, claim, clear };
}
