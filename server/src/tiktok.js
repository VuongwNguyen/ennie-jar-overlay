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

// Who someone is, from any TikTok message that carries a user.
export function mapTikTokUser(user) {
  const nickname = user?.nickname || user?.uniqueId || user?.displayId;
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

// onUser hears everyone who chats or sends likes, so their levels can be remembered.
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
    conn.on(WebcastEvent.MEMBER, data => {
      if (connection !== conn) return;
      const event = mapTikTokMember(data);
      if (event) onMember?.(event);
    });
    for (const name of [WebcastEvent.CHAT, WebcastEvent.LIKE]) {
      conn.on(name, data => {
        if (connection !== conn) return;
        const user = mapTikTokUser(data?.user);
        if (user && (user.fanLevel || user.gifterLevel)) onUser?.(user);
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
