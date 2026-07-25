import Link from "next/link";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "../chatgpt-auth";
import { SiteFooter } from "../SiteFooter";
import { SiteHeader } from "../SiteHeader";
import { ProfileDashboard } from "./ProfileDashboard";

export default async function ProfilePage() {
  const user = await getChatGPTUser();

  return (
    <main>
      <SiteHeader />
      <div className="profile-page">
        {user ? (
          <>
            <ProfileDashboard
              displayName={user.displayName}
              email={user.email}
            />
            <div className="profile-signout">
              <Link href={chatGPTSignOutPath("/profile")}>Sign out</Link>
            </div>
          </>
        ) : (
          <section className="login-card">
            <div className="login-mark">PT</div>
            <p className="eyebrow">PRIVATE PROGRESS PROFILE</p>
            <h1>Keep every recovery day connected.</h1>
            <p>
              Sign in to organize completed exercises, repetitions and scores
              into your personal activity log.
            </p>
            <Link
              className="login-button"
              href={chatGPTSignInPath("/profile")}
            >
              Sign in with ChatGPT
            </Link>
            <small>Your movement videos remain on this device.</small>
          </section>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}
