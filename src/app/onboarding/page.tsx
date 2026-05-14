import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { APP_SETTING_DESCRIPTIONS } from "@/domain/app-settings/app-settings.types";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const userCount = await db.user.count();
  if (userCount > 0) {
    redirect("/login");
  }

  return (
    <OnboardingFlow
      settingDescriptions={APP_SETTING_DESCRIPTIONS}
    />
  );
}
