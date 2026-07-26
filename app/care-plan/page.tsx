import { SiteFooter } from "../SiteFooter";
import { SiteHeader } from "../SiteHeader";
import { CarePlanPortal } from "./CarePlanPortal";

export default function CarePlanPage() {
  return (
    <main className="shell">
      <SiteHeader />
      <div className="care-plan-page">
        <CarePlanPortal />
      </div>
      <SiteFooter />
    </main>
  );
}
