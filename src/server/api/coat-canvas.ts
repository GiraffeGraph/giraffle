"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addCoatCell,
  createCoatCanvas,
  deleteCoatCanvas,
  getCoatCanvas,
  getCoatCanvases,
  removeCoatCell,
  updateCanvasTitle,
  updateCoatCell,
} from "@/domain/coat-canvas/coat-canvas.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";
import type { CoatCell, CoatCellColor, CreateCanvasInput, UpdateCellInput } from "@/domain/coat-canvas/coat-canvas.types";

export async function getCoatCanvasesAction() {
  const { userId } = await requireAuthenticatedUser();
  return getCoatCanvases(userId);
}

export async function getCoatCanvasAction(canvasId: string) {
  const { userId } = await requireAuthenticatedUser();
  return getCoatCanvas(userId, canvasId);
}

export async function createCoatCanvasAction(input: CreateCanvasInput) {
  const { userId } = await requireAuthenticatedUser();
  const canvasId = await createCoatCanvas(userId, input);
  revalidatePath("/coat-canvas");
  return canvasId;
}

export async function createAndRedirectAction(input: CreateCanvasInput) {
  const { userId } = await requireAuthenticatedUser();
  const canvasId = await createCoatCanvas(userId, input);
  revalidatePath("/coat-canvas");
  redirect(`/coat-canvas/${canvasId}`);
}

export async function updateCanvasTitleAction(canvasId: string, title: string) {
  const { userId } = await requireAuthenticatedUser();
  await updateCanvasTitle(userId, canvasId, title);
  revalidatePath("/coat-canvas");
  revalidatePath(`/coat-canvas/${canvasId}`);
}

export async function addCoatCellAction(
  canvasId: string,
  input: { title?: string; colSpan?: number; rowSpan?: number; color?: CoatCellColor; noteId?: string }
) {
  const { userId } = await requireAuthenticatedUser();
  const cellId = await addCoatCell(userId, canvasId, input);
  revalidatePath(`/coat-canvas/${canvasId}`);
  return cellId;
}

export async function addNoteToCanvasAction(
  canvasId: string,
  noteId: string,
  input: { colSpan?: number; rowSpan?: number; color?: CoatCellColor }
): Promise<CoatCell> {
  const { userId } = await requireAuthenticatedUser();
  const cellId = await addCoatCell(userId, canvasId, { noteId, ...input });
  const canvas = await getCoatCanvas(userId, canvasId);
  const cell = canvas?.cells.find((item) => item.id === cellId);
  if (!cell) throw new Error("Cell not found after creation");
  revalidatePath(`/coat-canvas/${canvasId}`);
  return cell;
}

export async function updateCoatCellAction(
  canvasId: string,
  cellId: string,
  input: UpdateCellInput
) {
  const { userId } = await requireAuthenticatedUser();
  await updateCoatCell(userId, canvasId, cellId, input);
  revalidatePath(`/coat-canvas/${canvasId}`);
}

export async function removeCoatCellAction(canvasId: string, cellId: string) {
  const { userId } = await requireAuthenticatedUser();
  await removeCoatCell(userId, canvasId, cellId);
  revalidatePath(`/coat-canvas/${canvasId}`);
}

export async function deleteCoatCanvasAction(canvasId: string) {
  const { userId } = await requireAuthenticatedUser();
  await deleteCoatCanvas(userId, canvasId);
  revalidatePath("/coat-canvas");
  redirect("/coat-canvas");
}
