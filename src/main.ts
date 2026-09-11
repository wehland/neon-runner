import { Game } from "./game/Game";
import { attachInstrumentation } from "./test/instrumentation";

const canvas = document.getElementById("game-canvas");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing #game-canvas");
}

const game = new Game(canvas);
attachInstrumentation(game);

function onKeyDown(event: KeyboardEvent): void {
  if (event.repeat) return;
  game.audio.unlock();
  const key = event.key;
  if (key === "ArrowLeft" || key === "a" || key === "A") {
    event.preventDefault();
    game.sim.moveLeft();
  } else if (key === "ArrowRight" || key === "d" || key === "D") {
    event.preventDefault();
    game.sim.moveRight();
  } else if (key === " " || key === "Spacebar") {
    event.preventDefault();
    game.sim.jump();
  }
}

window.addEventListener("keydown", onKeyDown);
window.addEventListener("resize", () => game.resize());
game.startLoop();
