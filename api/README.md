# Shut the Box API

This directory contains the Cloudflare Worker source for the verified daily leaderboard and table-talk comments.

## Required binding

The Worker expects a D1 database binding named `DB`.

The existing `daily_scores` table stores each player’s best score for the day. Migration `0002_three_attempts_and_five_comments.sql` adds a `daily_attempts` table so every player may submit three verified runs while only their best result remains on the leaderboard.

## Migrations

Apply migrations to the same remote D1 database in order:

1. `migrations/0001_social.sql`
2. `migrations/0002_three_attempts_and_five_comments.sql`

The second migration preserves existing scores and comments, counts an existing daily score as attempt one, and removes the old one-comment-per-player database constraint.

## Routes

- `GET /leaderboard?date=YYYY-MM-DD`
- `POST /scores`
- `GET /comments?date=YYYY-MM-DD&player_id=...`
- `POST /comments`

Each player gets three verified daily attempts. The best score, with rolls used as the tiebreaker, remains on the leaderboard. Table talk is open before, during, and after play, with a limit of five comments per player per Central-time day.

Copy `wrangler.example.toml` to `wrangler.toml`, fill in the existing D1 database identifiers, apply the migrations remotely, and deploy to the existing `shut-the-box-api` Worker.
