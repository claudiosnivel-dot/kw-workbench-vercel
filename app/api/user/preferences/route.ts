import { ColorVisionMode, FontScaleMode, ThemeMode } from "@/lib/generated/prisma/enums";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { ValidationError, withApiErrors } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";

const THEME_VALUES = new Set<ThemeMode>(Object.values(ThemeMode));
const FONT_SCALE_VALUES = new Set<FontScaleMode>(Object.values(FontScaleMode));
const COLOR_VISION_VALUES = new Set<ColorVisionMode>(Object.values(ColorVisionMode));

type PreferencesPayload = {
  themeMode?: unknown;
  fontScaleMode?: unknown;
  colorVisionMode?: unknown;
};

function parseThemeMode(raw: unknown): ThemeMode | null {
  if (raw === undefined) {
    return null;
  }

  const value = String(raw).trim().toUpperCase() as ThemeMode;
  if (!THEME_VALUES.has(value)) {
    throw new ValidationError("themeMode non valido");
  }

  return value;
}

function parseFontScaleMode(raw: unknown): FontScaleMode | null {
  if (raw === undefined) {
    return null;
  }

  const value = String(raw).trim().toUpperCase() as FontScaleMode;
  if (!FONT_SCALE_VALUES.has(value)) {
    throw new ValidationError("fontScaleMode non valido");
  }

  return value;
}

function parseColorVisionMode(raw: unknown): ColorVisionMode | null {
  if (raw === undefined) {
    return null;
  }

  const value = String(raw).trim().toUpperCase() as ColorVisionMode;
  if (!COLOR_VISION_VALUES.has(value)) {
    throw new ValidationError("colorVisionMode non valido");
  }

  return value;
}

export const GET = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);

  const snapshot = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      theme_mode: true,
      font_scale_mode: true,
      color_vision_mode: true,
    },
  });

  if (!snapshot) {
    return NextResponse.json({ error: "Utente non trovato", code: "USER_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      themeMode: snapshot.theme_mode,
      fontScaleMode: snapshot.font_scale_mode,
      colorVisionMode: snapshot.color_vision_mode,
    },
  });
});

export const PATCH = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const payload = (await request.json()) as PreferencesPayload;

  const themeMode = parseThemeMode(payload.themeMode);
  const fontScaleMode = parseFontScaleMode(payload.fontScaleMode);
  const colorVisionMode = parseColorVisionMode(payload.colorVisionMode);

  if (!themeMode && !fontScaleMode && !colorVisionMode) {
    return NextResponse.json({ error: "Nessuna preferenza da aggiornare", code: "NO_CHANGES" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      theme_mode: themeMode ?? undefined,
      font_scale_mode: fontScaleMode ?? undefined,
      color_vision_mode: colorVisionMode ?? undefined,
    },
    select: {
      theme_mode: true,
      font_scale_mode: true,
      color_vision_mode: true,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      themeMode: updated.theme_mode,
      fontScaleMode: updated.font_scale_mode,
      colorVisionMode: updated.color_vision_mode,
    },
  });
});