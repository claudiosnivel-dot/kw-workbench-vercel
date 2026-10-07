/** Pulsante principale a tutta larghezza con il testo dell'azione in corso (T-1403…T-1405), testi già tradotti. */
export function SubmitButton({
  pending,
  label,
  pendingLabel,
  onClick,
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
  onClick?: () => void;
}) {
  return (
    <button className="btn-primary w-full" type={onClick ? "button" : "submit"} onClick={onClick} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
