import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { homePathFor } from "@/lib/permissions";

export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? homePathFor(user.role) : "/login");
}
