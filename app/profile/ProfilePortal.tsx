"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  createLocalProfile,
  currentUsername,
  signInLocalProfile,
  signOutLocalProfile,
} from "../auth-storage";
import { ProfileDashboard } from "./ProfileDashboard";

export function ProfilePortal() {
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [formUsername, setFormUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setUsername(currentUsername());
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const profile =
        mode === "signup"
          ? await createLocalProfile(formUsername, password)
          : await signInLocalProfile(formUsername, password);
      setUsername(profile.username);
      setFormUsername("");
      setPassword("");
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "Could not sign in.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <section className="login-card login-loading">Loading profile…</section>;
  }

  if (username) {
    return (
      <>
        <ProfileDashboard displayName={username} profileId={username} />
        <div className="profile-signout">
          <button
            type="button"
            onClick={() => {
              signOutLocalProfile();
              setUsername(null);
            }}
          >
            Sign out
          </button>
        </div>
      </>
    );
  }

  return (
    <section className="login-card">
      <div className="login-mark">PT</div>
      <p className="eyebrow">PRIVATE PROGRESS PROFILE</p>
      <h1>
        {mode === "signin"
          ? "Welcome back."
          : "Create your profile."}
      </h1>
      <p>
        Your exercise calendar, repetitions and scores remain connected to
        this private browser profile.
      </p>
      <div className="login-tabs" aria-label="Account action">
        <button
          className={mode === "signin" ? "active" : ""}
          type="button"
          onClick={() => {
            setMode("signin");
            setError("");
          }}
        >
          Sign in
        </button>
        <button
          className={mode === "signup" ? "active" : ""}
          type="button"
          onClick={() => {
            setMode("signup");
            setError("");
          }}
        >
          Create account
        </button>
      </div>
      <form className="login-form" onSubmit={submit}>
        <label>
          Username
          <input
            autoComplete="username"
            value={formUsername}
            onChange={(event) => setFormUsername(event.target.value)}
            placeholder="your_username"
            required
          />
        </label>
        <label>
          Password
          <input
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="8 characters minimum"
            type="password"
            required
          />
        </label>
        {error ? <p className="login-error">{error}</p> : null}
        <button className="login-button" disabled={busy} type="submit">
          {busy
            ? "Please wait…"
            : mode === "signin"
              ? "Sign in"
              : "Create profile"}
        </button>
      </form>
      <small>Credentials are stored only in this browser for the demo.</small>
    </section>
  );
}
