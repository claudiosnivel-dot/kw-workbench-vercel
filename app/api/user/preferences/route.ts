import { ColorVisionMode, FontScaleMode, ThemeMode } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  getSessionMaxAgeSeconds,
  SESSION_COOKIE_NAME,
  shouldUseSecureCookies,
} from "@/lib/auth/config";
import { AuthRequiredError, requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { createSessionToken } from "@/lib/auth/session";
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
    throw new Error("themeMode non valido");
  }

  return value;
}

function parseFontScaleMode(raw: unknown): FontScaleMode | null {
  if (raw === undefined) {
    return null;
  }

  const value = String(raw).trim().toUpperCase() as FontScaleMode;
  if (!FONT_SCALE_VALUES.has(value)) {
    throw new Error("fontScaleMode non valido");
  }

  return value;
}

function parseColorVisionMode(raw: unknown): ColorVisionMode | null {
  if (raw === undefined) {
    return null;
  }

  const value = String(raw).trim().toUpperCase() as ColorVisionMode;
  if (!COLOR_VISION_VALUES.has(value)) {
    throw new Error("colorVisionMode non valido");
  }

  return value;
}

export async function GET(request: NextRequest) {
  try {
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
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        themeMode: snapshot.theme_mode,
        fontScaleMode: snapshot.font_scale_mode,
        colorVisionMode: snapshot.color_vision_mode,
      },
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore interno" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUserFromRequest(request);
    const payload = (await request.json()) as PreferencesPayload;

    const themeMode = parseThemeMode(payload.themeMode);
    const fontScaleMode = parseFontScaleMode(payload.fontScaleMode);
    const colorVisionMode = parseColorVisionMode(payload.colorVisionMode);

    if (!themeMode && !fontScaleMode && !colorVisionMode) {
      return NextResponse.json({ error: "Nessuna preferenza da aggiornare" }, { status: 400 });
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

    const token = await createSessionToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      isRootAdmin: user.isRootAdmin,
      themeMode: updated.theme_mode,
      fontScaleMode: updated.font_scale_mode,
      colorVisionMode: updated.color_vision_mode,
    });

    const response = NextResponse.json({
      success: true,
      data: {
        themeMode: updated.theme_mode,
        fontScaleMode: updated.font_scale_mode,
        colorVisionMode: updated.color_vision_mode,
      },
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookies(),
      maxAge: getSessionMaxAgeSeconds(),
      path: "/",
    });

    return response;
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message.endsWith("non valido")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore interno" }, { status: 500 });
  }
}