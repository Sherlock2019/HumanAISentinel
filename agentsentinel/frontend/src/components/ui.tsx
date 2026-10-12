import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X, ArrowUpRight, ShieldCheck } from "lucide-react";
export function Badge({ value }: { value: string }) {
  const label: Record<string, string> = {
    RUNNING: "ACTIVE",
    REVIEW: "HUMAN REVIEW",
    ALLOW: "ALLOWED",
    BLOCK: "BLOCKED",
  };
  return (
    <span className={`badge ${value.toLowerCase()}`}>
      <i />
      {label[value] || value}
    </span>
  );
}
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Empty({
  title = "No events yet",
  text = "Run a safe scenario or start the guided demo to see the gateway in action.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty">
      <ShieldCheck size={36} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key === "Tab") {
        const elements = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,textarea,[tabindex="0"]',
          ) || [],
        );
        const first = elements[0],
          last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function RiskBar({ score }: { score: number }) {
  return (
    <div className="risk-inline">
      <span>
        {score}
        <small>/100</small>
      </span>
      <div className="risk-track">
        <i
          style={{
            width: `${score}%`,
            background:
              score >= 80
                ? "#dc414b"
                : score >= 55
                  ? "#d78c13"
                  : score >= 30
                    ? "#2d72cc"
                    : "#20987b",
          }}
        />
      </div>
    </div>
  );
}
export function LinkButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="link-btn" onClick={onClick}>
      {children}
      <ArrowUpRight size={14} />
    </button>
  );
}
