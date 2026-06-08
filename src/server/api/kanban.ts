"use server";

import { revalidatePath } from "next/cache";
import {
  createBoard,
  createCard,
  createColumn,
  deleteBoard,
  deleteCard,
  deleteColumn,
  getBoard,
  listBoards,
  moveCard,
  moveColumn,
  updateBoard,
  updateCard,
  updateColumn,
} from "@/domain/kanban/kanban.service";
import type {
  CreateCardInput,
  KanbanColumnColor,
  UpdateCardInput,
} from "@/domain/kanban/kanban.types";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function getBoardsAction() {
  const { userId } = await requireAuthenticatedUser();
  return listBoards(userId);
}

export async function getBoardAction(boardId: string) {
  const { userId } = await requireAuthenticatedUser();
  return getBoard(userId, boardId);
}

export async function createBoardAction(input?: { title?: string }) {
  const { userId } = await requireAuthenticatedUser();
  const boardId = await createBoard(userId, input ?? {});
  revalidatePath("/kanban");
  return boardId;
}

export async function updateBoardAction(
  boardId: string,
  patch: { title?: string; icon?: string | null },
) {
  const { userId } = await requireAuthenticatedUser();
  await updateBoard(userId, boardId, patch);
  revalidatePath("/kanban");
  revalidatePath(`/kanban/${boardId}`);
}

export async function deleteBoardAction(boardId: string) {
  const { userId } = await requireAuthenticatedUser();
  await deleteBoard(userId, boardId);
  revalidatePath("/kanban");
}

export async function createColumnAction(
  boardId: string,
  input?: { title?: string; color?: KanbanColumnColor | null },
) {
  const { userId } = await requireAuthenticatedUser();
  const columnId = await createColumn(userId, boardId, input ?? {});
  revalidatePath(`/kanban/${boardId}`);
  return columnId;
}

export async function updateColumnAction(
  boardId: string,
  columnId: string,
  patch: { title?: string; color?: KanbanColumnColor | null },
) {
  const { userId } = await requireAuthenticatedUser();
  await updateColumn(userId, boardId, columnId, patch);
}

export async function deleteColumnAction(boardId: string, columnId: string) {
  const { userId } = await requireAuthenticatedUser();
  await deleteColumn(userId, boardId, columnId);
}

export async function moveColumnAction(boardId: string, columnId: string, toIndex: number) {
  const { userId } = await requireAuthenticatedUser();
  await moveColumn(userId, boardId, columnId, toIndex);
}

export async function createCardAction(boardId: string, columnId: string, input: CreateCardInput) {
  const { userId } = await requireAuthenticatedUser();
  return createCard(userId, boardId, columnId, input);
}

export async function updateCardAction(cardId: string, patch: UpdateCardInput) {
  const { userId } = await requireAuthenticatedUser();
  await updateCard(userId, cardId, patch);
}

export async function toggleCardAction(cardId: string, completed: boolean) {
  const { userId } = await requireAuthenticatedUser();
  await updateCard(userId, cardId, { completed });
}

export async function deleteCardAction(cardId: string) {
  const { userId } = await requireAuthenticatedUser();
  await deleteCard(userId, cardId);
}

export async function moveCardAction(cardId: string, toColumnId: string, toIndex: number) {
  const { userId } = await requireAuthenticatedUser();
  await moveCard(userId, cardId, toColumnId, toIndex);
}
