export type LocalProfile = {
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
};

const USERS_KEY = "physiotwin-users";
const SESSION_KEY = "physiotwin-session";

function readUsers(): LocalProfile[] {
  try {
    return JSON.parse(
      window.localStorage.getItem(USERS_KEY) ?? "[]",
    ) as LocalProfile[];
  } catch {
    return [];
  }
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function currentUsername() {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export async function createLocalProfile(
  usernameInput: string,
  password: string,
) {
  const username = usernameInput.trim();
  if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username)) {
    throw new Error(
      "Use 3–24 letters, numbers, underscores or hyphens.",
    );
  }
  if (password.length < 8) {
    throw new Error("Use a password with at least 8 characters.");
  }
  const users = readUsers();
  if (
    users.some(
      (user) => user.username.toLowerCase() === username.toLowerCase(),
    )
  ) {
    throw new Error("That username already exists on this device.");
  }

  const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
  const salt = Array.from(saltBytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const profile: LocalProfile = {
    username,
    salt,
    passwordHash: await digest(`${salt}:${password}`),
    createdAt: new Date().toISOString(),
  };
  window.localStorage.setItem(USERS_KEY, JSON.stringify([...users, profile]));
  window.localStorage.setItem(SESSION_KEY, username);
  return profile;
}

export async function signInLocalProfile(
  usernameInput: string,
  password: string,
) {
  const user = readUsers().find(
    (candidate) =>
      candidate.username.toLowerCase() ===
      usernameInput.trim().toLowerCase(),
  );
  if (!user || (await digest(`${user.salt}:${password}`)) !== user.passwordHash) {
    throw new Error("Incorrect username or password.");
  }
  window.localStorage.setItem(SESSION_KEY, user.username);
  return user;
}

export function signOutLocalProfile() {
  window.localStorage.removeItem(SESSION_KEY);
}
