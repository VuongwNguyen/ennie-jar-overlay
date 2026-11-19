// What each TikTok gift costs and looks like, so the control page can offer the gifts of a level by price and
// with their picture. Three sources, the later ones filling in and correcting the earlier:
// - gift-seed.json, shipped with the app: TikTok's gift list for Vietnam as a live page loaded it in November 2026
//   (about 760 gifts with price and picture), so a new install can pick gifts before its first live;
// - TikTok's own gift list, fetched once a day while connected to a live (tiktok.js);
// - every gift that comes in, which carries its price and picture.
// Kept in data/gift-catalog.json. Names are shown in Vietnamese where gift-names.js has them.
import path from "node:path";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { giftList, vietnameseGiftName } from "./gift-names.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const seedFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "gift-seed.json");
const isUrl = value => /^https?:\/\//i.test(String(value ?? ""));

export function createGiftCatalog(dataDir) {
  const file = path.join(dataDir, "gift-catalog.json");
  const gifts = new Map(); // id -> { id, name (as TikTok sent it), coins, image }
  let fetchedAt = 0, saveTimer = null;

  // Adds what is known about one gift; a value already known is only replaced by a real one.
  function learn({ id, name, coins, image }) {
    id = String(id ?? "");
    if (!/^\d+$/.test(id)) return false;
    const known = gifts.get(id) ?? { id, name: "", coins: 0, image: "" };
    const next = {
      id,
      name: String(name || known.name || "").slice(0, 60),
      coins: Number(coins) > 0 ? Math.round(Number(coins)) : known.coins,
      image: isUrl(image) ? String(image) : known.image
    };
    if (JSON.stringify(next) === JSON.stringify(known)) return false;
    gifts.set(id, next);
    return true;
  }

  async function load() {
    try {
      for (const gift of JSON.parse(await readFile(seedFile, "utf8"))) learn(gift);
    } catch (err) {
      console.error("Gift seed:", err.message);
    }
    try {
      const saved = JSON.parse(await readFile(file, "utf8"));
      fetchedAt = Number(saved.fetchedAt) || 0;
      for (const gift of saved.gifts ?? []) learn(gift);
    } catch { /* none yet */ }
  }

  // Written a little after the last change, as one file.
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await mkdir(dataDir, { recursive: true });
        await writeFile(`${file}.tmp`, JSON.stringify({ fetchedAt, gifts: [...gifts.values()] }), "utf8");
        await rename(`${file}.tmp`, file);
      } catch (err) {
        console.error("Gift catalogue:", err.message);
      }
    }, 2000);
  }

  // A gift that came in (server/src/index.js); `name` is TikTok's name, before it is put in Vietnamese.
  function fromGift(gift, tiktokName) {
    if (learn({ id: gift.id, name: tiktokName, coins: gift.diamondCount, image: gift.image })) saveSoon();
  }

  // TikTok's gift list for the room (webcast gift/list): fields have moved between versions, so each is looked
  // for under the names it has had.
  function fromTikTok(list) {
    if (!Array.isArray(list)) return;
    let changed = false;
    for (const gift of list) {
      const image = gift?.image?.url_list?.[0] ?? gift?.image?.urlList?.[0] ?? gift?.icon?.url_list?.[0] ?? gift?.icon?.urlList?.[0];
      changed = learn({ id: gift?.id, name: gift?.name, coins: gift?.diamond_count ?? gift?.diamondCount, image }) || changed;
    }
    fetchedAt = Date.now();
    saveSoon();
    if (changed) console.log(`Gift catalogue: ${gifts.size} gifts`);
  }
  const wantsTikTokList = () => Date.now() - fetchedAt > DAY_MS;

  // Everything known, with Vietnamese names; gifts named in gift-names.js are listed even without a price.
  function list() {
    const out = new Map();
    for (const gift of giftList()) out.set(gift.id, { id: gift.id, name: gift.name, coins: 0, image: "" });
    for (const gift of gifts.values()) {
      out.set(gift.id, { id: gift.id, name: vietnameseGiftName(gift.id, gift.name) || gift.name || gift.id, coins: gift.coins, image: gift.image });
    }
    return [...out.values()].filter(gift => gift.name);
  }

  return { load, fromGift, fromTikTok, wantsTikTokList, list };
}
