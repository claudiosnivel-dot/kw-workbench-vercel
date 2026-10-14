"use client";

import { useTranslations } from "next-intl";
import { useMenuButton } from "@/lib/client/use-menu-button";
import { STRATEGY_PAGE_STATUSES, type StrategyPageStatus } from "@/lib/modules/strategy/types";

type StatusMenuProps = {
  /** H1 della pagina, per l'etichetta accessibile del pulsante. */
  title: string;
  status: StrategyPageStatus;
  /** null nelle versioni precedenti: l'etichetta resta testo, senza menu. */
  onChange: ((status: StrategyPageStatus) => void) | null;
};

/** Etichetta colorata dello stato di scrittura (T-2501): neutra da scrivere, ambra in scrittura, verde pubblicata. */
export function StatusLabel({ status }: { status: StrategyPageStatus }) {
  const t = useTranslations("strategy.status");
  return <span className={`plan-status is-${status.toLowerCase()}`}>{t(status)}</span>;
}

/**
 * Etichetta di stato di una scheda con il suo menu (T-2504): l'alternativa da tastiera e da touch al trascinamento tra
 * le colonne di Raggruppa per Stato. Pattern menu button con voci menuitemradio (useMenuButton).
 */
export function StatusMenu({ title, status, onChange }: StatusMenuProps) {
  const t = useTranslations("plan.card");
  const tStatus = useTranslations("strategy.status");
  const { open, close, onKeyDown, wrapperRef, buttonRef, menuRef, buttonProps, menuProps } = useMenuButton();

  if (!onChange) {
    return <StatusLabel status={status} />;
  }

  return (
    <div ref={wrapperRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        {...buttonProps}
        aria-label={t("status", { title, status: tStatus(status) })}
        className={`plan-status is-${status.toLowerCase()} is-button`}
      >
        {tStatus(status)}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="user-menu-popover is-start plan-status-popover">
          <div ref={menuRef} {...menuProps} aria-label={t("status", { title, status: tStatus(status) })} className="grid gap-0.5">
            {STRATEGY_PAGE_STATUSES.map((option) => (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={option === status}
                tabIndex={-1}
                className="user-menu-item"
                onClick={() => {
                  close();
                  buttonRef.current?.focus();
                  if (option !== status) onChange(option);
                }}
              >
                {tStatus(option)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
