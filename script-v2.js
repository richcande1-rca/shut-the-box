"use strict";

const TILE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BEST_SCORE_KEY = "shut-the-box-best-score-v1";
const DAILY_STATE_PREFIX = "shut-the-box-daily-v1:";
const PLAYER_ID_KEY = "shut-the-box-player-id-v1";
const PLAYER_NAME_KEY = "shut-the-box-player-name-v1";
const CHALLENGE_TIME_ZONE = "America/Chicago";
const DAILY_ATTEMPT_LIMIT = 3;
const API_BASE = "https://shut-the-box-api.rich-gothic.workers.dev";

const tileElements = [...document.querySelectorAll(".number-tile")];
const dieOne = document.querySelector("#dieOne");
const dieTwo = document.querySelector("#dieTwo");
const rollTotalElement = document.querySelector("#rollTotal");
const selectedTotalElement = document.querySelector("#selectedTotal");
const targetTotalElement = document.querySelector("#targetTotal");
const openTotalElement = document.querySelector("#openTotal");
const bestScoreElement = document.querySelector("#bestScore");
const bestLabelElement = document.querySelector("#bestLabel");
const selectionMeter = document.querySelector("#selectionMeter");
const instructionElement = document.querySelector("#instruction");
const rollButton = document.querySelector("#rollButton");
const shutButton = document.querySelector("#shutButton");
const dailyModeButton = document.querySelector("#dailyModeButton");
const practiceModeButton = document.querySelector("#practiceModeButton");
const roundResult = document.querySelector("#roundResult");
const roundResultTitle = document.querySelector("#roundResultTitle");
const roundResultScore = document.querySelector("#roundResultScore");
const roundResultDetail = document.querySelector("#roundResultDetail");
const playAgainButton = document.querySelector("#playAgainButton");
const challengeDateElement = document.querySelector("#challengeDate");
const challengeStatusElement = document.querySelector("#challengeStatus");
const challengeScoreElement = document.querySelector("#challengeScore");
const challengeRollElement = document.querySelector("#challengeRoll");
const challengeAttemptElement = document.querySelector("#challengeAttempt");
const challengeRankElement = document.querySelector("#challengeRank");
const challengeNameElement = document.querySelector("#challengeName");
const scoreForm = document.querySelector("#scoreForm");
const playerNameInput = document.querySelector("#playerName");
const submitScoreButton = document.querySelector("#submitScoreButton");
const submissionStatusElement = document.querySelector("#submissionStatus");
const leaderboardRowsElement = document.querySelector("#leaderboardRows");

let openTiles = new Set(TILE_VALUES);
let selectedTiles = new Set();
let currentRoll = null;
let rolling = false;
let roundOver = false;
let rollToken = 0;
let bestScore = readBestScore();
let mode = "daily";
let rollIndex = 0;
let lastDice = [1, 1];
let attemptStarted = false;
let dailyScore = null;
let bestDailyScore = null;
let bestDailyRolls = null;
let attemptsUsed = 0;
let pendingDice = null;
let moveHistory = [];
let dailySubmitted = false;
let playerName = readPlayerName();
let leaderboard = [];
let leaderboardLoading = false;

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

const challengeDate = challengeDateKey();
const dailyStorageKey = `${DAILY_STATE_PREFIX}${challengeDate}`;

function formatChallengeDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
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

function dailyDiceAt(index) {
  const random = mulberry32(hashString(`shut-the-box:${challengeDate}`));
  let first = 1;
  let second = 1;

  for (let roll = 0; roll <= index; roll += 1) {
    first = Math.floor(random() * 6) + 1;
    second = Math.floor(random() * 6) + 1;
  }

  return [first, second];
}

function buildDie(die) {
  die.replaceChildren();
  die.dataset.face = "1";

  for (let position = 1; position <= 9; position += 1) {
    const pip = document.createElement("span");
    pip.className = `pip pip-${position}`;
    pip.setAttribute("aria-hidden", "true");
    die.append(pip);
  }
}

function setDieFace(die, value, label) {
  die.dataset.face = String(value);
  die.setAttribute("aria-label", `${label}: ${value}`);
}

function readBestScore() {
  try {
    const stored = Number(localStorage.getItem(BEST_SCORE_KEY));
    return Number.isFinite(stored) && stored >= 0 ? stored : null;
  } catch {
    return null;
  }
}

function saveBestScore(score) {
  bestScore = score;
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // Practice mode still works when browser storage is unavailable.
  }
}

function readPlayerName() {
  try {
    return localStorage.getItem(PLAYER_NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function savePlayerName(name) {
  playerName = name;
  try {
    localStorage.setItem(PLAYER_NAME_KEY, name);
  } catch {
    // A name can still be used for the current submission.
  }
}

function getPlayerId() {
  try {
    const existing = localStorage.getItem(PLAYER_ID_KEY);
    if (existing && /^[A-Za-z0-9_-]{16,80}$/.test(existing)) return existing;

    const generated = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `player_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 18)}`;

    localStorage.setItem(PLAYER_ID_KEY, generated);
    return generated;
  } catch {
    return `player_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 18)}`;
  }
}

function readDailyState() {
  try {
    const raw = localStorage.getItem(dailyStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.date === challengeDate ? parsed : null;
  } catch {
    return null;
  }
}

function writeDailyState() {
  if (mode !== "daily") return;

  const state = {
    date: challengeDate,
    openTiles: [...openTiles],
    selectedTiles: [...selectedTiles],
    currentRoll,
    rollIndex,
    lastDice,
    attemptStarted,
    roundOver,
    score: dailyScore,
    bestScore: bestDailyScore,
    bestRolls: bestDailyRolls,
    attemptsUsed,
    pendingDice,
    moves: moveHistory,
    submitted: dailySubmitted,
    playerName
  };

  try {
    localStorage.setItem(dailyStorageKey, JSON.stringify(state));
  } catch {
    // The challenge remains playable if storage is unavailable.
  }
}

function randomDie() {
  return Math.floor(Math.random() * 6) + 1;
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

function matchingSubsets(values, target) {
  const matches = [];

  function search(index, chosen, total) {
    if (total === target) {
      matches.push([...chosen]);
      return;
    }
    if (total > target || index >= values.length) return;

    chosen.push(values[index]);
    search(index + 1, chosen, total + values[index]);
    chosen.pop();
    search(index + 1, chosen, total);
  }

  search(0, [], 0);
  return matches.filter((match) => match.length > 0);
}

function reconstructLegacyMoves(state, restoredOpenTiles) {
  const closedTiles = TILE_VALUES.filter((tile) => !restoredOpenTiles.has(tile));
  if (closedTiles.length === 0) return [];

  let successfulRolls = Number.isInteger(state.rollIndex) ? state.rollIndex : 0;
  const restoredScore = sum(restoredOpenTiles);
  const hasUnplayedCurrentRoll = Number.isFinite(state.currentRoll) || Array.isArray(state.pendingDice);

  if (state.roundOver && restoredScore !== 0) successfulRolls -= 1;
  else if (!state.roundOver && hasUnplayedCurrentRoll) successfulRolls -= 1;

  successfulRolls = Math.max(0, successfulRolls);
  const targets = Array.from({ length: successfulRolls }, (_, index) => sum(dailyDiceAt(index)));

  function search(roll, remainingTiles) {
    if (roll === targets.length) return remainingTiles.length === 0 ? [] : null;

    for (const move of matchingSubsets(remainingTiles, targets[roll])) {
      const moveSet = new Set(move);
      const rest = remainingTiles.filter((tile) => !moveSet.has(tile));
      const following = search(roll + 1, rest);
      if (following) return [move, ...following];
    }

    return null;
  }

  return search(0, closedTiles) ?? [];
}

function currentAttemptNumber() {
  if (attemptsUsed >= DAILY_ATTEMPT_LIMIT) return DAILY_ATTEMPT_LIMIT;
  return attemptsUsed + (dailySubmitted ? 0 : 1);
}

function setInstruction(text) {
  instructionElement.textContent = text;
}

function hideRoundResult() {
  roundResult.hidden = true;
  roundResultTitle.textContent = "ROUND OVER";
  roundResultScore.textContent = "0";
  roundResultDetail.textContent = "";
}

function showRoundResult(title, score, detail) {
  roundResultTitle.textContent = title;
  roundResultScore.textContent = String(score);
  roundResultDetail.textContent = detail;
  roundResult.hidden = false;
}

function updateChallengePanel() {
  challengeDateElement.textContent = formatChallengeDate(challengeDate);
  challengeRollElement.textContent = String(rollIndex);
  if (challengeAttemptElement) {
    challengeAttemptElement.textContent = `${currentAttemptNumber()} / ${DAILY_ATTEMPT_LIMIT}`;
  }
  challengeScoreElement.textContent = bestDailyScore === null ? "—" : String(bestDailyScore);
  challengeNameElement.textContent = attemptsUsed > 0 && playerName ? playerName : "YOU";

  if (attemptsUsed >= DAILY_ATTEMPT_LIMIT && dailySubmitted) {
    challengeStatusElement.textContent = "DONE";
    challengeStatusElement.dataset.state = "complete";
  } else if (dailyScore !== null && !dailySubmitted) {
    challengeStatusElement.textContent = "COMPLETE";
    challengeStatusElement.dataset.state = "complete";
  } else if (attemptStarted) {
    challengeStatusElement.textContent = "IN PROGRESS";
    challengeStatusElement.dataset.state = "progress";
  } else if (attemptsUsed > 0 && dailySubmitted) {
    challengeStatusElement.textContent = "NEXT READY";
    challengeStatusElement.dataset.state = "ready";
  } else {
    challengeStatusElement.textContent = "READY";
    challengeStatusElement.dataset.state = "ready";
  }
}

function updateSubmissionPanel() {
  const canSubmit = mode === "daily"
    && roundOver
    && dailyScore !== null
    && !dailySubmitted
    && attemptsUsed < DAILY_ATTEMPT_LIMIT;

  scoreForm.hidden = !canSubmit;

  if (canSubmit) {
    if (!playerNameInput.value && playerName) playerNameInput.value = playerName;
    submissionStatusElement.textContent = `Attempt ${attemptsUsed + 1} is complete. Post it to count.`;
  } else if (mode === "daily" && dailySubmitted && attemptsUsed > 0) {
    const bestText = bestDailyScore === null ? "" : ` Best score: ${bestDailyScore}.`;
    submissionStatusElement.textContent = attemptsUsed < DAILY_ATTEMPT_LIMIT
      ? `Attempt ${attemptsUsed} posted.${bestText}`
      : `All ${DAILY_ATTEMPT_LIMIT} attempts posted.${bestText}`;
  } else {
    submissionStatusElement.textContent = "";
  }
}

function updateModeDisplay() {
  const isDaily = mode === "daily";
  dailyModeButton.classList.toggle("active", isDaily);
  practiceModeButton.classList.toggle("active", !isDaily);
  dailyModeButton.setAttribute("aria-pressed", String(isDaily));
  practiceModeButton.setAttribute("aria-pressed", String(!isDaily));
  bestLabelElement.textContent = isDaily ? "TODAY’S BEST" : "BEST";
  document.body.dataset.mode = mode;

  if (!isDaily) {
    playAgainButton.textContent = "PLAY AGAIN";
    playAgainButton.disabled = false;
  } else if (roundOver && !dailySubmitted) {
    playAgainButton.textContent = "POST ATTEMPT";
    playAgainButton.disabled = true;
  } else if (dailySubmitted && attemptsUsed < DAILY_ATTEMPT_LIMIT) {
    playAgainButton.textContent = `ATTEMPT ${attemptsUsed + 1}`;
    playAgainButton.disabled = false;
  } else {
    playAgainButton.textContent = "PRACTICE";
    playAgainButton.disabled = false;
  }
}

function updateDisplay() {
  const selectedTotal = sum(selectedTiles);
  const openTotal = sum(openTiles);

  tileElements.forEach((tile) => {
    const value = Number(tile.dataset.value);
    const isOpen = openTiles.has(value);
    const isSelected = selectedTiles.has(value);

    tile.classList.toggle("closed", !isOpen);
    tile.classList.toggle("selected", isSelected);
    tile.disabled = !isOpen || currentRoll === null || rolling || roundOver;
    tile.setAttribute("aria-pressed", String(isSelected));
  });

  openTotalElement.textContent = String(openTotal);
  selectedTotalElement.textContent = String(selectedTotal);
  targetTotalElement.textContent = currentRoll === null ? "—" : String(currentRoll);
  bestScoreElement.textContent = mode === "daily"
    ? (bestDailyScore === null ? "—" : String(bestDailyScore))
    : (bestScore === null ? "—" : String(bestScore));
  selectionMeter.classList.toggle("over", currentRoll !== null && selectedTotal > currentRoll);

  rollButton.disabled = rolling || roundOver || currentRoll !== null;
  shutButton.disabled = rolling || roundOver || currentRoll === null || selectedTotal !== currentRoll;
  updateModeDisplay();
  updateChallengePanel();
  updateSubmissionPanel();
}

function finishRound(detail, title = "ROUND OVER") {
  roundOver = true;
  currentRoll = null;
  selectedTiles.clear();

  const score = sum(openTiles);

  if (mode === "daily") {
    dailyScore = score;
    writeDailyState();
    setInstruction(title === "SHUT THE BOX" ? "Daily box shut." : "Daily attempt complete.");
    showRoundResult(
      title,
      score,
      `${detail} This is attempt ${attemptsUsed + 1} of ${DAILY_ATTEMPT_LIMIT}.`
    );
  } else {
    const isBest = bestScore === null || score < bestScore;
    if (isBest) saveBestScore(score);
    const resultDetail = isBest && score !== 0 ? `${detail} New best score.` : detail;
    setInstruction(title === "SHUT THE BOX" ? "Perfect round." : "No move available.");
    showRoundResult(title, score, resultDetail);
  }

  updateDisplay();
}

function settleDice(first, second) {
  pendingDice = null;
  lastDice = [first, second];
  setDieFace(dieOne, first, "First die");
  setDieFace(dieTwo, second, "Second die");

  currentRoll = first + second;
  rollTotalElement.textContent = String(currentRoll);
  selectedTiles.clear();
  rolling = false;
  dieOne.classList.remove("rolling");
  dieTwo.classList.remove("rolling");

  if (mode === "daily") writeDailyState();

  if (!hasCombination(openTiles, currentRoll)) {
    finishRound(`No open combination makes ${currentRoll}.`);
    return;
  }

  setInstruction(`Choose open tiles totaling ${currentRoll}.`);
  updateDisplay();
}

function rollDice() {
  if (rolling || roundOver || currentRoll !== null) return;

  const token = ++rollToken;
  rolling = true;
  selectedTiles.clear();
  rollTotalElement.textContent = "…";
  setInstruction("Rolling...");

  let finalDice;
  if (mode === "daily") {
    attemptStarted = true;
    finalDice = dailyDiceAt(rollIndex);
    rollIndex += 1;
    pendingDice = finalDice;
    writeDailyState();
  } else {
    finalDice = [randomDie(), randomDie()];
  }

  updateDisplay();

  dieOne.classList.remove("rolling");
  dieTwo.classList.remove("rolling");
  void dieOne.offsetWidth;
  dieOne.classList.add("rolling");
  dieTwo.classList.add("rolling");

  let shuffleCount = 0;
  const shuffle = window.setInterval(() => {
    setDieFace(dieOne, randomDie(), "First die");
    setDieFace(dieTwo, randomDie(), "Second die");
    shuffleCount += 1;
    if (shuffleCount >= 7) window.clearInterval(shuffle);
  }, 75);

  window.setTimeout(() => {
    if (token === rollToken) settleDice(finalDice[0], finalDice[1]);
  }, 690);
}

function toggleTile(value) {
  if (!openTiles.has(value) || currentRoll === null || rolling || roundOver) return;

  if (selectedTiles.has(value)) selectedTiles.delete(value);
  else selectedTiles.add(value);

  const selectedTotal = sum(selectedTiles);
  if (selectedTotal > currentRoll) {
    setInstruction("Too high. Tap a selected tile to undo it.");
  } else if (selectedTotal === currentRoll) {
    setInstruction("That works. Shut the selected tiles.");
  } else {
    setInstruction(`${currentRoll - selectedTotal} more.`);
  }

  if (mode === "daily") writeDailyState();
  updateDisplay();
}

function shutSelected() {
  if (currentRoll === null || sum(selectedTiles) !== currentRoll || roundOver) return;

  const completedMove = [...selectedTiles].sort((a, b) => a - b);
  selectedTiles.forEach((value) => openTiles.delete(value));
  if (mode === "daily") moveHistory.push(completedMove);
  selectedTiles.clear();
  currentRoll = null;
  rollTotalElement.textContent = "—";

  if (mode === "daily") writeDailyState();

  if (openTiles.size === 0) {
    if (mode === "practice" && bestScore !== 0) saveBestScore(0);
    finishRound("Every tile is shut.", "SHUT THE BOX");
    return;
  }

  setInstruction(mode === "daily" ? "Clean. Next daily roll." : "Clean. Roll again.");
  updateDisplay();
}

function resetCurrentBoard() {
  rollToken += 1;
  openTiles = new Set(TILE_VALUES);
  selectedTiles = new Set();
  currentRoll = null;
  rolling = false;
  roundOver = false;
  rollIndex = 0;
  lastDice = [1, 1];
  attemptStarted = false;
  dailyScore = null;
  pendingDice = null;
  moveHistory = [];
  dailySubmitted = false;

  dieOne.classList.remove("rolling");
  dieTwo.classList.remove("rolling");
  setDieFace(dieOne, 1, "First die");
  setDieFace(dieTwo, 1, "Second die");
  rollTotalElement.textContent = "—";
  hideRoundResult();
}

function restoreDailyState() {
  const state = readDailyState();
  resetCurrentBoard();
  attemptsUsed = 0;
  bestDailyScore = null;
  bestDailyRolls = null;

  if (!state) {
    setInstruction(`Attempt 1 of ${DAILY_ATTEMPT_LIMIT}. Same dice for everyone.`);
    updateDisplay();
    return;
  }

  openTiles = new Set(state.openTiles ?? TILE_VALUES);
  selectedTiles = new Set(state.selectedTiles ?? []);
  currentRoll = Number.isFinite(state.currentRoll) ? state.currentRoll : null;
  rollIndex = Number.isInteger(state.rollIndex) ? state.rollIndex : 0;
  lastDice = Array.isArray(state.lastDice) ? state.lastDice : [1, 1];
  attemptStarted = Boolean(state.attemptStarted);
  roundOver = Boolean(state.roundOver);
  dailyScore = Number.isFinite(state.score) ? state.score : null;
  pendingDice = Array.isArray(state.pendingDice) ? state.pendingDice : null;
  moveHistory = Array.isArray(state.moves)
    ? state.moves.map((move) => [...move])
    : reconstructLegacyMoves(state, openTiles);
  dailySubmitted = Boolean(state.submitted);
  attemptsUsed = Number.isInteger(state.attemptsUsed)
    ? Math.max(0, Math.min(DAILY_ATTEMPT_LIMIT, state.attemptsUsed))
    : (dailySubmitted ? 1 : 0);
  bestDailyScore = Number.isFinite(state.bestScore)
    ? Number(state.bestScore)
    : (dailySubmitted && dailyScore !== null ? dailyScore : null);
  bestDailyRolls = Number.isFinite(state.bestRolls) ? Number(state.bestRolls) : null;
  playerName = typeof state.playerName === "string" && state.playerName ? state.playerName : readPlayerName();

  if (!roundOver && pendingDice) {
    lastDice = pendingDice;
    currentRoll = pendingDice[0] + pendingDice[1];
    pendingDice = null;
    writeDailyState();
  }

  setDieFace(dieOne, lastDice[0], "First die");
  setDieFace(dieTwo, lastDice[1], "Second die");
  rollTotalElement.textContent = currentRoll === null ? "—" : String(currentRoll);

  if (roundOver && dailyScore !== null) {
    setInstruction(dailySubmitted ? "Daily attempt posted." : "Daily attempt complete.");
    showRoundResult(
      dailyScore === 0 ? "SHUT THE BOX" : "ROUND OVER",
      dailyScore,
      dailySubmitted
        ? `Attempt ${attemptsUsed} is verified. Your best score is ${bestDailyScore}.`
        : `Attempt ${attemptsUsed + 1} is saved on this device. Post it to count.`
    );
  } else if (currentRoll !== null) {
    setInstruction(`Choose open tiles totaling ${currentRoll}.`);
  } else if (attemptStarted) {
    setInstruction("Daily attempt resumed. Roll when ready.");
  } else if (attemptsUsed >= DAILY_ATTEMPT_LIMIT) {
    setInstruction(`All ${DAILY_ATTEMPT_LIMIT} daily attempts are complete.`);
  } else {
    setInstruction(`Attempt ${attemptsUsed + 1} of ${DAILY_ATTEMPT_LIMIT}. Same dice for everyone.`);
  }

  updateDisplay();
}

function startPractice() {
  mode = "practice";
  resetCurrentBoard();
  setInstruction("Practice round. Unlimited retries.");
  updateDisplay();
}

function startNextDailyAttempt() {
  if (!dailySubmitted || attemptsUsed >= DAILY_ATTEMPT_LIMIT) return;
  mode = "daily";
  resetCurrentBoard();
  setInstruction(`Attempt ${attemptsUsed + 1} of ${DAILY_ATTEMPT_LIMIT}. Same dice. Try a better route.`);
  writeDailyState();
  updateDisplay();
}

function startDaily() {
  mode = "daily";
  restoreDailyState();
  loadLeaderboard();
}

function createLeaderboardRow(entry) {
  const row = document.createElement("div");
  row.className = "daily-board-row leaderboard-row";

  const isPlayer = attemptsUsed > 0
    && entry.name === playerName
    && Number(entry.score) === bestDailyScore;
  if (isPlayer) row.classList.add("is-player");

  const rank = document.createElement("span");
  rank.className = "rank-cell";
  rank.textContent = String(entry.rank);

  const name = document.createElement("strong");
  name.className = "name-cell";
  name.textContent = entry.name;
  if (isPlayer) {
    const badge = document.createElement("span");
    badge.className = "you-badge";
    badge.textContent = "YOU";
    name.append(" ", badge);
  }

  const score = document.createElement("span");
  score.className = "score-cell";
  score.textContent = String(entry.score);

  row.append(rank, name, score);
  return row;
}

function renderLeaderboard() {
  leaderboardRowsElement.replaceChildren();
  challengeRankElement.textContent = "—";

  if (leaderboardLoading) {
    const message = document.createElement("p");
    message.className = "leaderboard-message";
    message.textContent = "Loading today’s board…";
    leaderboardRowsElement.append(message);
    return;
  }

  if (leaderboard.length === 0) {
    const message = document.createElement("p");
    message.className = "leaderboard-message";
    message.textContent = "No posted scores yet. First name on the board gets the top line.";
    leaderboardRowsElement.append(message);
    return;
  }

  let matchedPlayer = false;
  leaderboard.forEach((entry) => {
    leaderboardRowsElement.append(createLeaderboardRow(entry));
    if (!matchedPlayer && attemptsUsed > 0 && entry.name === playerName && Number(entry.score) === bestDailyScore) {
      matchedPlayer = true;
      challengeRankElement.textContent = String(entry.rank);
    }
  });
}

async function loadLeaderboard() {
  leaderboardLoading = true;
  renderLeaderboard();

  try {
    const response = await fetch(`${API_BASE}/leaderboard?date=${encodeURIComponent(challengeDate)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Leaderboard request failed.");
    leaderboard = Array.isArray(data.leaderboard) ? data.leaderboard : [];
  } catch {
    leaderboard = [];
    leaderboardRowsElement.replaceChildren();
    const message = document.createElement("p");
    message.className = "leaderboard-message error";
    message.textContent = "Today’s board could not be reached. Your game still works.";
    leaderboardRowsElement.append(message);
    leaderboardLoading = false;
    return;
  }

  leaderboardLoading = false;
  renderLeaderboard();
}

function cleanPlayerName(value) {
  return value.trim().replace(/\s+/g, " ");
}

async function submitDailyScore(event) {
  event.preventDefault();
  if (
    mode !== "daily"
    || !roundOver
    || dailyScore === null
    || dailySubmitted
    || attemptsUsed >= DAILY_ATTEMPT_LIMIT
  ) return;

  const name = cleanPlayerName(playerNameInput.value);
  if (name.length < 1 || name.length > 20) {
    submissionStatusElement.textContent = "Use a name from 1 to 20 characters.";
    playerNameInput.focus();
    return;
  }

  submitScoreButton.disabled = true;
  submissionStatusElement.textContent = `Checking attempt ${attemptsUsed + 1}…`;

  try {
    const response = await fetch(`${API_BASE}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challenge_date: challengeDate,
        player_id: getPlayerId(),
        player_name: name,
        moves: moveHistory
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Score submission failed.");

    savePlayerName(data.player_name || name);
    dailyScore = Number(data.score);
    dailySubmitted = true;
    attemptsUsed = Number.isInteger(data.attempt_number)
      ? data.attempt_number
      : Math.min(DAILY_ATTEMPT_LIMIT, attemptsUsed + 1);
    bestDailyScore = Number.isFinite(Number(data.best_score)) ? Number(data.best_score) : dailyScore;
    bestDailyRolls = Number.isFinite(Number(data.best_rolls_used)) ? Number(data.best_rolls_used) : null;
    writeDailyState();
    updateDisplay();

    submissionStatusElement.textContent = data.improved
      ? `Attempt ${attemptsUsed} posted. New best: ${bestDailyScore}.`
      : `Attempt ${attemptsUsed} posted. Best remains ${bestDailyScore}.`;

    await loadLeaderboard();
  } catch (error) {
    submissionStatusElement.textContent = error.message || "Could not post the score.";
  } finally {
    submitScoreButton.disabled = false;
  }
}

tileElements.forEach((tile) => {
  tile.addEventListener("click", () => toggleTile(Number(tile.dataset.value)));
});

rollButton.addEventListener("click", rollDice);
shutButton.addEventListener("click", shutSelected);
dailyModeButton.addEventListener("click", startDaily);
practiceModeButton.addEventListener("click", startPractice);
playAgainButton.addEventListener("click", () => {
  if (mode === "daily" && dailySubmitted && attemptsUsed < DAILY_ATTEMPT_LIMIT) {
    startNextDailyAttempt();
  } else {
    startPractice();
  }
});
scoreForm.addEventListener("submit", submitDailyScore);

buildDie(dieOne);
buildDie(dieTwo);
if (playerName) playerNameInput.value = playerName;
startDaily();
