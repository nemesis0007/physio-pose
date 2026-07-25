import { SiteFooter } from "../SiteFooter";
import { SiteHeader } from "../SiteHeader";
import { ProfilePortal } from "./ProfilePortal";

export default function ProfilePage() {
  return (
    <main>
      <SiteHeader />
      <div className="profile-page">
        <ProfilePortal />
      </div>
      <SiteFooter />
    </main>
  );
}
