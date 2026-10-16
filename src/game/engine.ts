import type { GameState, SnapshotCard, Seat, Slot, GameAction, GameEvent, LegalAction } from "./types";
export const slots:Slot[]=["attack","defense"];
export const other=(seat:Seat):Seat=>seat===0?1:0;
const fail=(text:string):never=>{throw new Error(text)};
function event(events:GameEvent[],seat:Seat,type:string,text:string){events.push({type,seat,text})}
function reveal(s:GameState,seat:Seat,slot:Slot,events:GameEvent[],initial=false){
  const p=s.players[seat],card=p.deck.shift();if(!card)return;
  if(card.is_exodia){p.waiting.push(card);event(events,seat,"exodia",`엑조디아 공개 (${p.waiting.length}/5)`)}
  else if(p.slots[slot]){p.discard.push(card);event(events,seat,"discard","비공개 카드 1장 버림")}
  else {p.slots[slot]=card;event(events,seat,initial?"initial":"reveal",`${card.name} 공개`)}
}
function judge(s:GameState){
  for(const seat of [0,1] as Seat[])if(s.players[seat].waiting.length>=5){s.winner=seat;s.win_reason="exodia";return}
  for(const seat of [0,1] as Seat[]){const p=s.players[seat];if(!slots.some(k=>p.slots[k])&&!p.deck.some(c=>!c.is_exodia)){s.winner=other(seat);s.win_reason="elimination";return}}
}
function regenerate(s:GameState,events:GameEvent[]){
  const c=s.players[s.active_seat].slots.defense;
  if(c?.passive_code!=="regeneration"||c.regen_uses>=3)return;
  const amount=Math.min(c.max_hp-c.hp,Math.floor(c.max_hp*5/100));
  if(amount>0){c.hp+=amount;c.regen_uses++;event(events,s.active_seat,"regeneration",`${c.name} HP +${amount} (${c.regen_uses}/3)`)}
}
export function damage(s:GameState,attacker:Seat,special:boolean,target:Slot):number{
  const p=s.players[attacker],card=p.slots.attack!;
  const code=special?card.special_attack_code:null;
  let numerator=card.attack,denominator=1;
  if(code==="power_strike"){numerator*=150;denominator*=100}
  if(p.slots.defense?.passive_code==="fury"){numerator*=110;denominator*=100}
  const victim=s.players[other(attacker)].slots[target];
  if(!special && target==="defense" && victim?.passive_code==="armor"){numerator*=90;denominator*=100}
  return Math.max(1,Math.floor(numerator/denominator));
}
export function legalActions(s:GameState):LegalAction[]{
  if(s.winner!==null)return [];
  if(s.pending_attack){const target=s.players[other(s.pending_attack.attacker)];return slots.filter(k=>target.slots[k]).map(slot=>({label:`${slot==="attack"?"공격":"방어"} 카드로 받기`,action:{type:"defend",slot},damage:{[slot]:damage(s,s.pending_attack!.attacker,s.pending_attack!.special,slot)}}))}
  const p=s.players[s.active_seat],actions:LegalAction[]=[];
  if(p.deck.length){const empty=slots.filter(k=>!p.slots[k]);if(empty.length===2)for(const slot of empty)actions.push({label:`오픈 → ${slot==="attack"?"공격":"방어"} 칸`,action:{type:"open",slot}});else actions.push({label:empty.length?"카드 오픈":"오픈 → 비공개 버림 또는 엑조디아",action:{type:"open",...(empty[0]?{slot:empty[0]}:{})}})}
  const hasTarget=slots.some(k=>s.players[other(s.active_seat)].slots[k]);
  for(const slot of slots){const card=p.slots[slot];if(!card)continue;
    if(hasTarget)actions.push({label:`${card.name} 일반 공격${slot==="defense"?" (자리 교환)":""}`,action:{type:"attack",slot,special:false}});
    if(!card.special_used&&card.special_attack_code&&(card.special_attack_code==="heal"?card.hp<card.max_hp:hasTarget))actions.push({label:`${card.name} 특수 공격${slot==="defense"?" (자리 교환)":""}`,action:{type:"attack",slot,special:true}});
  }
  return actions;
}
function beginTurn(s:GameState,events:GameEvent[]){
  judge(s);if(s.winner!==null)return;
  regenerate(s,events);
  // With no combat cards either player would already have lost. No-progress
  // turns therefore always hand control to a player with a draw or attack.
  for(let n=0;n<2 && !legalActions(s).length;n++){
    event(events,s.active_seat,"pass","가능한 행동이 없어 자동 패스");s.active_seat=other(s.active_seat);s.turn++;judge(s);if(s.winner!==null)return;regenerate(s,events);
  }
}
function finishTurn(s:GameState,events:GameEvent[]){judge(s);if(s.winner!==null)return;s.active_seat=other(s.active_seat);s.turn++;beginTurn(s,events)}
function hit(s:GameState,target:Slot,events:GameEvent[]){
  const pending=s.pending_attack!,seat=other(pending.attacker),p=s.players[seat],card=p.slots[target]!;
  const amount=damage(s,pending.attacker,pending.special,target);card.hp=Math.max(0,card.hp-amount);
  event(events,seat,"damage",`${card.name} 피해 ${amount} (HP ${card.hp})`);
  if(card.hp===0){p.dead.push(card);p.slots[target]=null;event(events,seat,"death",`${card.name} 사망`);reveal(s,seat,target,events)}
  s.pending_attack=null;finishTurn(s,events);
}
export function createGame(decks:[SnapshotCard[],SnapshotCard[]],first:Seat):GameState{
  const make=(deck:SnapshotCard[]):GameState["players"][0]=>({deck:structuredClone(deck),slots:{attack:null,defense:null},waiting:[],discard:[],dead:[]});
  const players:GameState["players"]=[make(decks[0]),make(decks[1])];
  const s:GameState={rules_version:"family-v1",players,active_seat:first,turn:1,pending_attack:null,winner:null,win_reason:null};
  const events:GameEvent[]=[];reveal(s,0,"attack",events,true);reveal(s,1,"attack",events,true);beginTurn(s,events);return s;
}
export function applyAction(input:GameState,actor:Seat,action:GameAction):{state:GameState;events:GameEvent[]}{
  const s=structuredClone(input),events:GameEvent[]=[];
  if(s.winner!==null)fail("이미 종료된 게임입니다.");
  const expected=s.pending_attack?other(s.pending_attack.attacker):s.active_seat;
  if(actor!==expected)fail("현재 행동할 플레이어가 아닙니다.");
  const p=s.players[actor];
  if(s.pending_attack){if(action.type!=="defend"||!slots.includes(action.slot)||!p.slots[action.slot])fail("피해받을 카드를 선택해주세요.");hit(s,(action as {slot:Slot}).slot,events);return {state:s,events}}
  if(action.type==="open"){
    if(!p.deck.length)fail("남은 덱이 없습니다.");
    const empty=slots.filter(k=>!p.slots[k]);
    if(empty.length===2&&!action.slot)fail("배치할 칸을 선택해주세요.");
    if(action.slot&&(!slots.includes(action.slot)||p.slots[action.slot]))fail("빈 칸만 선택할 수 있습니다.");
    reveal(s,actor,action.slot??empty[0]??"attack",events);finishTurn(s,events);
  }else if(action.type==="attack"){
    const card=slots.includes(action.slot)?p.slots[action.slot]:null;
    if(!card)fail("공격할 카드가 없습니다.");
    if(typeof action.special!=="boolean")fail("공격 종류를 확인해주세요.");
    const code=action.special?card!.special_attack_code:null;
    if(action.special&&(!code||card!.special_used))fail("특수 공격을 사용할 수 없습니다.");
    const target=s.players[other(actor)],targets=slots.filter(k=>target.slots[k]);
    if(code==="heal"?card!.hp===card!.max_hp:!targets.length)fail("공격 또는 회복 대상이 없습니다.");
    if(action.slot==="defense"){[p.slots.attack,p.slots.defense]=[p.slots.defense,p.slots.attack];event(events,actor,"swap","공격·방어 자리 교환")}
    if(action.special)p.slots.attack!.special_used=true;
    event(events,actor,"attack",`${card!.name} ${action.special?"특수":"일반"} 공격`);
    if(code==="heal"){const a=p.slots.attack!;const amount=Math.min(a.max_hp-a.hp,Math.floor(a.max_hp*25/100));a.hp+=amount;event(events,actor,"heal",`${a.name} HP +${amount}`);finishTurn(s,events)}
    else{s.pending_attack={attacker:actor,special:action.special};if(targets.length===1)hit(s,targets[0],events)}
  }else fail("허용되지 않은 행동입니다.");
  return {state:s,events};
}
