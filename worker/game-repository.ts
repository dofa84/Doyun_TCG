import {HTTPException} from "hono/http-exception";
import {createGame} from "../src/game/engine";
import {selectGameCards,passives,specials} from "../src/domain";
import type {GameState,GameEvent,SnapshotCard} from "../src/game/types";
export type GameRecord={id:string;creator_user_id:string;status:"waiting"|"active"|"finished";version:number;state_json:string|null;join_request_id:string|null};
export type Member={seat:0|1;user_id:string;email:string;faction_id:string;faction_name:string};
export const conflict=()=>new HTTPException(409,{message:"게임 상태가 바뀌었습니다. 새로고침 후 다시 선택해주세요."});
export async function getGame(db:D1Database,id:string):Promise<GameRecord>{const g=await db.prepare("SELECT * FROM games WHERE id=?").bind(id).first<GameRecord>();if(!g)throw new HTTPException(404);return g}
export async function members(db:D1Database,id:string):Promise<Member[]>{return (await db.prepare("SELECT m.seat,m.user_id,u.email,m.faction_id,f.name AS faction_name FROM game_members m JOIN users u ON u.id=m.user_id JOIN factions f ON f.id=m.faction_id WHERE game_id=? ORDER BY seat").bind(id).all<Member>()).results}
export async function getMemberGame(db:D1Database,id:string,user:string){const found=await db.prepare("SELECT game_id FROM game_members WHERE game_id=? AND user_id=?").bind(id,user).first();if(!found)throw new HTTPException(404);return getGame(db,id)}
export async function createLobby(db:D1Database,user:string,_session:string,faction:string,request:string){
  const valid=await db.prepare("SELECT id FROM factions WHERE id=? AND disabled=0").bind(faction).first();if(!valid)throw new HTTPException(400,{message:"진영을 선택해주세요."});
  const id=crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO games(id,creator_user_id,create_request_id) VALUES(?,?,?)").bind(id,user,request),
    db.prepare("INSERT INTO game_members(game_id,seat,user_id,faction_id) SELECT id,0,?,? FROM games WHERE id=?").bind(user,faction,id),
  ]);
  const g=await db.prepare("SELECT * FROM games WHERE creator_user_id=? AND create_request_id=?").bind(user,request).first<GameRecord>();return g!;
}
function shuffled<T>(input:T[]):T[]{const a=[...input];for(let i=a.length-1;i>0;i--){const j=Math.floor(crypto.getRandomValues(new Uint32Array(1))[0]/4294967296*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function encoded(state:GameState){const text=JSON.stringify(state);if(new TextEncoder().encode(text).length>262144)throw new HTTPException(400,{message:"게임 데이터 크기 한도를 초과했습니다."});return text}
export async function joinGame(db:D1Database,id:string,user:string,session:string,faction:string,request:string,version:number,deviceHash?:string){
  const g=await getGame(db,id),ms=await members(db,id);
  if(g.status!=="waiting"){
    if(g.join_request_id===request&&ms[1]?.user_id===user)return g;
    throw conflict();
  }
  if(ms[0].user_id===user)throw new HTTPException(409,{message:"서로 다른 두 계정으로 참가해주세요."});
  const rows=(await db.prepare("SELECT c.*,f.disabled FROM cards c JOIN factions f ON f.id=c.faction_id WHERE c.faction_id IN(?,?) AND c.archived=0").bind(ms[0].faction_id,faction).all<any>()).results;
  const decks=[ms[0].faction_id,faction].map((fid,seat)=>{
    const pool=rows.filter(c=>c.faction_id===fid);
    if(pool.some(c=>c.disabled))throw conflict();
    let selected:any[];try{selected=selectGameCards(pool)}catch{throw new HTTPException(409,{message:"진영마다 승인·활성 카드 20장 이상과 엑조디아 5장이 필요합니다."})}
    return shuffled(selected.map((c):SnapshotCard=>{
      if(c.passive_code&&!Object.hasOwn(passives,c.passive_code)||c.special_attack_code&&!Object.hasOwn(specials,c.special_attack_code))throw new HTTPException(400,{message:"지원하지 않는 카드 효과입니다."});
      return {instance_id:`${seat}:${c.id}`,id:c.id,version:c.version,name:c.name,image_key:c.image_key,rarity:c.rarity,hp:c.hp,max_hp:c.hp,attack:c.attack,is_exodia:!!c.is_exodia,passive_code:c.passive_code,special_attack_code:c.special_attack_code,special_used:false,regen_uses:0};
    }));
  }) as [SnapshotCard[],SnapshotCard[]];
  const state=createGame(decks,crypto.getRandomValues(new Uint32Array(1))[0]%2 as 0|1),text=encoded(state);
  const imageKeys=[...new Set(decks.flat().map(c=>c.image_key))];
  const result=await db.batch([
    db.prepare("UPDATE games SET status=?,version=1,turn_number=?,state_json=?,join_request_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? AND status='waiting'").bind(state.winner===null?"active":"finished",state.turn,text,request,id,version),
    db.prepare("INSERT INTO game_members(game_id,seat,user_id,faction_id) SELECT ?,1,?,? WHERE changes()=1").bind(id,user,faction),
    db.prepare("INSERT INTO game_images(game_id,image_key) SELECT ?,value FROM json_each(?) WHERE EXISTS(SELECT 1 FROM games g JOIN game_members m ON m.game_id=g.id AND m.seat=1 WHERE g.id=? AND g.join_request_id=? AND m.user_id=?)").bind(id,JSON.stringify(imageKeys),id,request,user),
    db.prepare("UPDATE game_devices SET session1=? WHERE token_hash=? AND game_id=? AND EXISTS(SELECT 1 FROM game_members WHERE game_id=? AND seat=1 AND user_id=?)").bind(session,deviceHash??"",id,id,user),
  ]);
  if(!result[0].meta.changes)throw conflict();return getGame(db,id);
}
export async function saveAction(db:D1Database,id:string,version:number,request:string,state:GameState,events:GameEvent[]){
  if(await db.prepare("SELECT 1 FROM game_actions WHERE game_id=? AND request_id=?").bind(id,request).first())return getGame(db,id);
  const result=await db.batch([
    db.prepare("UPDATE games SET state_json=?,status=?,version=version+1,turn_number=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? AND status='active'").bind(encoded(state),state.winner===null?"active":"finished",state.turn,id,version),
    db.prepare("INSERT INTO game_actions(game_id,request_id,applied_version,events_json) SELECT ?,?,?,? WHERE changes()=1").bind(id,request,version+1,JSON.stringify(events)),
  ]);
  if(!result[0].meta.changes){if(await db.prepare("SELECT 1 FROM game_actions WHERE game_id=? AND request_id=?").bind(id,request).first())return getGame(db,id);throw conflict()}
  return getGame(db,id);
}
