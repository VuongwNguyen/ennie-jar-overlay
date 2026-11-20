import { TikTokLiveConnection, WebcastEvent, ControlEvent } from "tiktok-live-connector";

const firstUrl = img => {
  const list = img?.url ?? img?.urlList ?? img?.url_list ?? img?.urls;
  return Array.isArray(list) && typeof list[0] === "string" ? list[0] : "";
};

const giftImage = (details, data) =>
  details.giftImage?.giftPictureUrl ||
  firstUrl(details.image) || firstUrl(details.icon) || firstUrl(details.previewImage) ||
  firstUrl(data.extendedGiftInfo?.image) || firstUrl(data.extendedGiftInfo?.icon) || "";

// Maps a raw TikTok gift message to the normalized gift contract (see README).
// Returns null while a streak is still in progress: only the final event of a
// streak (or a non-streakable gift) carries the count that should be credited.
export function mapTikTokGift(data) {
  const details = data.giftDetails ?? data.gift ?? {};
  const giftType = Number(details.giftType ?? details.type);
  if (giftType === 1 && !data.repeatEnd) return null;

  const user = data.user ?? {};
  const giftId = String(data.giftId ?? details.id ?? "gift");
  const userId = String(user.userId || user.id || user.uniqueId || "anonymous");
  const msgId = data.common?.msgId ?? data.event?.msgId ?? data.msgId;
  return {
    type: "gift",
    eventId: msgId
      ? `tt-${msgId}`
      : `tt-${userId}-${data.groupId ?? ""}-${giftId}-${data.repeatCount ?? 1}-${data.repeatEnd ? 1 : 0}`,
    user: {
      id: userId,
      uniqueId: String(user.uniqueId || user.displayId || ""),
      nickname: user.nickname || user.uniqueId || user.displayId || "Người xem",
      avatar: firstUrl(user.profilePicture) || firstUrl(user.avatarThumb) || firstUrl(user.avatarMedium),
      ...userLevels(user)
    },
    gift: {
      id: giftId,
      name: details.giftName ?? details.name ?? data.extendedGiftInfo?.name ?? "Quà tặng",
      image: giftImage(details, data),
      diamondCount: Number(details.diamondCount ?? data.extendedGiftInfo?.diamond_count) || 0,
      repeatCount: Number(data.repeatCount) || 1,
      repeatEnd: true
    },
    timestamp: Date.now()
  };
}

// The two levels shown on a user's badges, read from the badge list: scene 8 is the gifter level
// (USER_GRADE) and scene 10 the team heart level in this streamer's fan club (FANS), with the club's
// name. 0 when there is no such badge. Seen on real lives: the gifter level comes with joins, gifts and
// chat; the team heart level with gifts and chat but not with joins.
const GIFTER_BADGE = 8, FAN_BADGE = 10;
export function userLevels(user) {
  let gifterLevel = 0, fanLevel = 0, fanClub = "";
  for (const badge of user?.badgeList ?? []) {
    const level = Number(badge?.privilegeLogExtra?.level) || 0;
    if (badge?.sceneType === GIFTER_BADGE) gifterLevel = Math.max(gifterLevel, level);
    if (badge?.sceneType === FAN_BADGE) {
      fanLevel = Math.max(fanLevel, level);
      fanClub ||= badge?.text?.defaultPattern || "";
    }
  }
  fanLevel ||= Number(user?.fansClub?.data?.level) || 0;
  return { gifterLevel, fanLevel, fanClub };
}

// A name with something visible in it: letters, digits, emoji or symbols in any script. A name of only
// spaces or invisible characters is replaced by the @name, so it still shows on the frame.
const visible = text => /[\p{L}\p{N}\p{S}\p{P}]/u.test(String(text ?? ""));

// Who someone is, from any TikTok message that carries a user. Nobody is skipped for their name: with
// no usable name at all, someone who has an id is shown as "Người xem".
export function mapTikTokUser(user) {
  const hasId = Boolean(user?.userId || user?.id || user?.uniqueId || user?.displayId);
  const nickname = [user?.nickname, user?.uniqueId, user?.displayId].find(visible) || (hasId ? "Người xem" : "");
  if (!nickname) return null;
  return {
    // Newer TikTok messages name these id and displayId; older ones userId and uniqueId.
    id: String(user.userId || user.id || user.uniqueId || nickname),
    // The @name shown on the profile, which is what people type when they pick someone.
    uniqueId: String(user.uniqueId || user.displayId || ""),
    nickname,
    avatar: firstUrl(user.profilePicture) || firstUrl(user.avatarThumb) || firstUrl(user.avatarMedium),
    ...userLevels(user)
  };
}

// Maps a raw TikTok "member" message (a viewer joining the live) to { user }.
export function mapTikTokMember(data) {
  const user = mapTikTokUser(data?.user);
  return user ? { type: "member", user } : null;
}

// Fan club (team heart) members from level 20 up do not get a "member" message when they come in: TikTok
// shows them a "high-level fan joined" banner instead, sent as a barrage message with subType
// "fans_entrance". Seen on real lives: every entry of two fans at levels 21 and 23 came this way, and none
// as a member message; fans below 20 still come as member messages. The user is inside the banner's text
// pieces, with their team heart badge. Its message type is 11 (FANS_LEVEL_ENTRANCE, below).
// Super Fans (paid monthly subscribers) get a banner of their own when they come in, keyed
// "ttlive_superfan_commentnotif_superfanjoined"; the library also sends it as "superFanJoin".
// Guardians (Hộ vệ) come in with a banner of their own too: scene and subType "guardian_entrance", key
// "pm_mt_alp_join_animation_1New". Seen on a real live: 7 guardian entries, each only as this banner,
// never as a member message.
const SUPER_FAN_BANNER = /superfan_commentnotif_superfanjoined/i;
const JOIN_BANNER = /^pm_mt_fan_live_join|superfan_commentnotif_superfanjoined/i;
const GUARDIAN_ENTRANCE = "guardian_entrance";
const bannerKeys = data => [data?.content?.key, data?.content?.displayType, data?.commonBarrageContent?.key, data?.commonBarrageContent?.displayType];
// The first user in the banner's text pieces (named pieces or piecesList, depending on the decoder).
const bannerUser = text => (text?.pieces ?? text?.piecesList ?? []).find(piece => piece?.userValue?.user)?.userValue?.user;
// Entrance banners by their message type (msgType), as tiktok-live-proto names them
// (BarrageMessageBarrageType): 9 is GRADE_USER_ENTRANCE_NOTIFICATION, someone with a high gifter level coming
// in, with the level and the user in userGradeParam; 11 is FANS_LEVEL_ENTRANCE, the high-level fan above, with
// fansLevelParam; 15 is ENIGMA_ENTRANCE, someone coming in with their identity hidden.
const GRADE_ENTRANCE = 9, FANS_LEVEL_ENTRANCE = 11, ENIGMA_ENTRANCE = 15;
const ENTRANCE_TYPES = new Set([GRADE_ENTRANCE, FANS_LEVEL_ENTRANCE, ENIGMA_ENTRANCE]);
// Any other entrance banner TikTok may have for some viewers is caught too: a subType or scene ending in
// "_entrance", or a key about someone joining (not the fan club or a team), with a user in it. The first time a
// kind not listed above turns up it is written to the server's log, so it can be named here.
const ANY_ENTRANCE = /_entrance$/i;
const ANY_JOIN_KEY = /join/i, NOT_A_ROOM_JOIN = /club|team|group|follow|linkmic|battle/i;
const reportedEntrances = new Set();
export function mapTikTokFanJoin(data) {
  const type = Number(data?.msgType);
  const guardian = data?.subType === GUARDIAN_ENTRANCE || data?.scene === GUARDIAN_ENTRANCE;
  const keys = bannerKeys(data).filter(Boolean).map(String);
  const known = guardian || ENTRANCE_TYPES.has(type) || data?.subType === "fans_entrance" || keys.some(key => JOIN_BANNER.test(key));
  const other = !known && (ANY_ENTRANCE.test(data?.subType ?? "") || ANY_ENTRANCE.test(data?.scene ?? "")
    || keys.some(key => ANY_JOIN_KEY.test(key) && !NOT_A_ROOM_JOIN.test(key)));
  if (!known && !other) return null;
  const param = type === GRADE_ENTRANCE ? data.userGradeParam : type === FANS_LEVEL_ENTRANCE ? data.fansLevelParam : null;
  const user = mapTikTokUser(param?.user ?? bannerUser(data.commonBarrageContent) ?? bannerUser(data.content) ?? data.user);
  if (!user) return null;
  if (other) {
    const kind = `msgType=${data?.msgType ?? "-"} subType=${data?.subType || "-"} scene=${data?.scene || "-"} key=${keys[0] || "-"}`;
    if (!reportedEntrances.has(kind) && reportedEntrances.size < 50) {
      reportedEntrances.add(kind);
      console.log(`TikTok: a new kind of entrance banner (${kind}) for ${user.nickname}: counted as joining`);
    }
  }
  // What kind of entrance it was, for the welcome rules.
  if (guardian) user.guardian = true;
  if (bannerKeys(data).some(key => SUPER_FAN_BANNER.test(key ?? ""))) user.superFan = true;
  // The level the banner is about, which the user's badges may not show.
  const level = Number(param?.currentGrade) || 0;
  if (type === GRADE_ENTRANCE && level) user.gifterLevel = Math.max(user.gifterLevel, level);
  if (type === FANS_LEVEL_ENTRANCE && level) user.fanLevel = Math.max(user.fanLevel, level);
  // The banner's own badge carries the team heart level too, should the user's badge list lack it.
  if (!user.fanLevel && data.badge?.sceneType === FAN_BADGE) user.fanLevel = Number(data.badge.privilegeLogExtra?.level) || 0;
  if (user.fanLevel && !user.fanClub) user.fanClub = data.badge?.combine?.str || "";
  return { type: "member", user };
}

// Someone going up a level in the live: TikTok sends a barrage message of type 8 when their gifter level
// goes up and of type 10 when their team heart level in this streamer's fan club does, with the new level
// and the user in a param of its own. Returns { type: "levelup", kind: "gifter" | "fan", level, user }.
// Not yet seen on a real live (traces so far only had type 11, the fan join), so the user is looked for in
// every place a barrage message can carry one.
const LEVEL_UP = { 8: ["gifter", "userGradeParam"], 10: ["fan", "fansLevelParam"] };
export function mapTikTokLevelUp(data) {
  const [kind, field] = LEVEL_UP[Number(data?.msgType)] ?? [];
  if (!kind) return null;
  const param = data[field] ?? {};
  const level = Number(param.currentGrade) || 0;
  const user = mapTikTokUser(param.user ?? data.user ?? bannerUser(data.commonBarrageContent) ?? bannerUser(data.content));
  if (!user || !level) return null;
  // The level just reached, which the user's badges may not show yet.
  if (kind === "gifter") user.gifterLevel = Math.max(user.gifterLevel, level);
  else user.fanLevel = Math.max(user.fanLevel, level);
  return { type: "levelup", kind, level, user, timestamp: Date.now() };
}

// Someone TikTok lets in without showing who they are: only a display name comes with it, no id or @name
// and no levels, so they are listed and greeted by that name but cannot match a welcome rule.
export function mapTikTokUnauthorizedMember(data) {
  const nickname = String(data?.nickName ?? "").trim();
  if (!visible(nickname)) return null;
  return { type: "member", user: { id: `anon-${nickname}`, uniqueId: "", nickname, avatar: "", gifterLevel: 0, fanLevel: 0, fanClub: "" } };
}

const SAME_JOIN_MS = 5000;
// How often a connected live is checked to still be on.
const LIVE_CHECK_MS = 60_000;
// The dashboard shows this as "Kênh này đang không live." (dashboard.js matches "isn't online").
const OFFLINE = "The requested user isn't online";

// Whether the streamer is live, read from their profile page: true, false, or null when TikTok gave no
// clear answer. Connecting does not tell: when the streamer is offline TikTok answers the room check
// with an error and no status, which the library lets through, and it then joins the room of their last
// live, which is over. Seen on a real channel: "connected" with nothing but room notices arriving.
async function isLive(conn) {
  try { return await conn.fetchIsLive(); } catch { return null; }
}

// onUser(user, source) hears everyone who chats, sends likes, follows or shares.
// onRaw(method, decoded, payload) hears every message TikTok sends, including the kinds the library cannot
// decode and would otherwise drop (decoded is then null), for trace.js.
// onLevelUp(event) hears someone's gifter or team heart level going up (mapTikTokLevelUp).
// wantsGiftList() says whether TikTok's gift list is wanted; it is then fetched once connected and handed to
// onGiftList(list), for the prices and pictures of gifts (gift-catalog.js).
export function createTikTokAdapter({ onGift, onMember, onUser, onLevelUp, onStatus, onRaw, wantsGiftList, onGiftList }) {
  let connection = null;
  let status = { state: "disconnected", username: "", error: "" };

  const setStatus = patch => {
    status = { ...status, ...patch };
    onStatus?.(status);
  };

  async function disconnect() {
    const current = connection;
    connection = null;
    if (current) {
      try { current.disconnect(); } catch { /* already closed */ }
    }
    setStatus({ state: "disconnected", error: "" });
  }

  async function connect(rawUsername) {
    const username = String(rawUsername || "").trim().replace(/^@/, "");
    if (!/^[A-Za-z0-9._]{2,24}$/.test(username)) throw new Error("Username TikTok không hợp lệ");
    if (connection) await disconnect();

    const options = {};
    if (process.env.EULER_API_KEY) options.signApiKey = process.env.EULER_API_KEY;
    const conn = new TikTokLiveConnection(username, options);
    connection = conn;
    setStatus({ state: "connecting", username, error: "" });

    conn.on(WebcastEvent.GIFT, data => {
      if (connection !== conn) return;
      try {
        const event = mapTikTokGift(data);
        if (event) Promise.resolve(onGift(event)).catch(err => console.error("Gift handler failed:", err));
      } catch (err) {
        console.error("Could not map TikTok gift:", err);
      }
    });
    // Someone coming in can arrive as several messages at once (a Super Fan in the fan club gets both
    // banners, maybe a member message too), so one person's joins a few seconds apart count once.
    // A later message that says more (the Super Fan or guardian banner after a plain one) still goes
    // through, so the welcome rules see it.
    const lastJoin = new Map();
    const flags = user => (user.guardian ? "g" : "") + (user.superFan ? "s" : "");
    const join = event => {
      if (!event || connection !== conn) return;
      const now = Date.now();
      const before = lastJoin.get(event.user.id);
      const seen = before && now - before.at < SAME_JOIN_MS ? before.flags : null;
      if (seen !== null && [...flags(event.user)].every(flag => seen.includes(flag))) return;
      lastJoin.set(event.user.id, { at: now, flags: (seen ?? "") + flags(event.user) });
      if (lastJoin.size > 500) for (const [id, entry] of lastJoin) if (now - entry.at >= SAME_JOIN_MS) lastJoin.delete(id);
      onMember?.(event);
    };
    // Joins come in three kinds: the member message for most viewers, a "{user} joined" banner for fan
    // club members and Super Fans (the "superFanJoin" event is one of these banners, so "barrage" covers
    // it), and an unauthorized member for people TikTok does not name.
    conn.on(WebcastEvent.MEMBER, data => join(mapTikTokMember(data)));
    conn.on(WebcastEvent.BARRAGE ?? "barrage", data => {
      join(mapTikTokFanJoin(data));
      if (connection !== conn) return;
      try {
        const levelUp = mapTikTokLevelUp(data);
        if (levelUp) onLevelUp?.(levelUp);
      } catch (err) {
        console.error("Could not map TikTok level up:", err);
      }
    });
    conn.on(WebcastEvent.UNAUTHORIZED_MEMBER ?? "unauthorizedMember", data => join(mapTikTokUnauthorizedMember(data)));
    // Anyone who chats, likes, follows or shares. The library sends follows and shares as their own
    // "follow" and "share" events, and only other social messages as "social".
    for (const [name, source] of [[WebcastEvent.CHAT, "chat"], [WebcastEvent.LIKE, "like"], ["follow", "social"], ["share", "social"], [WebcastEvent.SOCIAL, "social"]]) {
      conn.on(name, data => {
        if (connection !== conn) return;
        const user = mapTikTokUser(data?.user);
        if (!user) return;
        // Chat says whether they subscribe to this streamer, which is taken to mean a Super Fan (never seen
        // true on a real live yet).
        if (data?.userIdentity?.isSubscriberOfAnchor) user.superFan = true;
        onUser?.(user, source);
      });
    }
    // Straight from the socket, before the library sorts the messages: it skips the kinds it cannot read.
    // Only hooked up when there is someone to hand them to (trace.js runs only from the source).
    if (onRaw) conn.on("websocketConnected", socket => {
      socket?.on?.("protoMessageFetchResult", result => {
        if (connection !== conn) return;
        for (const message of result?.messages ?? []) {
          try { onRaw(message.method, message.decodedData?.data ?? null, message.payload); } catch (err) { console.error("Trace failed:", err.message); }
        }
      });
    });
    conn.on(ControlEvent.DISCONNECTED, () => {
      if (connection === conn) { connection = null; setStatus({ state: "disconnected" }); }
    });
    conn.on(ControlEvent.ERROR, err => {
      if (connection === conn) console.error("TikTok connection error:", err?.message ?? err);
    });

    // Ends this connection because the live is over (or never started), so the server tries again later
    // and joins the next live's room, which is a new one each time.
    const offline = () => {
      if (connection !== conn) return;
      connection = null;
      try { conn.disconnect(); } catch { /* already closed */ }
      setStatus({ state: "disconnected", error: OFFLINE });
    };

    try {
      // Only a clear "not live" stops it: when TikTok cannot say, it connects anyway, so a failed check
      // never costs a live.
      if (await isLive(conn) === false) throw new Error(OFFLINE);
      if (connection !== conn) return status;
      await conn.connect();
      if (connection !== conn) return status;
      setStatus({ state: "connected", error: "" });
      const watch = setInterval(async () => {
        if (connection !== conn) return clearInterval(watch);
        if (await isLive(conn) === false) {
          clearInterval(watch);
          console.log(`TikTok: @${username} is no longer live, waiting for the next live`);
          offline();
        }
      }, LIVE_CHECK_MS);
      watch.unref?.();
      if (onGiftList && wantsGiftList?.()) {
        conn.fetchAvailableGifts()
          .then(list => onGiftList(list))
          .catch(err => console.log(`TikTok gift list: ${err?.message || err}`));
      }
    } catch (err) {
      if (connection === conn) connection = null;
      setStatus({ state: "disconnected", error: err?.message || "Không kết nối được" });
      throw err;
    }
    return status;
  }

  return { connect, disconnect, getStatus: () => status };
}
