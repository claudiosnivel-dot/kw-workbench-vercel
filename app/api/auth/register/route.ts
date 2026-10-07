import { UserRole } from "@/lib/generated/prisma/enums";
import { NextResponse } from "next/server";
import { registerUser } from "@/lib/auth/credentials";
import { credentialsInputError, readCredentialsInput, registrationClosed } from "@/lib/auth/credentials-input";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { withApiErrors } from "@/lib/http/errors";

export const POST = withApiErrors(async (request: Request) => {
  const closed = registrationClosed();
  if (closed) {
    return closed;
  }

  const credentials = readCredentialsInput((await request.json()) as Record<string, unknown>);
  const invalid = credentialsInputError(credentials);
  if (invalid) {
    return invalid;
  }

  // Username non valido (400) o già in uso (409): AppError gestiti da withApiErrors, mai error.message grezzo.
  const { username, password } = credentials;
  const user = await registerUser({ username, password, role: UserRole.SUBSCRIBER });
  const response = NextResponse.json({ success: true });
  await setSessionCookie(response, user);
  return response;
});