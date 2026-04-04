import {
  getPasswordResetTokenStateAction,
} from "@/server/api/auth";
import { ResetPasswordClient } from "./ResetPasswordClient";

interface ResetPasswordPageProps {
  params: Promise<{ token: string }>;
}

export default async function ResetPasswordPage({
  params,
}: ResetPasswordPageProps) {
  const { token } = await params;
  const tokenState = await getPasswordResetTokenStateAction(token);

  return <ResetPasswordClient token={token} tokenState={tokenState} />;
}
