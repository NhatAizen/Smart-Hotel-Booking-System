import { X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
} from "react";
import { createPortal } from "react-dom";

import classNames from "./classNames";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeLabel = "Đóng hộp thoại",
  closeOnBackdrop = true,
  closeOnEscape = true,
  hideCloseButton = false,
  initialFocusRef,
  ariaLabel,
  className = "",
  bodyClassName = "",
}) {
  const modalRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      const preferredTarget = initialFocusRef?.current;
      const firstTarget = modalRef.current?.querySelector(FOCUSABLE_SELECTOR);
      (preferredTarget ?? firstTarget ?? modalRef.current)?.focus();
    });

    function handleKeyDown(event) {
      if (event.key === "Escape" && closeOnEscape) {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = [...modalRef.current.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");

      if (focusable.length === 0) {
        event.preventDefault();
        modalRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [closeOnEscape, initialFocusRef, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="ui-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        ref={modalRef}
        className={classNames("ui-modal", `ui-modal--${size}`, className)}
        role="dialog"
        aria-modal="true"
        aria-label={!title ? ariaLabel : undefined}
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {title || description || !hideCloseButton ? (
          <header className="ui-modal__header">
            <div>
              {title ? <h2 id={titleId}>{title}</h2> : null}
              {description ? <p id={descriptionId}>{description}</p> : null}
            </div>
            {!hideCloseButton ? (
              <button
                type="button"
                className="ui-modal__close"
                onClick={onClose}
                aria-label={closeLabel}
              >
                <X size={20} aria-hidden="true" />
              </button>
            ) : null}
          </header>
        ) : null}
        <div className={classNames("ui-modal__body", bodyClassName)}>{children}</div>
        {footer ? <footer className="ui-modal__footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
