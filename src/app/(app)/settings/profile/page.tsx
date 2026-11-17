import type { Metadata } from "next";
import { ProfileForm } from "@/components/settings/profile-notifications";

export const metadata: Metadata = { title: "Profil" };

export default function ProfilePage() {
  return <ProfileForm />;
}
