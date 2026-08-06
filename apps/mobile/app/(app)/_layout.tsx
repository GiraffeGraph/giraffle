import { Redirect } from "expo-router";
import { AppShell } from "@/components/shell/AppShell";
import { Loading } from "@/components/ui/primitives";
import { useApp } from "@/state/AppProvider";
export default function AppLayout(){const{phase}=useApp();if(phase==="booting")return <Loading/>;if(phase!=="ready")return <Redirect href="/"/>;return <AppShell/>}
