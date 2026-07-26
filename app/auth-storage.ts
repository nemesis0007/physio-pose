export type AuthUser = {
  username: string;
  displayName: string;
  role: "patient" | "physio";
};

type StoredSession = { token: string; user: AuthUser };
const SESSION_KEY = "physiotwin-auth-session";

export function currentSession(): StoredSession | null {
  try {
    return JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? "null") as StoredSession | null;
  } catch {
    return null;
  }
}

export function currentUsername() {
  return currentSession()?.user.username ?? null;
}

export function authHeaders() {
  const token = currentSession()?.token;
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return headers;
}

async function authenticate(payload: Record<string, unknown>) {
  const response = await fetch("/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = (await response.json()) as StoredSession & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Could not authenticate.");
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(result));
  return result.user;
}

export async function createLocalProfile(username: string, password: string) {
  return authenticate({ action: "register", role: "patient", username, password, displayName: username });
}

export async function signInLocalProfile(username: string, password: string) {
  return authenticate({ action: "login", role: "patient", username, password });
}

export function signOutLocalProfile() {
  const token = currentSession()?.token;
  window.localStorage.removeItem(SESSION_KEY);
  if (token) {
    void fetch("/api/auth", { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
  }
}
