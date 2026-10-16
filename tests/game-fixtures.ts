import {Miniflare,convertV4MiniflareOptions} from "miniflare";
import {build} from "esbuild";
import {readFileSync,readdirSync} from "node:fs";
export async function gameFixture(){
  const out=await build({entryPoints:["worker/index.ts"],bundle:true,write:false,format:"esm",platform:"browser"});
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:out.outputFiles[0].text,compatibilityDate:"2026-10-01",d1Databases:["DB"]}));
  const db=await mf.getD1Database("DB") as unknown as D1Database;
  for(const n of readdirSync("db/migrations").filter(n=>n.endsWith(".sql")).sort())await db.exec(readFileSync("db/migrations/"+n,"utf8").replace(/\n/g," "));
  async function request(path:string,method="GET",body?:unknown,cookie=""){
    const r=await mf.dispatchFetch("http://localhost/api"+path,{method,headers:{Origin:"http://localhost","Content-Type":"application/json",Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,data:await r.json() as any,cookie:r.headers.get("set-cookie")?.split(";")[0]??""};
  }
  const users=[];
  for(const name of ["one","two","three"]){const r=await request("/auth/register","POST",{email:`${name}@example.test`,password:"Test-password-123"});if(r.status!==201)throw Error("fixture signup failed");const row=await db.prepare("SELECT token_hash FROM sessions WHERE user_id=?").bind(r.data.user.id).first<{token_hash:string}>();users.push({...r.data.user,cookie:r.cookie,session:row!.token_hash})}
  await db.prepare("UPDATE users SET role='admin' WHERE id=?").bind(users[2].id).run();
  await db.prepare("INSERT INTO factions(id,owner_user_id,name) VALUES('f1',?,'대전 진영')").bind(users[0].id).run();
  await db.prepare("INSERT INTO uploads(key,owner_user_id,mime) VALUES('game-photo',?,'image/png')").bind(users[0].id).run();
  await db.prepare("INSERT INTO image_data(key,data) VALUES('game-photo',?)").bind(new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])).run();
  for(let i=0;i<20;i++)await db.prepare("INSERT INTO cards(id,faction_id,owner_user_id,name,rarity,hp,attack,image_key,is_exodia,review_status,is_usable) VALUES(?,'f1',?,?,'common',100,40,'game-photo',?,'approved',1)").bind("gc"+i,users[0].id,"카드"+i,i<5?1:0).run();
  return {mf,db,request,users};
}
