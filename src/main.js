const MAP_SIZE = 11;
const TILES = { EMPTY:"░", ALLEY:"A", DATA:"D", BAR:"N", START:"S", EXIT:"E", PLAYER:"P" };
const GENRE_ADVANTAGE = { "Lo-Fi":"Aggro-Industrial", "High Frequency":"Deep Bass", "Deep Bass":"Lo-Fi" };
const SPRITE_SCALE = 8, SPRITE_GRID = 8;

let moves = [], state = null;
const refs = {
  map: document.getElementById("map"),
  playerStatus: document.getElementById("player-status"),
  enemyStatus: document.getElementById("enemy-status"),
  battleLog: document.getElementById("battle-log"),
  moves: document.getElementById("moves"),
  endTurn: document.getElementById("end-turn"),
  newRun: document.getElementById("new-run")
};

const rngFromSeed = (seedValue) => {
  let seed = seedValue >>> 0;
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
};

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function createProceduralSprite({ seed, healthRatio, role }) {
  const seedHash = hashString(`${seed}:${role}`);
  const rand = rngFromSeed(seedHash);
  const svgSize = SPRITE_GRID * SPRITE_SCALE;
  const pixels = [];
  const baseColor = role === "enemy" ? "#31ff7a" : healthRatio > .6 ? "#00e5ff" : healthRatio > .3 ? "#b700ff" : "#ff00d4";
  const accent = healthRatio <= .3 ? "#ff00d4" : "#00e5ff";

  pixels.push(`<rect width="${svgSize}" height="${svgSize}" fill="#0b1020"/>`);
  for (let y = 0; y < SPRITE_GRID; y++) for (let x = 0; x < Math.ceil(SPRITE_GRID/2); x++) {
    if (rand() <= .33) continue;
    const color = rand() > .82 ? accent : baseColor;
    const leftX = x * SPRITE_SCALE, rightX = (SPRITE_GRID - 1 - x) * SPRITE_SCALE, py = y * SPRITE_SCALE;
    pixels.push(`<rect x="${leftX}" y="${py}" width="${SPRITE_SCALE}" height="${SPRITE_SCALE}" fill="${color}"/>`);
    pixels.push(`<rect x="${rightX}" y="${py}" width="${SPRITE_SCALE}" height="${SPRITE_SCALE}" fill="${color}"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" shape-rendering="crispEdges">${pixels.join("")}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function generateDistrict(seed) {
  const rand = rngFromSeed(seed);
  const grid = Array.from({ length: MAP_SIZE }, () => Array(MAP_SIZE).fill(TILES.EMPTY));
  const start = { x: 0, y: Math.floor(rand() * MAP_SIZE) };
  const exit = { x: MAP_SIZE - 1, y: Math.floor(rand() * MAP_SIZE) };
  let current = { ...start };
  grid[current.y][current.x] = TILES.START;

  while (current.x !== exit.x || current.y !== exit.y) {
    if (rand() > .45 && current.x < exit.x) current.x++;
    else if (current.y < exit.y) current.y++;
    else if (current.y > exit.y) current.y--;
    else if (current.x < exit.x) current.x++;
    const roll = rand();
    grid[current.y][current.x] = roll > .66 ? TILES.DATA : roll > .33 ? TILES.BAR : TILES.ALLEY;
  }
  grid[start.y][start.x] = TILES.START; grid[exit.y][exit.x] = TILES.EXIT;
  return { grid, start, exit };
}

const createActor = (name, genre, bpm) => ({ name, genre, bpm, maxVolume:100, volume:100, amps:40, resonance:12, distortion:false });

function initGame(seed = Date.now()) {
  const district = generateDistrict(seed);
  state = {
    seed, district, player: createActor("Vibe-Runner","Lo-Fi",124), enemy: createActor("Noise Warden","Aggro-Industrial",112),
    turnQueue: [], playerPos: { ...district.start }, beatWindowMs: { perfect:80, good:140 }
  };
  recalcTurnQueue(); render(); log(`New run seeded with ${seed}.`);
}

function recalcTurnQueue() {
  state.turnQueue = [state.player, state.enemy]
    .map(actor => ({ actor, initiative: actor.bpm + Math.floor(Math.random()*8) }))
    .sort((a,b) => b.initiative - a.initiative)
    .map(entry => entry.actor.name);
}

function calculateDamage(move, defender, syncGrade) {
  const resonanceFactor = Math.max(.35, 1 - defender.resonance / 100);
  const genreFactor = GENRE_ADVANTAGE[move.genre] === defender.genre ? 1.25 : 1;
  const syncFactor = syncGrade === "perfect" ? 2 : syncGrade === "good" ? 1.35 : 1;
  return Math.floor(move.damage * resonanceFactor * genreFactor * syncFactor);
}
const simulateBeatSync = () => (Math.random()*220 <= state.beatWindowMs.perfect ? "perfect" : Math.random()*220 <= state.beatWindowMs.good ? "good" : "miss");

function useMove(move) {
  if (state.player.amps < move.ampCost) return log(`Not enough Amps for ${move.name}.`);
  state.player.amps -= move.ampCost;
  const sync = move.effect === "sync_bonus" ? simulateBeatSync() : "miss";
  const damage = calculateDamage(move, state.enemy, sync);
  state.enemy.volume = Math.max(0, state.enemy.volume - damage);
  if (move.effect === "distortion") state.enemy.distortion = true;
  log(`${state.player.name} played ${move.name} for ${damage} dmg.${sync !== "miss" ? ` Sync: ${sync.toUpperCase()}.` : ""}`);
  if (state.enemy.volume === 0) log(`${state.enemy.name} has been muted.`); else enemyTurn();
  recalcTurnQueue(); render();
}

function enemyTurn() {
  const damage = Math.floor(18 * (state.enemy.distortion ? .7 : 1));
  state.player.volume = Math.max(0, state.player.volume - damage);
  log(`${state.enemy.name} fires feedback for ${damage} dmg.`);
  if (state.player.volume === 0) log("Silence. Run ended.");
}
const playerColor = (v) => (v/100 > .6 ? "#00e5ff" : v/100 > .3 ? "#b700ff" : "#ff00d4");

function renderStatus(actor, isPlayer) {
  const isLow = actor.volume <= 30;
  const color = isPlayer ? playerColor(actor.volume) : "#31ff7a";
  const spriteSrc = createProceduralSprite({ seed: `${state.seed}-${actor.name}`, healthRatio: actor.volume/actor.maxVolume, role: isPlayer ? "player" : "enemy" });
  return `<img class="avatar ${isLow ? "glitch" : ""}" alt="${actor.name} sprite" src="${spriteSrc}" style="border-color:${color};" />
<strong>${actor.name}</strong><br>Genre: ${actor.genre}<br>BPM: ${actor.bpm}<br>Volume: ${actor.volume}/${actor.maxVolume}<br>Amps: ${actor.amps}<br>Resonance: ${actor.resonance}`;
}

function renderMap() { const map = state.district.grid.map(r => [...r]); map[state.playerPos.y][state.playerPos.x] = TILES.PLAYER; return map.map(r => r.join(" ")).join("\n"); }
function renderMoves() {
  refs.moves.innerHTML = "";
  moves.forEach(move => {
    const btn = document.createElement("button");
    btn.textContent = `${move.name} (${move.ampCost}A)`;
    btn.style.borderColor = move.colorCode;
    btn.addEventListener("click", () => useMove(move));
    refs.moves.appendChild(btn);
  });
}
function log(message) { const line = document.createElement("div"); line.textContent = `> ${message}`; refs.battleLog.prepend(line); }
function render() { refs.playerStatus.innerHTML = renderStatus(state.player,true); refs.enemyStatus.innerHTML = renderStatus(state.enemy,false); refs.map.textContent = renderMap(); }

async function bootstrap() {
  const response = await fetch("data/moves.json");
  moves = await response.json();
  refs.endTurn.addEventListener("click", () => { recalcTurnQueue(); log(`Turn order: ${state.turnQueue.join(" → ")}`); render(); });
  refs.newRun.addEventListener("click", () => initGame(Math.floor(Math.random()*10000000)));
  renderMoves(); initGame();
}
bootstrap();


import('./game.js').then(({ MelodicJusticeGame }) => { window.MelodicJusticeGame = MelodicJusticeGame; console.log('MelodicJusticeGame scaffold loaded'); });
