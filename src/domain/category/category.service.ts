"use server";

import { db } from "@/lib/db";
import {
  normalizeNoteCategoryColor,
  type NoteCategorySummary,
} from "./category.types";

export async function getNoteCategories(
  userId: string
): Promise<NoteCategorySummary[]> {
  const categories = await db.noteCategory.findMany({
    where: { userId },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      color: true,
      icon: true,
    },
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    color: normalizeNoteCategoryColor(category.color),
    icon: category.icon,
  }));
}

export async function createNoteCategory(
  userId: string,
  input: {
    name: string;
    color?: string | null;
    icon?: string | null;
  }
): Promise<NoteCategorySummary> {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Category name is required");
  }

  const existingCategory = await db.noteCategory.findFirst({
    where: {
      userId,
      name: {
        equals: name,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
      color: true,
      icon: true,
    },
  });

  if (existingCategory) {
    return {
      id: existingCategory.id,
      name: existingCategory.name,
      color: normalizeNoteCategoryColor(existingCategory.color),
      icon: existingCategory.icon,
    };
  }

  const createdCategory = await db.noteCategory.create({
    data: {
      userId,
      name,
      color: normalizeNoteCategoryColor(input.color),
      icon: input.icon?.trim() || null,
    },
    select: {
      id: true,
      name: true,
      color: true,
      icon: true,
    },
  });

  return {
    id: createdCategory.id,
    name: createdCategory.name,
    color: normalizeNoteCategoryColor(createdCategory.color),
    icon: createdCategory.icon,
  };
}
