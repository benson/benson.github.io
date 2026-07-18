import { Simulation } from "./engine.js?v=20260718.4";
import { hashSimulationState, replayGameplayFeatures } from "./replay.js?v=20260718.4";

export function anonymousReplayToken(slot) {
  const digit = Math.max(0, Math.min(3, Number(slot) || 0)) + 1;
  return digit.toString(16).repeat(24);
}

export function createGameReplayAdapters() {
  const generations = new WeakMap();
  const masteryStarts = new WeakMap();
  const playerForSlot = (simulation, slot) => simulation.players.find((player) => player.replaySlot === slot);
  const nextId = (simulation, slot) => {
    const values = generations.get(simulation) || new Map();
    const generation = (values.get(slot) || 0) + 1;
    values.set(slot, generation); generations.set(simulation, values);
    return `replay-${slot}-${generation}`;
  };
  const addPlayer = (simulation, slot, specialist, masteryStart = "baseline") => simulation.addPlayer({
    id: nextId(simulation, slot), name: `Specialist ${slot + 1}`, specialist, replaySlot: slot, masteryStart, resumeToken: anonymousReplayToken(slot),
  }, slot);
  const deployLateJoin = (simulation, command) => {
    if (!simulation.joinInProgressNormalization) return addPlayer(simulation, command.slot, command.specialist);
    if (typeof simulation.deployLateJoin !== "function") throw new Error("Replay simulation does not implement deterministic late-join deployment");
    return simulation.deployLateJoin({
      id: nextId(simulation, command.slot), name: `Specialist ${command.slot + 1}`,
      specialist: command.specialist, replaySlot: command.slot, resumeToken: anonymousReplayToken(command.slot),
    }, { packageId: command.packageId, catchUpRanks: command.catchUpRanks });
  };

  return Object.freeze({
    createSimulation(replay) {
      const features = replayGameplayFeatures(replay);
      const simulation = new Simulation({
        ...replay.run, features,
        players: replay.roster.map(({ slot, specialist, masteryStart = "baseline" }) => ({
          id: `replay-${slot}-0`, name: `Specialist ${slot + 1}`, specialist, replaySlot: slot, masteryStart, resumeToken: anonymousReplayToken(slot),
        })),
      }, { seed: replay.seed, balanceVersion: replay.balance.version, balanceHash: replay.balance.hash, features });
      generations.set(simulation, new Map(replay.roster.map(({ slot }) => [slot, 0])));
      masteryStarts.set(simulation, new Map(replay.roster.map(({ slot, masteryStart = "baseline" }) => [slot, masteryStart])));
      return simulation;
    },
    applyCommand(simulation, command) {
      const player = command.slot === undefined ? null : playerForSlot(simulation, command.slot);
      if (command.kind === "input") { if (!player || !simulation.setInput(player.id, command.input)) throw new Error(`Replay input references inactive slot ${command.slot}`); }
      else if (command.kind === "cast") { if (!player || !simulation.cast(player.id, command.cast)) throw new Error(`Replay cast was rejected for slot ${command.slot}`); }
      else if (command.kind === "upgrade") {
        const result = player && simulation.draftAction(player.id, { type: "pick", choiceId: command.choiceId });
        if (!result?.accepted) throw new Error(`Replay upgrade was rejected for slot ${command.slot}`);
      }
      else if (command.kind === "draft-reroll") {
        const result = player && simulation.draftAction(player.id, { type: "reroll" });
        if (!result?.accepted) throw new Error(`Replay reroll was rejected for slot ${command.slot}`);
      }
      else if (command.kind === "draft-banish") {
        const result = player && simulation.draftAction(player.id, { type: "banish", choiceId: command.choiceId });
        if (!result?.accepted) throw new Error(`Replay banish was rejected for slot ${command.slot}`);
      }
      else if (command.kind === "draft-skip") {
        const result = player && simulation.draftAction(player.id, { type: "skip" });
        if (!result?.accepted) throw new Error(`Replay skip was rejected for slot ${command.slot}`);
      }
      else if (command.kind === "draft-replace") {
        const result = player && simulation.draftAction(player.id, { type: "replace", choiceId: command.choiceId, replacementId: command.replacementId });
        if (!result?.accepted) throw new Error(`Replay replacement was rejected for slot ${command.slot}`);
      }
      else if (command.kind === "join") deployLateJoin(simulation, command);
      else if (command.kind === "leave") { if (!player) throw new Error(`Replay leave references inactive slot ${command.slot}`); simulation.removePlayer(player.id); }
      else if (command.kind === "reconnect") {
        addPlayer(simulation, command.slot, command.specialist || player?.specialist || "zuri", masteryStarts.get(simulation)?.get(command.slot) || "baseline");
      }
      else if (command.kind === "abandon") simulation.lose("The squad withdrew from the breach.");
      else throw new Error(`Unsupported replay command ${command.kind}`);
    },
    stepSimulation(simulation, dt) { simulation.update(dt); },
    hashState: hashSimulationState,
  });
}
