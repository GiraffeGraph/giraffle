import { CommandSearchBar } from "@/components/dashboard/CommandSearchBar";
import { PageTopbar } from "@/components/ui/PageTopbar";

export default function DashboardPage() {
  return (
    <>
      <PageTopbar
        icon="home"
        label="Dashboard"
        meta={<span style={{ whiteSpace: "nowrap" }}>Command mode</span>}
      />
      <div className="dashboard app-page">
        <CommandSearchBar />
      </div>
    </>
  );
}
