export function makeAdmin(input: {
  login: string;
  password: string;
  remote: boolean;
}): { id: string; email: string; login_name: string; password_hash: string };
