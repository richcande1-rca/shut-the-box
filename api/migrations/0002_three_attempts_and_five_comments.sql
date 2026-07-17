CREATE TABLE IF NOT EXISTS daily_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_date TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
  score INTEGER NOT NULL,
  rolls_used INTEGER NOT NULL,
  moves TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (challenge_date, player_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS daily_attempts_by_player
  ON daily_attempts (challenge_date, player_id, attempt_number);

INSERT OR IGNORE INTO daily_attempts (
  challenge_date,
  player_id,
  player_name,
  attempt_number,
  score,
  rolls_used,
  moves,
  created_at
)
SELECT
  challenge_date,
  player_id,
  player_name,
  1,
  score,
  rolls_used,
  moves,
  created_at
FROM daily_scores;

DROP INDEX IF EXISTS comments_by_challenge_date;
ALTER TABLE comments RENAME TO comments_single_per_player;

CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_date TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 180),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO comments (
  id,
  challenge_date,
  player_id,
  player_name,
  body,
  created_at,
  updated_at
)
SELECT
  id,
  challenge_date,
  player_id,
  player_name,
  body,
  created_at,
  updated_at
FROM comments_single_per_player;

DROP TABLE comments_single_per_player;

CREATE INDEX comments_by_challenge_date
  ON comments (challenge_date, created_at, id);

CREATE INDEX comments_by_player
  ON comments (challenge_date, player_id, created_at);