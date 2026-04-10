"use server";

import { requireAuthenticatedUser } from "@/lib/auth-session";
import { db } from "@/lib/db";
import {
  DEFAULT_UNIVERSE_CAMERA,
  normalizeUniverseCamera,
} from "@/lib/universe-regions";

export async function getUniverseStateAction() {
  const { userId } = await requireAuthenticatedUser();
  const state = await db.universeState.findUnique({
    where: { userId },
    select: {
      cameraX: true,
      cameraY: true,
      zoom: true,
    },
  });

  return state
    ? normalizeUniverseCamera(state)
    : DEFAULT_UNIVERSE_CAMERA;
}

export async function saveUniverseCameraAction(
  cameraX: number,
  cameraY: number,
  zoom: number
) {
  const { userId } = await requireAuthenticatedUser();
  const camera = normalizeUniverseCamera({ cameraX, cameraY, zoom });

  await db.universeState.upsert({
    where: { userId },
    create: {
      userId,
      cameraX: camera.cameraX,
      cameraY: camera.cameraY,
      zoom: camera.zoom,
    },
    update: {
      cameraX: camera.cameraX,
      cameraY: camera.cameraY,
      zoom: camera.zoom,
    },
  });
}
