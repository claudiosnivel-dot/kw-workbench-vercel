import { redirect } from "next/navigation";

/** La creazione di un progetto parte dal campo della home (T-2305): il vecchio indirizzo porta lì. */
export default function NewProjectPage() {
  redirect("/");
}
