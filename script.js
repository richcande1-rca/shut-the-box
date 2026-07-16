"use strict";

const TILE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BEST_SCORE_KEY = "shut-the-box-best-score-v1";
const DAILY_STATE_PREFIX = "shut-the-box-daily-v1:";

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
let pendingDice = null;

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

const challengeDate = utcDateKey();
const dailyStorageKey = `${DAILY_STATE_PREFIX}${challengeDate}`;

function formatChallengeDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
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
    pendingDice
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

  if (dailyScore !== null) {
    challengeStatusElement.textContent = "COMPLETE";
    challengeStatusElement.dataset.state = "complete";
    challengeScoreElement.textContent = String(dailyScore);
  } else if (attemptStarted) {
    challengeStatusElement.textContent = "IN PROGRESS";
    challengeStatusElement.dataset.state = "progress";
    challengeScoreElement.textContent = "—";
  } else {
    challengeStatusElement.textContent = "READY";
    challengeStatusElement.dataset.state = "ready";
    challengeScoreElement.textContent = "—";
  }
}

function updateModeDisplay() {
  const isDaily = mode === "daily";
  dailyModeButton.classList.toggle("active", isDaily);
  practiceModeButton.classList.toggle("active", !isDaily);
  dailyModeButton.setAttribute("aria-pressed", String(isDaily));
  practiceModeButton.setAttribute("aria-pressed", String(!isDaily));
  bestLabelElement.textContent = isDaily ? "TODAY" : "BEST";
  document.body.dataset.mode = mode;
  playAgainButton.textContent = isDaily ? "PRACTICE" : "PLAY AGAIN";
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
    ? (dailyScore === null ? "—" : String(dailyScore))
    : (bestScore === null ? "—" : String(bestScore));
  selectionMeter.classList.toggle("over", currentRoll !== null && selectedTotal > currentRoll);

  rollButton.disabled = rolling || roundOver || currentRoll !== null;
  shutButton.disabled = rolling || roundOver || currentRoll === null || selectedTotal !== currentRoll;
  updateModeDisplay();
  updateChallengePanel();
}

function finishRound(detail, title = "ROUND OVER") {
  roundOver = true;
  currentRoll = null;
  selectedTiles.clear();

  const score = sum(openTiles);

  if (mode === "daily") {
    dailyScore = score;
    writeDailyState();
    setInstruction(title === "SHUT THE BOX" ? "Daily box shut." : "Daily run complete.");
    showRoundResult(title, score, `${detail} This is your official score for today.`);
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

  selectedTiles.forEach((value) => openTiles.delete(value));
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

function resetBoard() {
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

  dieOne.classList.remove("rolling");
  dieTwo.classList.remove("rolling");
  setDieFace(dieOne, 1, "First die");
  setDieFace(dieTwo, 1, "Second die");
  rollTotalElement.textContent = "—";
  hideRoundResult();
}

function restoreDailyState() {
  const state = readDailyState();
  resetBoard();

  if (!state) {
    setInstruction("One official run. Same dice for everyone.");
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
    setInstruction("Daily run complete.");
    showRoundResult(
      dailyScore === 0 ? "SHUT THE BOX" : "ROUND OVER",
      dailyScore,
      "Your official score is saved for today."
    );
  } else if (currentRoll !== null) {
    setInstruction(`Choose open tiles totaling ${currentRoll}.`);
  } else if (attemptStarted) {
    setInstruction("Daily run resumed. Roll when ready.");
  } else {
    setInstruction("One official run. Same dice for everyone.");
  }

  updateDisplay();
}

function startPractice() {
  mode = "practice";
  resetBoard();
  setInstruction("Practice round. Unlimited retries.");
  updateDisplay();
}

function startDaily() {
  mode = "daily";
  restoreDailyState();
}

tileElements.forEach((tile) => {
  tile.addEventListener("click", () => toggleTile(Number(tile.dataset.value)));
});

rollButton.addEventListener("click", rollDice);
shutButton.addEventListener("click", shutSelected);
dailyModeButton.addEventListener("click", startDaily);
practiceModeButton.addEventListener("click", startPractice);
playAgainButton.addEventListener("click", startPractice);

buildDie(dieOne);
buildDie(dieTwo);
startDaily();
