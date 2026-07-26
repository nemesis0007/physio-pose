import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../db";
import { authSessions, userAccounts } from "../../../db/schema";

const encoder = new TextEncoder();
const usernamePattern = /^[a-zA-Z0-9_-]{3,24}$/;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (byte) => parseInt(byte, 16));
}

async function sha256(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function passwordHash(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBuffer = Uint8Array.from(salt).buffer;
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations: 100_000 },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowed =
    origin === new URL(request.url).origin ||
    origin === "http://localhost:3000" ||
    origin === "http://localhost:3001" ||
    /^https:\/\/physiotwin-clinician(?:-[a-z0-9-]+)?\.[a-z0-9-]+\.workers\.dev$/.test(origin);
  return {
    "access-control-allow-origin": allowed ? origin : "null",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    vary: "Origin",
  };
}

function json(request: Request, value: unknown, status = 200) {
  return Response.json(value, { status, headers: corsHeaders(request) });
}

function bearer(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

export async function sessionUser(request: Request) {
  const token = bearer(request);
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({
      id: userAccounts.id,
      username: userAccounts.username,
      displayName: userAccounts.displayName,
      role: userAccounts.role,
    })
    .from(authSessions)
    .innerJoin(userAccounts, eq(authSessions.userId, userAccounts.id))
    .where(and(eq(authSessions.tokenHash, await sha256(token)), gt(authSessions.expiresAt, new Date().toISOString())))
    .limit(1);
  return row ?? null;
}

export async function GET(request: Request) {
  const user = await sessionUser(request);
  return user ? json(request, { user }) : json(request, { error: "Please sign in." }, 401);
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const displayName = String(body.displayName ?? username).trim().slice(0, 80);
  const role = body.role === "physio" ? "physio" : "patient";
  const db = await getDb();

  if (action === "register") {
    if (!usernamePattern.test(username) || password.length < 8 || !displayName) {
      return json(request, { error: "Use a valid username and a password of at least 8 characters." }, 400);
    }
    if (role === "physio") {
      const moduleName = "cloudflare:workers";
      const { env } = (await import(/* @vite-ignore */ moduleName)) as { env: { PHYSIO_INVITE_CODE?: string } };
      if (!env.PHYSIO_INVITE_CODE || body.inviteCode !== env.PHYSIO_INVITE_CODE) {
        return json(request, { error: "The clinician invite code is incorrect." }, 403);
      }
    }
    const [existing] = await db.select({ id: userAccounts.id }).from(userAccounts).where(eq(userAccounts.username, username)).limit(1);
    if (existing) return json(request, { error: "That username is already registered." }, 409);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const [created] = await db.insert(userAccounts).values({
      username,
      displayName,
      role,
      passwordSalt: bytesToHex(salt),
      passwordHash: await passwordHash(password, salt),
    }).returning({ id: userAccounts.id });
    return createSession(request, created.id, { username, displayName, role });
  }

  if (action === "login") {
    const [account] = await db.select().from(userAccounts).where(eq(userAccounts.username, username)).limit(1);
    if (!account || await passwordHash(password, hexToBytes(account.passwordSalt)) !== account.passwordHash) {
      return json(request, { error: "Incorrect username or password." }, 401);
    }
    if (body.role && body.role !== account.role) {
      return json(request, { error: `This is not a ${String(body.role)} account.` }, 403);
    }
    return createSession(request, account.id, account);
  }

  return json(request, { error: "Unknown action." }, 400);
}

async function createSession(
  request: Request,
  userId: number,
  user: { username: string; displayName: string; role: string },
) {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const db = await getDb();
  await db.insert(authSessions).values({ tokenHash: await sha256(token), userId, expiresAt });
  return json(request, { token, user: { username: user.username, displayName: user.displayName, role: user.role } }, 201);
}

export async function DELETE(request: Request) {
  const token = bearer(request);
  if (token) {
    const db = await getDb();
    await db.delete(authSessions).where(eq(authSessions.tokenHash, await sha256(token)));
  }
  return json(request, { signedOut: true });
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
