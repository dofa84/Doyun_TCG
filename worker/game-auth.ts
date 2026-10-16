import type {Context} from "hono";
import {getCookie,setCookie} from "hono/cookie";
import {HTTPException} from "hono/http-exception";
import type {Bindings} from "./types";
import {digest} from "./auth";
import {members} from "./game-repository";
type Device={token_hash:string;game_id:string;session0:string|null;session1:string|null;expires_at:number};
export async function currentSession(c:Context<Bindings>){return digest(getCookie(c,"tcg_session")??"")}
export async function readDevice(c:Context<Bindings>,id:string){
  const token=getCookie(c,"tcg_game_device");
  const row=token?await c.env.DB.prepare("SELECT * FROM game_devices WHERE token_hash=? AND game_id=? AND expires_at>?").bind(await digest(token),id,Date.now()).first<Device>():null;
  const ms=await members(c.env.DB,id),ready:[boolean,boolean]=[false,false];
  if(row)for(const seat of [0,1] as const){const hash=seat===0?row.session0:row.session1;if(hash&&ms[seat])ready[seat]=!!await c.env.DB.prepare("SELECT s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>? AND u.status='active'").bind(hash,ms[seat].user_id,Date.now()).first()}
  return {row,ready,members:ms};
}
export async function authorizeDevice(c:Context<Bindings>,id:string,seat:0|1){
  const found=await readDevice(c,id);let hash=found.row?.token_hash;
  if(!hash){const token=crypto.randomUUID()+crypto.randomUUID();hash=await digest(token);await c.env.DB.prepare("INSERT INTO game_devices(token_hash,game_id,expires_at) VALUES(?,?,?)").bind(hash,id,Date.now()+7*86400000).run();setCookie(c,"tcg_game_device",token,{path:`/api/games/${id}`,httpOnly:true,secure:new URL(c.req.url).protocol==="https:",sameSite:"Strict",maxAge:7*86400})}
  const session=await currentSession(c);
  await c.env.DB.prepare(`UPDATE game_devices SET ${seat===0?"session0":"session1"}=? WHERE token_hash=? AND game_id=?`).bind(session,hash,id).run();
  return readDevice(c,id);
}
export async function requireGameDevice(c:Context<Bindings>,id:string){
  const d=await readDevice(c,id);
  if(!d.members.some(m=>m.user_id===c.get("user").id))throw new HTTPException(404);
  if(!d.ready[0]||!d.ready[1])throw new HTTPException(403,{message:"두 참가자 계정으로 이 기기를 다시 인증해주세요."});
  return d;
}
