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
  // Real implementation: SSH connect → exec `echo ok` → measure latency
  // For now we mark as online to demonstrate UI
  const updated = await setMachineStatus(id, "online");
  revalidatePath("/agents/machines");
  return updated;
}
