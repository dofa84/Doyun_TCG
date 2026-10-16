import { legalActions, other, damage } from "./engine";
import type { GameState, GameView } from "./types";
export function gameView(s: GameState): GameView {
  const actions = legalActions(s).map((option) => {
    if (
      option.action.type !== "attack" ||
      (option.action.special &&
        s.players[s.active_seat].slots[option.action.slot]
          ?.special_attack_code === "heal")
    )
      return option;
    const copy = structuredClone(s),
      p = copy.players[s.active_seat];
    if (option.action.slot === "defense")
      [p.slots.attack, p.slots.defense] = [p.slots.defense, p.slots.attack];
    return {
      ...option,
      damage: Object.fromEntries(
        (["attack", "defense"] as const)
          .filter((k) => copy.players[other(s.active_seat)].slots[k])
          .map((k) => [
            k,
            damage(
              copy,
              s.active_seat,
              (option.action as { special: boolean }).special,
              k,
            ),
          ]),
      ),
    };
  });
  return {
    rules_version: s.rules_version,
    turn: s.turn,
    active_seat: s.active_seat,
    actor_seat: s.pending_attack
      ? other(s.pending_attack.attacker)
      : s.active_seat,
    winner: s.winner,
    win_reason: s.win_reason,
    pending_attack: s.pending_attack,
    legal_actions: actions,
    players: s.players.map((p) => ({
      slots: p.slots,
      waiting: p.waiting,
      dead: p.dead,
      deck_count: p.deck.length,
      discard_count: p.discard.length,
    })),
  };
}
