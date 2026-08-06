import Link from "next/link";
import { Button } from "@/components/ui/Button";
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
      <div className="account-page app-page">
        <div className="form-sections">
          <section className="form-section">
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
              <div className="form-section-actions">
                <Button type="submit">Save profile</Button>
              </div>
            </form>
          </section>

          <section className="form-section">
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
              <div className="form-section-actions">
                <Button type="submit">Change password</Button>
                <Link href="/forgot-password" className="dashboard-secondary-btn">
                  Reset password
                </Link>
              </div>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
