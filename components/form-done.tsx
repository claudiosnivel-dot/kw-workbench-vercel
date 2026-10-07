import Link from "next/link";
import { FormFeedback } from "@/components/form-feedback";

/** Esito riuscito di un form che chiude il percorso (T-1403, T-1404): conferma e link per proseguire, testi già tradotti. */
export function FormDone({ message, href, linkLabel }: { message: string; href: string; linkLabel: string }) {
  return (
    <div className="space-y-4">
      <FormFeedback success={message} />
      <Link href={href} className="btn-primary w-full text-center sm:w-auto">
        {linkLabel}
      </Link>
    </div>
  );
}
