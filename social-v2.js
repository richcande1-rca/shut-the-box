"use strict";

(() => {
  const API_BASE = "https://shut-the-box-api.rich-gothic.workers.dev";
  const CHALLENGE_TIME_ZONE = "America/Chicago";
  const PLAYER_ID_KEY = "shut-the-box-player-id-v1";
  const PLAYER_NAME_KEY = "shut-the-box-player-name-v1";
  const COMMENT_CHARACTER_LIMIT = 180;
  const DEFAULT_DAILY_COMMENT_LIMIT = 5;

  const previousWinner = document.querySelector("#previousWinner");
  const previousWinnerName = document.querySelector("#previousWinnerName");
  const previousWinnerScore = document.querySelector("#previousWinnerScore");
  const leaderboardRows = document.querySelector("#leaderboardRows");
  const commentForm = document.querySelector("#commentForm");
  const commentNameInput = document.querySelector("#commentName");
  const commentInput = document.querySelector("#commentInput");
  const commentCount = document.querySelector("#commentCount");
  const commentButton = document.querySelector("#commentButton");
  const commentGate = document.querySelector("#commentGate");
  const commentStatus = document.querySelector("#commentStatus");
  const commentsList = document.querySelector("#commentsList");

  if (
    !previousWinner
    || !leaderboardRows
    || !commentForm
    || !commentNameInput
    || !commentInput
    || !commentsList
  ) return;

  let comments = [];
  let commentsAvailable = true;
  let commentsUsed = 0;
  let dailyCommentLimit = DEFAULT_DAILY_COMMENT_LIMIT;

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

  function shiftDateKey(dateKey, amount) {
    const date = new Date(`${dateKey}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  const challengeDate = challengeDateKey();
  const previousDate = shiftDateKey(challengeDate, -1);

  function readStoredValue(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function saveStoredValue(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // The current page can still use the value if storage is unavailable.
    }
  }

  function ensurePlayerId() {
    const existing = readStoredValue(PLAYER_ID_KEY);
    if (/^[A-Za-z0-9_-]{16,80}$/.test(existing)) return existing;

    const generated = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `player_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 18)}`;
    saveStoredValue(PLAYER_ID_KEY, generated);
    return generated;
  }

  function storedPlayerName() {
    return readStoredValue(PLAYER_NAME_KEY);
  }

  function cleanPlayerName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function setCommentStatus(text) {
    commentStatus.textContent = text;
  }

  function updateCommentCount() {
    commentCount.textContent = `${commentInput.value.length} / ${COMMENT_CHARACTER_LIMIT}`;
  }

  function updateCommentAccess() {
    const remaining = Math.max(0, dailyCommentLimit - commentsUsed);
    const limitReached = remaining === 0;

    commentForm.hidden = !commentsAvailable || limitReached;
    commentGate.hidden = commentsAvailable && !limitReached;

    if (!commentsAvailable) {
      commentGate.hidden = false;
      commentGate.textContent = "Table talk is temporarily unavailable.";
      return;
    }

    if (limitReached) {
      commentGate.hidden = false;
      commentGate.textContent = `You’ve used all ${dailyCommentLimit} comments for today.`;
      return;
    }

    commentButton.textContent = `POST COMMENT · ${remaining} LEFT`;
    if (!commentNameInput.value) commentNameInput.value = storedPlayerName();
  }

  function addBadge(nameElement, text, className) {
    if (!nameElement || nameElement.querySelector(`.${className}`)) return;
    const badge = document.createElement("span");
    badge.className = className;
    badge.textContent = text;
    nameElement.append(" ", badge);
  }

  function decorateCurrentLeader() {
    const firstRow = leaderboardRows.querySelector(".leaderboard-row");
    const existingBadges = [...leaderboardRows.querySelectorAll(".leader-badge")];

    existingBadges.forEach((badge) => {
      if (!firstRow || !firstRow.contains(badge)) badge.remove();
    });

    if (!firstRow) return;
    addBadge(firstRow.querySelector(".name-cell"), "LEADING", "leader-badge");
  }

  async function loadPreviousWinner() {
    try {
      const response = await fetch(`${API_BASE}/leaderboard?date=${encodeURIComponent(previousDate)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Winner request failed.");
      const winner = Array.isArray(data.leaderboard) ? data.leaderboard[0] : null;
      if (!winner) return;

      previousWinnerName.replaceChildren(document.createTextNode(winner.name));
      addBadge(previousWinnerName, "DAILY WINNER", "winner-badge");
      previousWinnerScore.textContent = String(winner.score);
      previousWinner.hidden = false;
    } catch {
      previousWinner.hidden = true;
    }
  }

  function formatCommentTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function createCommentCard(comment) {
    const card = document.createElement("article");
    card.className = "comment-card";
    if (comment.is_owner) card.classList.add("is-player");

    const header = document.createElement("div");
    header.className = "comment-card-header";

    const name = document.createElement("strong");
    name.className = "comment-card-name";
    name.textContent = comment.name;
    if (comment.is_owner) addBadge(name, "YOU", "you-badge");

    const time = document.createElement("time");
    time.className = "comment-card-time";
    time.textContent = formatCommentTime(comment.created_at);

    const body = document.createElement("p");
    body.className = "comment-card-body";
    body.textContent = comment.body;

    header.append(name, time);
    card.append(header, body);
    return card;
  }

  function renderComments() {
    commentsList.replaceChildren();

    if (comments.length === 0) {
      const message = document.createElement("p");
      message.className = "comment-message";
      message.textContent = "No table talk yet. Somebody has to complain about the dice first.";
      commentsList.append(message);
    } else {
      comments.forEach((comment) => commentsList.append(createCommentCard(comment)));
    }

    updateCommentAccess();
  }

  async function loadComments() {
    commentsList.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "comment-message";
    loading.textContent = "Loading table talk…";
    commentsList.append(loading);

    const query = new URLSearchParams({
      date: challengeDate,
      player_id: ensurePlayerId()
    });

    try {
      const response = await fetch(`${API_BASE}/comments?${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Comments request failed.");
      comments = Array.isArray(data.comments) ? data.comments : [];
      dailyCommentLimit = Number.isInteger(data.limit) ? data.limit : DEFAULT_DAILY_COMMENT_LIMIT;
      commentsUsed = Number.isInteger(data.used) ? data.used : 0;
      commentsAvailable = true;
      renderComments();
    } catch {
      comments = [];
      commentsUsed = 0;
      commentsAvailable = false;
      commentsList.replaceChildren();
      const message = document.createElement("p");
      message.className = "comment-message error";
      message.textContent = "Table talk could not be reached. The leaderboard still works.";
      commentsList.append(message);
      updateCommentAccess();
    }
  }

  async function submitComment(event) {
    event.preventDefault();
    if (!commentsAvailable || commentsUsed >= dailyCommentLimit) return;

    const name = cleanPlayerName(commentNameInput.value || storedPlayerName());
    const body = commentInput.value.trim().replace(/\s+/g, " ");

    if (!name || name.length > 20) {
      setCommentStatus("Use a name from 1 to 20 characters.");
      commentNameInput.focus();
      return;
    }

    if (!body || body.length > COMMENT_CHARACTER_LIMIT) {
      setCommentStatus(`Keep the comment between 1 and ${COMMENT_CHARACTER_LIMIT} characters.`);
      commentInput.focus();
      return;
    }

    saveStoredValue(PLAYER_NAME_KEY, name);
    commentNameInput.value = name;
    commentButton.disabled = true;
    setCommentStatus("Posting your comment…");

    try {
      const response = await fetch(`${API_BASE}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_date: challengeDate,
          player_id: ensurePlayerId(),
          player_name: name,
          body
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Comment submission failed.");

      commentInput.value = "";
      updateCommentCount();
      commentsUsed = Number.isInteger(data.used) ? data.used : commentsUsed + 1;
      dailyCommentLimit = Number.isInteger(data.limit) ? data.limit : dailyCommentLimit;
      const remaining = Math.max(0, dailyCommentLimit - commentsUsed);
      setCommentStatus(`Comment posted. ${remaining} left today.`);
      await loadComments();
    } catch (error) {
      setCommentStatus(error.message || "Could not post the comment.");
    } finally {
      commentButton.disabled = false;
    }
  }

  commentInput.maxLength = COMMENT_CHARACTER_LIMIT;
  commentInput.addEventListener("input", updateCommentCount);
  commentForm.addEventListener("submit", submitComment);
  updateCommentCount();
  updateCommentAccess();
  loadPreviousWinner();
  loadComments();

  const leaderboardObserver = new MutationObserver(decorateCurrentLeader);
  leaderboardObserver.observe(leaderboardRows, { childList: true });
  decorateCurrentLeader();
})();
