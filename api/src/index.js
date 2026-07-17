const TILE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const CHALLENGE_TIME_ZONE = "America/Chicago";
const DAILY_ATTEMPT_LIMIT = 3;
const COMMENT_CHARACTER_LIMIT = 180;
const DAILY_COMMENT_LIMIT = 5;

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
  return cleaned.length >= 1 && cleaned.length <= COMMENT_CHARACTER_LIMIT ? cleaned : "";
}

async function getLeaderboard(url, env) {
  const date = url.searchParams.get("date") || challengeDateKey();
  if (!validDateKey(date)) return json({ error: "Invalid challenge date." }, 400);

  const { results = [] } = await env.DB.prepare(`
    SELECT player_name, score, rolls_used, created_at
    FROM daily_scores
    WHERE challenge_date = ?
    ORDER BY score ASC, rolls_used ASC, created_at ASC
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
      score,
      rolls_used: Number(entry.rolls_used)
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

  const attemptCount = await env.DB.prepare(`
    SELECT COUNT(*) AS attempts_used
    FROM daily_attempts
    WHERE challenge_date = ? AND player_id = ?
  `).bind(challengeDate, playerId).first();

  const attemptsUsed = Number(attemptCount?.attempts_used || 0);
  if (attemptsUsed >= DAILY_ATTEMPT_LIMIT) {
    const best = await env.DB.prepare(`
      SELECT player_name, score, rolls_used
      FROM daily_scores
      WHERE challenge_date = ? AND player_id = ?
    `).bind(challengeDate, playerId).first();

    return json({
      error: `All ${DAILY_ATTEMPT_LIMIT} daily attempts have already been used.`,
      attempts_used: attemptsUsed,
      best_score: best ? Number(best.score) : null,
      best_rolls_used: best ? Number(best.rolls_used) : null
    }, 429);
  }

  let verified;
  try {
    verified = verifyRun(challengeDate, body.moves);
  } catch (error) {
    return json({ error: error.message || "The run could not be verified." }, 400);
  }

  const attemptNumber = attemptsUsed + 1;
  const serializedMoves = JSON.stringify(body.moves);

  await env.DB.prepare(`
    INSERT INTO daily_attempts (
      challenge_date,
      player_id,
      player_name,
      attempt_number,
      score,
      rolls_used,
      moves,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    challengeDate,
    playerId,
    playerName,
    attemptNumber,
    verified.score,
    verified.rollsUsed,
    serializedMoves
  ).run();

  const existing = await env.DB.prepare(`
    SELECT player_name, score, rolls_used
    FROM daily_scores
    WHERE challenge_date = ? AND player_id = ?
  `).bind(challengeDate, playerId).first();

  const improved = !existing
    || verified.score < Number(existing.score)
    || (verified.score === Number(existing.score) && verified.rollsUsed < Number(existing.rolls_used));

  if (!existing) {
    await env.DB.prepare(`
      INSERT INTO daily_scores (
        challenge_date,
        player_id,
        player_name,
        score,
        rolls_used,
        moves,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      challengeDate,
      playerId,
      playerName,
      verified.score,
      verified.rollsUsed,
      serializedMoves
    ).run();
  } else if (improved) {
    await env.DB.prepare(`
      UPDATE daily_scores
      SET player_name = ?, score = ?, rolls_used = ?, moves = ?, created_at = datetime('now')
      WHERE challenge_date = ? AND player_id = ?
    `).bind(
      playerName,
      verified.score,
      verified.rollsUsed,
      serializedMoves,
      challengeDate,
      playerId
    ).run();
  } else if (existing.player_name !== playerName) {
    await env.DB.prepare(`
      UPDATE daily_scores
      SET player_name = ?
      WHERE challenge_date = ? AND player_id = ?
    `).bind(playerName, challengeDate, playerId).run();
  }

  const best = improved || !existing
    ? { score: verified.score, rolls_used: verified.rollsUsed }
    : existing;

  return json({
    player_name: playerName,
    score: verified.score,
    rolls_used: verified.rollsUsed,
    attempt_number: attemptNumber,
    attempts_remaining: DAILY_ATTEMPT_LIMIT - attemptNumber,
    best_score: Number(best.score),
    best_rolls_used: Number(best.rolls_used),
    improved
  }, 201);
}

async function getComments(url, env) {
  const date = url.searchParams.get("date") || challengeDateKey();
  const viewerId = cleanPlayerId(url.searchParams.get("player_id"));
  if (!validDateKey(date)) return json({ error: "Invalid challenge date." }, 400);

  const { results = [] } = await env.DB.prepare(`
    SELECT player_id, player_name, body, created_at
    FROM comments
    WHERE challenge_date = ?
    ORDER BY created_at ASC, id ASC
    LIMIT 200
  `).bind(date).all();

  let used = 0;
  const comments = results.map((comment) => {
    const isOwner = Boolean(viewerId && viewerId === comment.player_id);
    if (isOwner) used += 1;
    return {
      name: comment.player_name,
      body: comment.body,
      created_at: comment.created_at,
      is_owner: isOwner
    };
  });

  return json({
    date,
    comments,
    used,
    remaining: Math.max(0, DAILY_COMMENT_LIMIT - used),
    limit: DAILY_COMMENT_LIMIT
  });
}

async function postComment(request, env) {
  const payload = await request.json();
  const challengeDate = String(payload.challenge_date || "");
  const playerId = cleanPlayerId(payload.player_id);
  const playerName = cleanPlayerName(payload.player_name);
  const body = cleanComment(payload.body);

  if (challengeDate !== challengeDateKey()) {
    return json({ error: "Table talk is only open on today’s board." }, 400);
  }
  if (!playerId) return json({ error: "Invalid player ID." }, 400);
  if (!playerName) return json({ error: "Use a name from 1 to 20 characters." }, 400);
  if (!body) {
    return json({ error: `Keep the comment between 1 and ${COMMENT_CHARACTER_LIMIT} characters.` }, 400);
  }

  const countRow = await env.DB.prepare(`
    SELECT COUNT(*) AS comment_count
    FROM comments
    WHERE challenge_date = ? AND player_id = ?
  `).bind(challengeDate, playerId).first();

  const used = Number(countRow?.comment_count || 0);
  if (used >= DAILY_COMMENT_LIMIT) {
    return json({
      error: `You’ve used all ${DAILY_COMMENT_LIMIT} comments for today.`,
      used,
      remaining: 0,
      limit: DAILY_COMMENT_LIMIT
    }, 429);
  }

  await env.DB.prepare(`
    INSERT INTO comments (challenge_date, player_id, player_name, body, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).bind(challengeDate, playerId, playerName, body).run();

  const newUsed = used + 1;
  return json({
    name: playerName,
    body,
    used: newUsed,
    remaining: DAILY_COMMENT_LIMIT - newUsed,
    limit: DAILY_COMMENT_LIMIT
  }, 201);
}
