import { GoogleSheetsPersonalCard } from "@/components/google-sheets-personal-card";
import { requirePageUser } from "@/lib/auth/page-guard";
import { getGoogleSheetsCredentialSnapshot } from "@/lib/integrations/google-sheets";

export const dynamic = "force-dynamic";

/** Sezione Collegamenti dell'account (T-2801): Google Sheets personale; qui torna il collegamento con Google. */
export default async function AccountConnectionsPage() {
  const user = await requirePageUser();
  const googleSheets = await getGoogleSheetsCredentialSnapshot(user.id);

  return (
    <GoogleSheetsPersonalCard
      initial={{
        connected: googleSheets.connected,
        status: googleSheets.status,
        needsReconnect: googleSheets.needsReconnect,
        connectedEmail: googleSheets.connectedEmail,
        scope: googleSheets.scope,
        tokenType: googleSheets.tokenType,
        updatedAt: googleSheets.updatedAt?.toISOString(),
      }}
    />
  );
}
