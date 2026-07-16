"use strict";

(() => {
  const API_BASE = "https://shut-the-box-api.rich-gothic.workers.dev";
  const CHALLENGE_TIME_ZONE = "America/Chicago";
  const DAILY_STATE_PREFIX = "shut-the-box-daily-v1:";
  const PLAYER_ID_KEY = "shut-the-box-player-id-v1";
  const PLAYER_NAME_KEY = "shut-the-box-player-name-v1";
  const COMMENT_LIMIT = 180;

  const previousWinner = document.querySelector("#previousWinner");
  const previousWinnerName = document.querySelector("#previousWinnerName");
  const previousWinnerScore = document.querySelector("#previousWinnerScore");
  const leaderboardRows = document.querySelector("#leaderboardRows");
  const commentForm = document.querySelector("#commentForm");
  const commentInput = document.querySelector("#commentInput");
  const commentCount = document.querySelector("#commentCount");
  const commentButton = document.querySelector("#commentButton");
  const commentGate = document.querySelector("#commentGate");
  const commentStatus = document.querySelector("#commentStatus");
  const commentsList = document.querySelector("#commentsList");
  const challengeStatus = document.querySelector("#challengeStatus");
  const scoreForm = document.querySelector("#scoreForm");

  if (!previousWinner || !leaderboardRows || !commentForm || !commentsList) return;

  let comments = [];
  let commentsAvailable = true;
  let ownComment = null;

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
  const dailyStorageKey = `${DAILY_STATE_PREFIX}${challengeDate}`;

  function readStoredValue(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function readDailyState() {
    try {
      const raw = localStorage.getItem(dailyStorageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function playerId() {
    return readStoredValue(PLAYER_ID_KEY);
  }

  function playerName() {
    return readStoredValue(PLAYER_NAME_KEY) || readDailyState()?.playerName || "";
  }

  function hasPostedScore() {
    const state = readDailyState();
    return Boolean(state?.submitted && state?.date === challengeDate && playerId());
  }

  function setCommentStatus(text) {
    commentStatus.textContent = text;
  }

  function updateCommentCount() {
    commentCount.textContent = `${commentInput.value.length} / ${COMMENT_LIMIT}`;
  }

  function updateCommentAccess() {
    const posted = hasPostedScore();
    commentForm.hidden = !posted || !commentsAvailable;
    commentGate.hidden = posted && commentsAvailable;

    if (!commentsAvailable) {
      commentGate.hidden = false;
      commentGate.textContent = "Table talk is temporarily unavailable.";
      return;
    }

    if (!posted) {
      commentGate.textContent = "Post today’s score to join the table talk.";
      return;
    }

    commentButton.textContent = ownComment ? "UPDATE COMMENT" : "POST COMMENT";
    if (ownComment && document.activeElement !== commentInput && !commentInput.value) {
      commentInput.value = ownComment.body;
      updateCommentCount();
    }
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
    ownComment = comments.find((comment) => comment.is_owner) || null;

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

    const query = new URLSearchParams({ date: challengeDate });
    if (playerId()) query.set("player_id", playerId());

    try {
      const response = await fetch(`${API_BASE}/comments?${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Comments request failed.");
      comments = Array.isArray(data.comments) ? data.comments : [];
      commentsAvailable = true;
      renderComments();
    } catch {
      comments = [];
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
    if (!hasPostedScore() || !commentsAvailable) return;

    const body = commentInput.value.trim().replace(/\s+/g, " ");
    if (!body || body.length > COMMENT_LIMIT) {
      setCommentStatus(`Keep the comment between 1 and ${COMMENT_LIMIT} characters.`);
      commentInput.focus();
      return;
    }

    commentButton.disabled = true;
    setCommentStatus(ownComment ? "Updating your comment…" : "Posting your comment…");

    try {
      const response = await fetch(`${API_BASE}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_date: challengeDate,
          player_id: playerId(),
          player_name: playerName(),
          body
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Comment submission failed.");
      commentInput.value = "";
      updateCommentCount();
      setCommentStatus(data.updated ? "Comment updated." : "Comment posted.");
      await loadComments();
    } catch (error) {
      setCommentStatus(error.message || "Could not post the comment.");
    } finally {
      commentButton.disabled = false;
    }
  }

  commentInput.maxLength = COMMENT_LIMIT;
  commentInput.addEventListener("input", updateCommentCount);
  commentForm.addEventListener("submit", submitComment);
  updateCommentCount();
  updateCommentAccess();
  loadPreviousWinner();
  loadComments();

  const leaderboardObserver = new MutationObserver(decorateCurrentLeader);
  leaderboardObserver.observe(leaderboardRows, { childList: true, subtree: true });
  decorateCurrentLeader();

  const accessObserver = new MutationObserver(updateCommentAccess);
  if (challengeStatus) accessObserver.observe(challengeStatus, { childList: true, attributes: true });
  if (scoreForm) accessObserver.observe(scoreForm, { attributes: true });
})();