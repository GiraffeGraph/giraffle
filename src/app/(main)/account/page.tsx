import Link from "next/link";
import { PageTopbar } from "@/components/ui/PageTopbar";
import {
  changePasswordAction,
  getAccountProfileAction,
  updateProfileAction,
} from "@/server/api/auth";

export default async function AccountPage() {
  const profile = await getAccountProfileAction();

  async function handleProfileUpdate(formData: FormData) {
    "use server";
    await updateProfileAction({
      name: String(formData.get("name") ?? ""),
    });
  }

  async function handlePasswordChange(formData: FormData) {
    "use server";
    await changePasswordAction({
      currentPassword: String(formData.get("currentPassword") ?? ""),
      nextPassword: String(formData.get("nextPassword") ?? ""),
    });
  }

  return (
    <>
      <PageTopbar icon="account_circle" label="Account" />
      <div className="dashboard account-page app-page">

      <div className="templates-layout">
        <section className="templates-column">
          <div className="dashboard-section-head">
            <span className="dashboard-section-kicker">Profile</span>
          </div>
          <form action={handleProfileUpdate} className="settings-panel">
            <label className="settings-field">
              <span>Name</span>
              <input name="name" defaultValue={profile?.name ?? ""} />
            </label>
            <label className="settings-field">
              <span>Email</span>
              <input value={profile?.email ?? ""} disabled readOnly />
            </label>
            <button type="submit" className="dashboard-empty-btn">
              Save profile
            </button>
          </form>
        </section>

        <section className="templates-column">
          <div className="dashboard-section-head">
            <span className="dashboard-section-kicker">Password</span>
          </div>
          <form action={handlePasswordChange} className="settings-panel">
            <label className="settings-field">
              <span>Current password</span>
              <input name="currentPassword" type="password" required />
            </label>
            <label className="settings-field">
              <span>New password</span>
              <input name="nextPassword" type="password" minLength={8} required />
            </label>
            <button type="submit" className="dashboard-empty-btn">
              Change password
            </button>
          </form>

          <Link href="/forgot-password" className="dashboard-secondary-btn">
            Open reset flow
          </Link>
        </section>
      </div>
    </div>
    </>
  );
}
