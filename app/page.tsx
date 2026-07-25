import { PhysioTwinApp } from "./PhysioTwinApp";
import { getChatGPTUser } from "./chatgpt-auth";

export default async function Home() {
  const user = await getChatGPTUser();
  return <PhysioTwinApp profileId={user?.email ?? null} />;
}
