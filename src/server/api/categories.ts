"use server";

import { revalidatePath } from "next/cache";
import {
  createNoteCategory,
  getNoteCategories,
} from "@/domain/category/category.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function getNoteCategoriesAction() {
  const { userId } = await requireAuthenticatedUser();
  return getNoteCategories(userId);
}

export async function createNoteCategoryAction(input: {
  name: string;
  color?: string | null;
  icon?: string | null;
}) {
  const { userId } = await requireAuthenticatedUser();
  const category = await createNoteCategory(userId, input);

  revalidatePath("/dashboard");
  revalidatePath("/search");

  return category;
}
