import { ColorVisionMode, FontScaleMode, ThemeMode, type UiLocale } from "@/lib/generated/prisma/enums";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { errorResponse, ValidationError, withApiErrors } from "@/lib/http/errors";
import { appLocaleOf, uiLocaleOf } from "@/lib/i18n/db-locale";
import { isOfferedLocale } from "@/lib/i18n/locale";
import { prisma } from "@/lib/prisma";

const THEME_VALUES = new Set<ThemeMode>(Object.values(ThemeMode));
const FONT_SCALE_VALUES = new Set<FontScaleMode>(Object.values(FontScaleMode));
const COLOR_VISION_VALUES = new Set<ColorVisionMode>(Object.values(ColorVisionMode));

type PreferencesPayload = {
  themeMode?: unknown;
  fontScaleMode?: unknown;
  colorVisionMode?: unknown;
  uiLocale?: unknown;
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

/** Lingua dell'interfaccia (T-4701): solo le lingue offerte; es-ES ed es-419 si salvano da T-4902, a cataloghi completi. */
function parseUiLocale(raw: unknown): UiLocale | null {
  if (raw === undefined) {
    return null;
  }

  if (!isOfferedLocale(raw)) {
    throw new ValidationError("uiLocale non valido");
  }

  return uiLocaleOf(raw);
}

export const GET = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);

  const snapshot = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      theme_mode: true,
      font_scale_mode: true,
      color_vision_mode: true,
      ui_locale: true,
    },
  });

  if (!snapshot) {
    return errorResponse(404, "USER_NOT_FOUND", "Utente non trovato");
  }

  return NextResponse.json({
    data: {
      themeMode: snapshot.theme_mode,
      fontScaleMode: snapshot.font_scale_mode,
      colorVisionMode: snapshot.color_vision_mode,
      uiLocale: appLocaleOf(snapshot.ui_locale),
    },
  });
});

export const PATCH = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const payload = (await request.json()) as PreferencesPayload;

  const themeMode = parseThemeMode(payload.themeMode);
  const fontScaleMode = parseFontScaleMode(payload.fontScaleMode);
  const colorVisionMode = parseColorVisionMode(payload.colorVisionMode);
  const uiLocale = parseUiLocale(payload.uiLocale);

  if (!themeMode && !fontScaleMode && !colorVisionMode && !uiLocale) {
    return errorResponse(400, "NO_CHANGES", "Nessuna preferenza da aggiornare");
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      theme_mode: themeMode ?? undefined,
      font_scale_mode: fontScaleMode ?? undefined,
      color_vision_mode: colorVisionMode ?? undefined,
      ui_locale: uiLocale ?? undefined,
    },
    select: {
      theme_mode: true,
      font_scale_mode: true,
      color_vision_mode: true,
      ui_locale: true,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      themeMode: updated.theme_mode,
      fontScaleMode: updated.font_scale_mode,
      colorVisionMode: updated.color_vision_mode,
      uiLocale: appLocaleOf(updated.ui_locale),
    },
  });
});