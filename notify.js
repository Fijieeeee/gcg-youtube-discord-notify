const fs = require("fs");

const CHANNEL_ID = process.env.CHANNEL_ID || "UCIuOtzuhF4T-v5irBl1SxcA";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const FIRST_RUN_NOTIFY = process.env.FIRST_RUN_NOTIFY === "true";

const STATE_FILE = "state.json";

async function main() {
  if (!YOUTUBE_API_KEY) {
    throw new Error("YOUTUBE_API_KEY is not set");
  }

  if (!DISCORD_WEBHOOK_URL) {
    throw new Error("DISCORD_WEBHOOK_URL is not set");
  }

  const latest = await fetchLatestVideo();

  if (!latest) {
    console.log("No latest video found.");
    return;
  }

  console.log("Latest video:", latest);

  const state = readState();
  const lastVideoId = state.LAST_VIDEO_ID || "";

  console.log("Saved LAST_VIDEO_ID:", lastVideoId);

  if (lastVideoId === latest.videoId) {
    console.log("Same video. No notification.");
    return;
  }

  if (!lastVideoId && !FIRST_RUN_NOTIFY) {
    state.LAST_VIDEO_ID = latest.videoId;
    state.latestTitle = latest.title;
    state.updatedAt = new Date().toISOString();
    writeState(state);

    console.log("First run. Saved LAST_VIDEO_ID only.");
    return;
  }

  await postToDiscord(latest);

  state.LAST_VIDEO_ID = latest.videoId;
  state.latestTitle = latest.title;
  state.updatedAt = new Date().toISOString();
  writeState(state);

  console.log("Posted to Discord and updated LAST_VIDEO_ID:", latest.videoId);
}

async function fetchLatestVideo() {
  const uploadsPlaylistId = CHANNEL_ID.replace(/^UC/, "UU");

  const params = new URLSearchParams({
    part: "snippet,contentDetails",
    playlistId: uploadsPlaylistId,
    maxResults: "1",
    key: YOUTUBE_API_KEY,
  });

  const url = `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`;

  const res = await fetch(url);
  const data = await res.json();

  console.log("YouTube API status:", res.status);
  console.log("YouTube API response preview:", JSON.stringify(data).slice(0, 1000));

  if (!res.ok) {
    throw new Error(`YouTube API failed: HTTP ${res.status} / ${JSON.stringify(data)}`);
  }

  const item = data.items?.[0];

  if (!item) {
    return null;
  }

  const videoId =
    item.contentDetails?.videoId ||
    item.snippet?.resourceId?.videoId;

  if (!videoId) {
    return null;
  }

  return {
    videoId,
    title: item.snippet?.title || "新しい動画",
    publishedAt:
      item.contentDetails?.videoPublishedAt ||
      item.snippet?.publishedAt,
    channelTitle: item.snippet?.channelTitle || "",
  };
}

async function postToDiscord(video) {
  const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;

  const content = [
    "📢 新しい動画が投稿されました！",
    "",
    `**${video.title}**`,
    videoUrl,
  ].join("\n");

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: "ガンダムカードLABO通知",
      content,
      allowed_mentions: {
        parse: [],
      },
    }),
  });

  const text = await res.text();

  console.log("Discord status:", res.status);
  console.log("Discord response:", text);

  if (!res.ok) {
    throw new Error(`Discord post failed: HTTP ${res.status} / ${text}`);
  }
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) {
    return {};
  }

  const raw = fs.readFileSync(STATE_FILE, "utf8").trim();

  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function writeState(state) {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(state, null, 2) + "\n",
    "utf8"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
