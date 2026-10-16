export type User = {
  id: string;
  email: string;
  role: "user" | "admin";
  status: string;
};
export type Env = { DB: D1Database; ASSETS: Fetcher };
export type Bindings = {
  Bindings: Env;
  Variables: { user: User; gameDeviceHash?: string };
};
