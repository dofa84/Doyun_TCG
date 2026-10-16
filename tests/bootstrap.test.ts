import { it, expect } from "vitest";
import { makeAdmin } from "../scripts/bootstrap-admin.mjs";
it("짧은 비밀번호는 로컬만 허용하고 운영 생성은 거부한다", () => {
  expect(
    makeAdmin({ login: "admin", password: "short", remote: false }).login_name,
  ).toBe("admin");
  expect(() =>
    makeAdmin({ login: "admin", password: "short", remote: true }),
  ).toThrow();
});
it("관리자 이름은 안전한 식별자이며 비밀번호는 해시로 변환한다", () => {
  expect(() =>
    makeAdmin({ login: "x';DROP", password: "test", remote: false }),
  ).toThrow();
  const a = makeAdmin({
    login: "Admin",
    password: "Long-Test-Password-123",
    remote: true,
  });
  expect(a.login_name).toBe("admin");
  expect(a.password_hash).not.toContain("Long-Test-Password-123");
  expect(a.password_hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
});
