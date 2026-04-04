import Link from "next/link";
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
    <div className="dashboard account-page">
      <section className="dashboard-hero">
        <div className="dashboard-header">
          <div className="dashboard-kicker">Hesap</div>
          <h1 className="dashboard-title">Hesap ayarlari</h1>
          <p className="dashboard-subtitle">
            Profilini guncelle, sifreni degistir ve reset akisini yonet.
          </p>
        </div>
      </section>

      <div className="templates-layout">
        <section className="templates-column">
          <div className="dashboard-section-head">
            <span className="dashboard-section-kicker">Profil</span>
          </div>
          <form action={handleProfileUpdate} className="settings-panel">
            <label className="settings-field">
              <span>Ad</span>
              <input name="name" defaultValue={profile?.name ?? ""} />
            </label>
            <label className="settings-field">
              <span>E-posta</span>
              <input value={profile?.email ?? ""} disabled readOnly />
            </label>
            <button type="submit" className="dashboard-empty-btn">
              Profili kaydet
            </button>
          </form>
        </section>

        <section className="templates-column">
          <div className="dashboard-section-head">
            <span className="dashboard-section-kicker">Sifre</span>
          </div>
          <form action={handlePasswordChange} className="settings-panel">
            <label className="settings-field">
              <span>Mevcut sifre</span>
              <input name="currentPassword" type="password" required />
            </label>
            <label className="settings-field">
              <span>Yeni sifre</span>
              <input name="nextPassword" type="password" minLength={8} required />
            </label>
            <button type="submit" className="dashboard-empty-btn">
              Sifreyi degistir
            </button>
          </form>

          <Link href="/forgot-password" className="dashboard-secondary-btn">
            Reset akisini ac
          </Link>
        </section>
      </div>
    </div>
  );
}
