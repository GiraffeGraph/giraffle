import { PageTopbar } from "@/components/ui/PageTopbar";
import { SavannaListPage } from "@/components/savanna/SavannaListPage";
import { getSavannasAction } from "@/server/api/savanna";

export default async function SavannaPage() {
  const savannas = await getSavannasAction();
  return (
    <>
      <PageTopbar icon="landscape" label="Savanna" />
      <SavannaListPage savannas={savannas} />
    </>
  );
}
