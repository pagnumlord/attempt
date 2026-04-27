export class MelodicJusticeGame {
  constructor(refs, moves = []) {
    this.refs = refs;
    this.moves = moves;
    this.state = {
      mode: "boot",
      seed: Date.now()
    };
  }

  setMode(mode) {
    this.state.mode = mode;
  }

  setMoves(moves) {
    this.moves = Array.isArray(moves) ? moves : [];
  }

  log(message) {
    if (!this.refs?.battleLog) return;
    const line = document.createElement("div");
    line.textContent = `> ${message}`;
    this.refs.battleLog.prepend(line);
  }

  init() {
    this.setMode("overworld");
    this.log("Game controller initialized (incremental migration step).");
  }
}
