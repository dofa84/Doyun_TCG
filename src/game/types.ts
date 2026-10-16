import type { CardInput } from "../domain";
export type Seat = 0 | 1;
export type Slot = "attack" | "defense";
export type SnapshotCard = Omit<CardInput,"faction_id"> & {
  instance_id: string; id: string; version: number; max_hp: number;
  special_used: boolean; regen_uses: number;
};
export type PlayerState = {
  slots: Record<Slot,SnapshotCard|null>;
  deck: SnapshotCard[]; waiting: SnapshotCard[]; discard: SnapshotCard[]; dead: SnapshotCard[];
};
export type GameState = {
  rules_version: "family-v1"; players: [PlayerState,PlayerState]; active_seat: Seat;
  turn: number; pending_attack: {attacker:Seat;special:boolean}|null;
  winner: Seat|null; win_reason: "exodia"|"elimination"|null;
};
export type GameAction = {type:"open";slot?:Slot}|{type:"attack";slot:Slot;special:boolean}|{type:"defend";slot:Slot};
export type GameEvent = {type:string;seat:Seat;text:string};
export type LegalAction = {label:string;action:GameAction;damage?:Partial<Record<Slot,number>>};
export type GameView = {
  rules_version:string; turn:number;active_seat:Seat;actor_seat:Seat;winner:Seat|null;win_reason:GameState["win_reason"];
  pending_attack: GameState["pending_attack"];
  players: {slots:PlayerState["slots"];waiting:SnapshotCard[];dead:SnapshotCard[];deck_count:number;discard_count:number}[];
  legal_actions:LegalAction[];
};
