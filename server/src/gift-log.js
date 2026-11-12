import path from "node:path";
import { appendFile, mkdir, rename, stat } from "node:fs/promises";

// Sổ quà: one line per gift that reaches the server, and one per change of the TikTok connection, in
// data/gift-log.jsonl. The jar in session.json is wiped by "reset" and shows no time or sender, so when
// someone says "I sent a lot and it did not count", this file is what is left to look things up in.
// Always on, on every machine (unlike trace.js). When the file passes MAX_BYTES it becomes
// gift-log.1.jsonl, replacing the older one, so at most two files are kept.
const MAX_BYTES = 4 * 1024 * 1024;

export function createGiftLog(dataDir) {
  const file = path.join(dataDir, "gift-log.jsonl");
  const older = path.join(dataDir, "gift-log.1.jsonl");
  let queue = Promise.resolve();
  let lastStatus = "";

  const write = async line => {
    await mkdir(dataDir, { recursive: true });
    try {
      if ((await stat(file)).size > MAX_BYTES) await rename(file, older);
    } catch { /* no file yet */ }
    await appendFile(file, line + "\n", "utf8");
  };

  // Never throws: a full disk or a locked file must not stop a gift from reaching the jar.
  function add(entry) {
    const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
    queue = queue.then(() => write(line)).catch(err => console.error("Gift log failed:", err.message));
    return queue;
  }

  return {
    // result: "credited", "duplicate" or "streak-in-progress".
    gift(event, result, source) {
      const { user, gift } = event;
      return add({
        type: "gift", source, result, eventId: event.eventId,
        user: { id: user.id, uniqueId: user.uniqueId || "", nickname: user.nickname },
        gift: { id: gift.id, name: gift.name, diamondCount: gift.diamondCount, repeatCount: gift.repeatCount },
        coins: gift.diamondCount * gift.repeatCount
      });
    },
    // Only real changes: while the streamer is offline every retry goes connecting → disconnected with
    // the same error, which would otherwise add two lines every 30s for hours.
    status(status) {
      if (status.state === "connecting") return queue;
      const entry = { type: "status", state: status.state, username: status.username || "", error: status.error || "" };
      const key = `${entry.state}|${entry.username}|${entry.error}`;
      if (key === lastStatus) return queue;
      lastStatus = key;
      return add(entry);
    },
    note(text) {
      return add({ type: "note", text });
    },
    filePath: () => file
  };
}
