# Shut the Box API

This directory contains the Cloudflare Worker source for the verified daily leaderboard and table-talk comments.

## Required binding

The Worker expects a D1 database binding named `DB`.

The existing `scores` table must provide these columns:

- `challenge_date`
- `player_id`
- `player_name`
- `score`
- `created_at`

Apply `migrations/0001_social.sql` to the same database before deploying the Worker. The migration adds one short comment per player per daily challenge.

## Routes

- `GET /leaderboard?date=YYYY-MM-DD`
- `POST /scores`
- `GET /comments?date=YYYY-MM-DD&player_id=...`
- `POST /comments`

Only a player with a verified score for the current challenge may post or update a comment. Historical comments remain readable, while posting closes when the Central-time daily board closes.

Copy `wrangler.example.toml` to `wrangler.toml`, fill in the existing D1 database identifiers, apply the migration remotely, and deploy to the existing `shut-the-box-api` Worker.
