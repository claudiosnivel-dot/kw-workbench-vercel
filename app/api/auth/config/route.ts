import { NextRequest, NextResponse } from "next/server";
import {
  getAuthConfigSnapshot,
  updateAuthCredentials,
  verifyLoginCredentials,
} from "@/lib/auth/credentials";

export async function GET() {
  const snapshot = await getAuthConfigSnapshot();
  return NextResponse.json({ data: snapshot });
}

export async function PATCH(request: NextRequest) {
  const payload = (await request.json()) as {
    currentPassword?: string;
    username?: string;
    newPassword?: string;
    confirmPassword?: string;
  };

  const currentPassword = String(payload.currentPassword ?? "");
  if (!currentPassword) {
    return NextResponse.json({ error: "La password attuale e obbligatoria" }, { status: 400 });
  }

  const currentSnapshot = await getAuthConfigSnapshot();
  const currentValid = await verifyLoginCredentials(currentSnapshot.username, currentPassword);
  if (!currentValid) {
    return NextResponse.json({ error: "La password attuale non e valida" }, { status: 401 });
  }

  const username = String(payload.username ?? "").trim();
  const newPassword = String(payload.newPassword ?? "");
  const confirmPassword = String(payload.confirmPassword ?? "");

  if (!username && !newPassword) {
    return NextResponse.json({ error: "Nessuna modifica da salvare" }, { status: 400 });
  }

  if (newPassword) {
    if (newPassword.length < 4) {
      return NextResponse.json({ error: "La nuova password deve avere almeno 4 caratteri" }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "Nuova password e conferma non coincidono" }, { status: 400 });
    }
  }

  const snapshot = await updateAuthCredentials({
    username: username || undefined,
    password: newPassword || undefined,
  });

  return NextResponse.json({ data: snapshot });
}