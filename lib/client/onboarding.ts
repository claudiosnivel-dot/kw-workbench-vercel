const PAUSE_FAILED_MESSAGE = "Impossibile mettere in pausa il percorso guidato.";

/** Mette in pausa l'onboarding (POST /api/onboarding/skip) e apre la dashboard, che mostra il banner di ripresa. */
export async function pauseOnboardingAndOpenDashboard(): Promise<void> {
  const response = await fetch("/api/onboarding/skip", { method: "POST" });
  if (!response.ok) {
    throw new Error(PAUSE_FAILED_MESSAGE);
  }

  window.location.assign("/");
}
