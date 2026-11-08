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
// pieces, with their team heart badge.
// Super Fans (paid monthly subscribers) get a banner of their own when they come in, keyed
// "ttlive_superfan_commentnotif_superfanjoined"; the library also sends it as "superFanJoin".
const JOIN_BANNER = /^pm_mt_fan_live_join|superfan_commentnotif_superfanjoined/i;
const bannerKeys = data => [data?.content?.key, data?.content?.displayType, data?.commonBarrageContent?.key, data?.commonBarrageContent?.displayType];
// The first user in the banner's text pieces (named pieces or piecesList, depending on the decoder).
const bannerUser = text => (text?.pieces ?? text?.piecesList ?? []).find(piece => piece?.userValue?.user)?.userValue?.user;
export function mapTikTokFanJoin(data) {
  const isJoin = data?.subType === "fans_entrance" || bannerKeys(data).some(key => JOIN_BANNER.test(key ?? ""));
  if (!isJoin) return null;
  const user = mapTikTokUser(bannerUser(data.commonBarrageContent) ?? bannerUser(data.content));
  if (!user) return null;
  // The banner's own badge carries the team heart level too, should the user's badge list lack it.
  if (!user.fanLevel && data.badge?.sceneType === FAN_BADGE) user.fanLevel = Number(data.badge.privilegeLogExtra?.level) || 0;
  if (user.fanLevel && !user.fanClub) user.fanClub = data.badge?.combine?.str || "";
  return { type: "member", user };
}

// Someone TikTok lets in without showing who they are: only a display name comes with it, no id or @name
// and no levels, so they are listed and greeted by that name but cannot match a welcome rule.
export function mapTikTokUnauthorizedMember(data) {
  const nickname = String(data?.nickName ?? "").trim();
  if (!visible(nickname)) return null;
  return { type: "member", user: { id: `anon-${nickname}`, uniqueId: "", nickname, avatar: "", gifterLevel: 0, fanLevel: 0, fanClub: "" } };
}

const SAME_JOIN_MS = 5000;

// onUser(user, source) hears everyone who chats, sends likes, follows or shares.
export function createTikTokAdapter({ onGift, onMember, onUser, onStatus }) {
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
    const lastJoin = new Map();
    const join = event => {
      if (!event || connection !== conn) return;
      const now = Date.now();
      if (now - (lastJoin.get(event.user.id) ?? 0) < SAME_JOIN_MS) return;
      lastJoin.set(event.user.id, now);
      if (lastJoin.size > 500) for (const [id, at] of lastJoin) if (now - at >= SAME_JOIN_MS) lastJoin.delete(id);
      onMember?.(event);
    };
    // Joins come in three kinds: the member message for most viewers, a "{user} joined" banner for fan
    // club members and Super Fans (the "superFanJoin" event is one of these banners, so "barrage" covers
    // it), and an unauthorized member for people TikTok does not name.
    conn.on(WebcastEvent.MEMBER, data => join(mapTikTokMember(data)));
    conn.on(WebcastEvent.BARRAGE ?? "barrage", data => join(mapTikTokFanJoin(data)));
    conn.on(WebcastEvent.UNAUTHORIZED_MEMBER ?? "unauthorizedMember", data => join(mapTikTokUnauthorizedMember(data)));
    // Anyone who chats, likes, follows or shares. The library sends follows and shares as their own
    // "follow" and "share" events, and only other social messages as "social".
    for (const [name, source] of [[WebcastEvent.CHAT, "chat"], [WebcastEvent.LIKE, "like"], ["follow", "social"], ["share", "social"], [WebcastEvent.SOCIAL, "social"]]) {
      conn.on(name, data => {
        if (connection !== conn) return;
        const user = mapTikTokUser(data?.user);
        if (user) onUser?.(user, source);
      });
    }
    conn.on(ControlEvent.DISCONNECTED, () => {
      if (connection === conn) { connection = null; setStatus({ state: "disconnected" }); }
    });
    conn.on(ControlEvent.ERROR, err => {
      if (connection === conn) console.error("TikTok connection error:", err?.message ?? err);
    });

    try {
      await conn.connect();
      if (connection !== conn) return status;
      setStatus({ state: "connected", error: "" });
    } catch (err) {
      if (connection === conn) connection = null;
      setStatus({ state: "disconnected", error: err?.message || "Không kết nối được" });
      throw err;
    }
    return status;
  }

  return { connect, disconnect, getStatus: () => status };
}
