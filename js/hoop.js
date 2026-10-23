// A street basketball hoop on the right wall of the sidewalk. The backboard and the front of
// the rim are static bodies; the net is drawn only. A tile scores when its center drops through
// the rim opening from above.

import { Body } from "./physics.js";

const BOARD_W = 0.5;
const BOARD_ABOVE_RIM = 0.9;
const BOARD_BELOW_RIM = 0.25;
const RIM_LENGTH = 1.45;
const NET_DEPTH = 0.7;
const SCORE_COOLDOWN = 0.8;

export class Hoop {
  constructor(world) {
    this.world = world;
    this.bodies = [];
    this.score = 0;
    this.best = 0;
    this.netKick = 0;
    this.flash = 0;
    this.time = 0;
  }

  layout(widthM, floorY, rimHeight) {
    for (const b of this.bodies) {
      this.world.remove(b);
    }
    this.floorY = floorY;
    this.rimY = floorY - rimHeight;
    this.boardRight = widthM - 0.1;
    this.boardLeft = this.boardRight - BOARD_W;
    this.rimFront = this.boardLeft - RIM_LENGTH;
    this.rimCenter = (this.rimFront + this.boardLeft) / 2;

    const board = new Body(BOARD_W, BOARD_ABOVE_RIM + BOARD_BELOW_RIM);
    board.x = this.boardLeft + BOARD_W / 2;
    board.y = this.rimY + (BOARD_BELOW_RIM - BOARD_ABOVE_RIM) / 2;
    board.friction = 0.4;
    board.restitution = 0.3;
    const tip = new Body(0.14, 0.08);
    tip.x = this.rimFront;
    tip.y = this.rimY;
    tip.friction = 0.3;
    tip.restitution = 0.35;
    this.bodies = [board, tip];
    for (const b of this.bodies) {
      this.world.add(b);
    }
  }

  // Returns true when `body` just fell through the rim opening.
  passed(body, prevY, now) {
    if (body.vy <= 0 || prevY >= this.rimY || body.y < this.rimY) {
      return false;
    }
    if (body.x <= this.rimFront + 0.07 || body.x >= this.boardLeft) {
      return false;
    }
    const last = body.data.lastScoreAt ?? -Infinity;
    if (now - last < SCORE_COOLDOWN) {
      return false;
    }
    return true;
  }

  add(points) {
    this.score += points;
    this.best = Math.max(this.best, this.score);
    this.netKick = 1;
    this.flash = 1;
  }

  step(dt) {
    this.time += dt;
    this.netKick = Math.max(0, this.netKick - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 2);
  }

  animating() {
    return this.netKick > 0 || this.flash > 0;
  }

  // Pole and backboard, drawn behind the tiles. `k` converts meters to canvas pixels.
  drawBack(g, k, font) {
    const top = (this.rimY - BOARD_ABOVE_RIM) * k;
    const bottom = (this.rimY + BOARD_BELOW_RIM) * k;
    const left = this.boardLeft * k;
    const width = BOARD_W * k;

    g.fillStyle = "#2c2656";
    g.fillRect((this.boardRight - 0.16) * k, bottom, 0.08 * k, this.floorY * k - bottom);

    g.save();
    g.shadowColor = "#3ef0ff";
    g.shadowBlur = (8 + this.flash * 18) * (k / 80);
    g.fillStyle = "rgba(10, 8, 26, 0.95)";
    g.strokeStyle = this.flash > 0 ? "#d8ff4f" : "#3ef0ff";
    g.lineWidth = Math.max(2, 0.035 * k);
    g.beginPath();
    g.roundRect(left, top, width, bottom - top, 0.06 * k);
    g.fill();
    g.stroke();
    g.restore();

    const size = Math.round(0.26 * k);
    g.font = `${size}px ${font}`;
    g.textAlign = "center";
    g.textBaseline = "top";
    g.fillStyle = "#d8ff4f";
    g.fillText(String(this.score).padStart(2, "0"), left + width / 2, top + 0.1 * k);
    g.font = `${Math.round(0.12 * k)}px ${font}`;
    g.fillStyle = "#a8a1cb";
    g.fillText(`HI ${String(this.best).padStart(2, "0")}`, left + width / 2, top + 0.4 * k);

    g.strokeStyle = "rgba(255, 255, 255, 0.35)";
    g.lineWidth = Math.max(1, 0.02 * k);
    g.strokeRect(left + width * 0.22, this.rimY * k - 0.3 * k, width * 0.56, 0.26 * k);
  }

  // Rim and net, drawn in front of the tiles.
  drawFront(g, k) {
    const y = this.rimY * k;
    const x0 = this.rimFront * k;
    const x1 = this.boardLeft * k;
    const cx = (x0 + x1) / 2;
    const depth = (NET_DEPTH + this.netKick * 0.18) * k;
    const sway = this.netKick * 0.08 * k;
    const n = 6;

    g.save();
    g.strokeStyle = "rgba(244, 240, 255, 0.55)";
    g.lineWidth = Math.max(1, 0.018 * k);
    const tops = [];
    const bottoms = [];
    for (let i = 0; i <= n; i++) {
      const tx = x0 + ((x1 - x0) * i) / n;
      const wobble = Math.sin(this.time * 18 + i) * sway;
      tops.push([tx, y]);
      bottoms.push([cx + (tx - cx) * 0.62 + wobble, y + depth]);
    }
    for (let i = 0; i <= n; i++) {
      g.beginPath();
      g.moveTo(...tops[i]);
      g.lineTo(...bottoms[i]);
      g.stroke();
    }
    for (let i = 0; i < n; i++) {
      g.beginPath();
      g.moveTo(...tops[i]);
      g.lineTo(...bottoms[i + 1]);
      g.moveTo(...tops[i + 1]);
      g.lineTo(...bottoms[i]);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(...bottoms[0]);
    g.lineTo(...bottoms[n]);
    g.stroke();

    g.shadowColor = "#ff7a3d";
    g.shadowBlur = 10 * (k / 80);
    g.strokeStyle = "#ff7a3d";
    g.lineWidth = Math.max(3, 0.06 * k);
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x1, y);
    g.stroke();
    g.restore();
  }
}
