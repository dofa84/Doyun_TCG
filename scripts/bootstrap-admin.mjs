import { randomBytes, randomUUID, pbkdf2Sync } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  rmdirSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

export function makeAdmin({ login, password, remote }) {
  if (typeof login !== "string" || !/^[a-z][a-z0-9_-]{2,31}$/i.test(login))
    throw new Error("관리자 아이디는 영문으로 시작하는 3~32자 식별자입니다.");
  if (
    typeof password !== "string" ||
    !password.length ||
    password.length > 128 ||
    (remote && password.length < 12)
  )
    throw new Error("운영 비밀번호는 12자 이상이어야 합니다.");
  const salt = randomBytes(16).toString("hex"),
    name = login.toLowerCase();
  return {
    id: randomUUID(),
    email: name + "@tcg.invalid",
    login_name: name,
    password_hash:
      salt +
      ":" +
      pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex"),
  };
}
async function main() {
  const args = process.argv.slice(2),
    remote = args.includes("--remote"),
    local = args.includes("--local"),
    generate = args.includes("--generate");
  if (remote === local)
    throw new Error("--local 또는 --remote 중 하나를 지정해주세요.");
  const login = args.includes("--login")
    ? args[args.indexOf("--login") + 1]
    : "admin";
  const password = generate
    ? randomBytes(24).toString("base64url")
    : readFileSync(0, "utf8").trimEnd();
  const user = makeAdmin({ login, password, remote });
  const quote = (v) => "'" + v.replaceAll("'", "''") + "'";
  const directory = mkdtempSync(join(tmpdir(), "doyun-tcg-admin-")),
    sqlPath = join(directory, "create.sql");
  let credentialPath;
  try {
    if (generate) {
      const localDir = resolve(".local");
      mkdirSync(localDir, { recursive: true, mode: 0o700 });
      credentialPath = join(
        localDir,
        (remote ? "production" : "local") + "-admin-" + Date.now() + ".json",
      );
      writeFileSync(
        credentialPath,
        JSON.stringify(
          {
            login: user.login_name,
            password,
            environment: remote ? "production" : "local",
          },
          null,
          2,
        ) + "\n",
        { mode: 0o600, flag: "wx" },
      );
    }
    writeFileSync(
      sqlPath,
      "INSERT INTO users(id,email,login_name,password_hash,role) VALUES(" +
        [user.id, user.email, user.login_name, user.password_hash, "admin"]
          .map(quote)
          .join(",") +
        ");",
      { mode: 0o600 },
    );
    const result = spawnSync(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        "DB",
        remote ? "--remote" : "--local",
        "--file",
        sqlPath,
        "--json",
      ],
      { encoding: "utf8" },
    );
    if (result.status !== 0)
      throw new Error(
        "관리자 생성 실패: DB 연결·마이그레이션·아이디 중복을 확인해주세요. 기존 계정은 덮어쓰지 않습니다.",
      );
    console.log(
      "관리자 계정을 생성했습니다: " +
        user.login_name +
        " (" +
        (remote ? "production" : "local") +
        ")",
    );
    if (credentialPath) console.log("보호된 자격 증명 파일: " + credentialPath);
  } catch (e) {
    if (credentialPath) unlinkSync(credentialPath);
    throw e;
  } finally {
    if (existsSync(sqlPath)) unlinkSync(sqlPath);
    rmdirSync(directory);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
