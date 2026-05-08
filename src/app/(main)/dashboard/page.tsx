import { PageTopbar } from "@/components/ui/PageTopbar";

export default function DashboardPage() {
  return (
    <>
      <PageTopbar icon="home" label="Dashboard" />
      <div className="dashboard app-page" />
    </>
  );
}
