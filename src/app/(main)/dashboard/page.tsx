import { PageTopbar } from "@/components/ui/PageTopbar";

export default function DashboardPage() {
  return (
    <>
      <PageTopbar icon="home" label="Pano" currentPath="/dashboard" />
      <div className="app-page" />
    </>
  );
}
