import { type NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { normalizeEmail } from "@/lib/auth/email-address";
import { getRequestWorkspace } from "@/lib/authz/workspace";
import { parseContactInput, sendContactMessage } from "@/lib/contact/message";
import { withApiErrors } from "@/lib/http/errors";
import { guardPublicForm } from "@/lib/security/captcha";

/**
 * Modulo contatti (T-1805), rotta pubblica: rate limit per IP e per email del mittente (T-1701), poi CAPTCHA con action
 * contact (T-1702), poi validazione e invio all'indirizzo di supporto con Reply-To del mittente; 202 { ok: true }. Con
 * un mittente autenticato l'email riporta solo l'id dell'utente e del workspace corrente.
 */
export const POST = withApiErrors(async (request: NextRequest) => {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  // Chiave per email solo con un indirizzo valido (lunghezza limitata); ogni altro valore condivide la chiave invalid.
  const email = normalizeEmail(body?.email) ?? "invalid";
  await guardPublicForm(request, {
    action: "contact",
    token: body?.turnstileToken,
    limits: (ip, rules) => [
      { key: `contact:ip:${ip}`, rule: rules.contactIp },
      { key: `contact:email:${email}`, rule: rules.contactEmail },
    ],
  });

  const input = parseContactInput(body);
  const user = await getOptionalAuthenticatedUserFromRequest(request);
  const account = user ? { userId: user.id, workspaceId: (await getRequestWorkspace(user, request)).workspace.id } : null;
  await sendContactMessage(input, account);
  return NextResponse.json({ ok: true }, { status: 202 });
});
