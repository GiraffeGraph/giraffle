import { PageTopbar } from "@/components/ui/PageTopbar";
import { CoatCanvasListPage } from "@/components/coat-canvas/CoatCanvasListPage";
import { getCoatCanvasesAction } from "@/server/api/coat-canvas";

export default async function CoatCanvasPage() {
  const canvases = await getCoatCanvasesAction();

  return (
    <>
      <PageTopbar icon="texture" label="Coat Canvas" />
      <CoatCanvasListPage canvases={canvases} />
    </>
  );
}
