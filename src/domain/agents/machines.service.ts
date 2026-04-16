import { db } from "@/lib/db";

export interface CreateMachineInput {
  label: string;
  host: string;
  port?: number;
  username: string;
  authType: "password" | "key";
  sshCredential: string;
}

export interface UpdateMachineInput {
  label?: string;
  host?: string;
  port?: number;
  username?: string;
  authType?: "password" | "key";
  sshCredential?: string;
}

/** Placeholder — swap with real AES-256 encryption before production. */
function encryptCredential(raw: string): string {
  // TODO: encrypt with server-side secret key
  return Buffer.from(raw).toString("base64");
}

export async function getMachines() {
  return db.machine.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { agents: true } },
    },
  });
}

export async function getMachineById(id: string) {
  return db.machine.findUnique({
    where: { id },
    include: { agents: true },
  });
}

export async function createMachine(input: CreateMachineInput) {
  return db.machine.create({
    data: {
      label: input.label,
      host: input.host,
      port: input.port ?? 22,
      username: input.username,
      authType: input.authType,
      sshCredential: encryptCredential(input.sshCredential),
      status: "unknown",
    },
  });
}

export async function updateMachine(id: string, input: UpdateMachineInput) {
  return db.machine.update({
    where: { id },
    data: {
      ...(input.label !== undefined && { label: input.label }),
      ...(input.host !== undefined && { host: input.host }),
      ...(input.port !== undefined && { port: input.port }),
      ...(input.username !== undefined && { username: input.username }),
      ...(input.authType !== undefined && { authType: input.authType }),
      ...(input.sshCredential !== undefined && {
        sshCredential: encryptCredential(input.sshCredential),
      }),
    },
  });
}

export async function deleteMachine(id: string) {
  return db.machine.delete({ where: { id } });
}

export async function setMachineStatus(
  id: string,
  status: "online" | "offline" | "unknown",
) {
  return db.machine.update({
    where: { id },
    data: { status, lastPingAt: new Date() },
  });
}
