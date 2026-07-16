const TILE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const CHALLENGE_TIME_ZONE = "America/Chicago";
const COMMENT_LIMIT = 180;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/leaderboard") {
        return await getLeaderboard(url, env);
      }

      if (request.method === "POST" && url.pathname === "/scores") {
        return await postScore(request, env);
      }

      if (request.method === "GET" && url.pathname === "/comments") {
        return await getComments(url, env);
      }

      if (request.method === "POST" && url.pathname === "/comments") {
        return await postComment(request, env);
      }

      return json({ error: "Not found." }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: "The tavern ledger had a problem." }, 500);
    }
  }
};

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "no-store"
    }
  });
}

function challengeDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHALLENGE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function validDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function dailyDiceAt(dateKey, index) {
  const random = mulberry32(hashString(`shut-the-box:${dateKey}`));
  let first = 1;
  let second = 1;

  for (let roll = 0; roll <= index; roll += 1) {
    first = Math.floor(random() * 6) + 1;
    second = Math.floor(random() * 6) + 1;
  }

  return [first, second];
}

function sum(values) {
  return [...values].reduce((total, value) => total + value, 0);
}

function hasCombination(values, target) {
  const available = [...values];

  function search(index, remaining) {
    if (remaining === 0) return true;
    if (remaining < 0 || index >= available.length) return false;
    return search(index + 1, remaining - available[index])
      || search(index + 1, remaining);
  }

  return search(0, target);
}

function verifyRun(dateKey, moves) {
  if (!Array.isArray(moves) || moves.length > TILE_VALUES.length) {
    throw new Error("Invalid move history.");
  }

  const openTiles = new Set(TILE_VALUES);

  moves.forEach((move, rollIndex) => {
    if (!Array.isArray(move) || move.length === 0) {
      throw new Error("Invalid move history.");
    }

    const uniqueMove = new Set(move);
    if (uniqueMove.size !== move.length) {
      throw new Error("A tile was used twice in one move.");
    }

    for (const tile of move) {
      if (!Number.isInteger(tile) || !openTiles.has(tile)) {
        throw new Error("A move used a tile that was not open.");
      }
    }

    const target = sum(dailyDiceAt(dateKey, rollIndex));
    if (sum(move) !== target) {
      throw new Error("A move did not match its roll.");
    }

    move.forEach((tile) => openTiles.delete(tile));
  });

  if (openTiles.size === 0) {
    return { score: 0, rollsUsed: moves.length };
  }

  const finalTarget = sum(dailyDiceAt(dateKey, moves.length));
  if (hasCombination(openTiles, finalTarget)) {
    throw new Error("The submitted run stopped before it was over.");
  }

  return { score: sum(openTiles), rollsUsed: moves.length + 1 };
}

function cleanPlayerId(value) {
  const cleaned = String(value || "").trim();
  return /^[A-Za-z0-9_-]{16,80}$/.test(cleaned) ? cleaned : "";
}

function cleanPlayerName(value) {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ");
  return cleaned.length >= 1 && cleaned.length <= 20 ? cleaned : "";
}

function cleanComment(value) {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ");
  return cleaned.length >= 1 && cleaned.length <= COMMENT_LIMIT ? cleaned : "";
}

async function getLeaderboard(url, env) {
  const date = url.searchParams.get("date") || challengeDateKey();
  if (!validDateKey(date)) return json({ error: "Invalid challenge date." }, 400);

  const { results = [] } = await env.DB.prepare(`
    SELECT player_name, score, created_at
    FROM scores
    WHERE challenge_date = ?
    ORDER BY score ASC, created_at ASC
    LIMIT 100
  `).bind(date).all();

  let displayedRank = 0;
  let previousScore = null;
  const leaderboard = results.map((entry, index) => {
    const score = Number(entry.score);
    if (previousScore === null || score !== previousScore) displayedRank = index + 1;
    previousScore = score;
    return {
      rank: displayedRank,
      name: entry.player_name,
      score
    };
  });

  const finalized = date < challengeDateKey();
  return json({
    date,
    finalized,
    winner: finalized && leaderboard.length ? leaderboard[0] : null,
    leaderboard
  });
}

async function postScore(request, env) {
  const body = await request.json();
  const challengeDate = String(body.challenge_date || "");
  const currentDate = challengeDateKey();
  const playerId = cleanPlayerId(body.player_id);
  const playerName = cleanPlayerName(body.player_name);

  if (challengeDate !== currentDate) {
    return json({ error: "Only today’s challenge can be submitted." }, 400);
  }
  if (!playerId) return json({ error: "Invalid player ID." }, 400);
  if (!playerName) return json({ error: "Use a name from 1 to 20 characters." }, 400);

  const existing = await env.DB.prepare(`
    SELECT player_name, score
    FROM scores
    WHERE challenge_date = ? AND player_id = ?
  `).bind(challengeDate, playerId).first();

  if (existing) {
    return json({
      already_submitted: true,
      player_name: existing.player_name,
      score: Number(existing.score)
    });
  }

  let verified;
  try {
    verified = verifyRun(challengeDate, body.moves);
  } catch (error) {
    return json({ error: error.message || "The run could not be verified." }, 400);
  }

  await env.DB.prepare(`
    INSERT INTO scores (challenge_date, player_id, player_name, score, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).bind(challengeDate, playerId, playerName, verified.score).run();

  return json({
    already_submitted: false,
    player_name: playerName,
    score: verified.score,
    rolls_used: verified.rollsUsed
  }, 201);
}

async function getComments(url, env) {
  const date = url.searchParams.get("date") || challengeDateKey();
  const viewerId = cleanPlayerId(url.searchParams.get("player_id"));
  if (!validDateKey(date)) return json({ error: "Invalid challenge date." }, 400);

  const { results = [] } = await env.DB.prepare(`
    SELECT player_id, player_name, body, created_at, updated_at
    FROM comments
    WHERE challenge_date = ?
    ORDER BY created_at ASC
    LIMIT 100
  `).bind(date).all();

  const comments = results.map((comment) => ({
    name: comment.player_name,
    body: comment.body,
    created_at: comment.updated_at || comment.created_at,
    is_owner: Boolean(viewerId && viewerId === comment.player_id)
  }));

  return json({ date, comments });
}

async function postComment(request, env) {
  const payload = await request.json();
  const challengeDate = String(payload.challenge_date || "");
  const playerId = cleanPlayerId(payload.player_id);
  const submittedName = cleanPlayerName(payload.player_name);
  const body = cleanComment(payload.body);

  if (challengeDate !== challengeDateKey()) {
    return json({ error: "Table talk closes when the daily board closes." }, 400);
  }
  if (!playerId) return json({ error: "Invalid player ID." }, 400);
  if (!body) return json({ error: `Keep the comment between 1 and ${COMMENT_LIMIT} characters.` }, 400);

  const score = await env.DB.prepare(`
    SELECT player_name
    FROM scores
    WHERE challenge_date = ? AND player_id = ?
  `).bind(challengeDate, playerId).first();

  if (!score) {
    return json({ error: "Post today’s verified score before commenting." }, 403);
  }

  const playerName = score.player_name || submittedName;
  const existing = await env.DB.prepare(`
    SELECT id
    FROM comments
    WHERE challenge_date = ? AND player_id = ?
  `).bind(challengeDate, playerId).first();

  if (existing) {
    await env.DB.prepare(`
      UPDATE comments
      SET body = ?, player_name = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(body, playerName, existing.id).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO comments (challenge_date, player_id, player_name, body, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(challengeDate, playerId, playerName, body).run();
  }

  return json({ updated: Boolean(existing), name: playerName, body }, existing ? 200 : 201);
}
