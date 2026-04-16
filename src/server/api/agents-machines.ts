"use server";

import { revalidatePath } from "next/cache";
import {
  createMachine,
  deleteMachine,
  getMachineById,
  getMachines,
  setMachineStatus,
  updateMachine,
} from "@/domain/agents/machines.service";

export async function getMachinesAction() {
  return getMachines();
}

export async function getMachineByIdAction(id: string) {
  return getMachineById(id);
}

export async function createMachineAction(input: {
  label: string;
  host: string;
  port?: number;
  username: string;
  authType: "password" | "key";
  sshCredential: string;
}) {
  const machine = await createMachine(input);
  revalidatePath("/agents");
  revalidatePath("/agents/machines");
  return machine;
}

export async function updateMachineAction(
  id: string,
  input: {
    label?: string;
    host?: string;
    port?: number;
    username?: string;
    authType?: "password" | "key";
    sshCredential?: string;
  },
) {
  const machine = await updateMachine(id, input);
  revalidatePath("/agents");
  revalidatePath("/agents/machines");
  return machine;
}

export async function deleteMachineAction(id: string) {
  await deleteMachine(id);
  revalidatePath("/agents");
  revalidatePath("/agents/machines");
}

export async function pingMachineAction(id: string) {
  let status: "online" | "offline" = "offline";
  let latencyMs: number | null = null;

  try {
    const { sshPing } = await import("@/lib/ssh-manager");
    latencyMs = await sshPing(id);
    status = "online";
  } catch {
    // Connection failed — mark offline
  }

  const updated = await setMachineStatus(id, status);
  revalidatePath("/agents/machines");
  return { ...updated, latencyMs };
}
