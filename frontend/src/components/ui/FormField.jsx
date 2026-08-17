import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
} from "react";

import classNames from "./classNames";

export default function FormField({
  id,
  label,
  hint,
  error,
  required = false,
  optionalLabel = "Không bắt buộc",
  className = "",
  children,
}) {
  const generatedId = useId();
  const childId = isValidElement(children) ? children.props.id : undefined;
  const controlId = id ?? childId ?? `ui-field-${generatedId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [
    isValidElement(children) ? children.props["aria-describedby"] : undefined,
    hintId,
    errorId,
  ].filter(Boolean).join(" ") || undefined;
  const controlProps = {
    id: controlId,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    required: required || (isValidElement(children) && children.props.required) || undefined,
  };
  const control = typeof children === "function"
    ? children(controlProps)
    : isValidElement(children)
      ? cloneElement(children, controlProps)
      : children;

  return (
    <div className={classNames("ui-field", error && "ui-field--error", className)}>
      {label ? (
        <label className="ui-field__label" htmlFor={controlId}>
          <span>{label}</span>
          {required ? (
            <span className="ui-field__required" aria-hidden="true">*</span>
          ) : optionalLabel ? (
            <small>{optionalLabel}</small>
          ) : null}
        </label>
      ) : null}
      {control}
      {hint ? <small className="ui-field__hint" id={hintId}>{hint}</small> : null}
      {error ? <small className="ui-field__error" id={errorId} role="alert">{error}</small> : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} className={classNames("ui-input", className)} {...props} />;
});

export const Select = forwardRef(function Select({ className = "", children, ...props }, ref) {
  return (
    <select ref={ref} className={classNames("ui-select", className)} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ className = "", ...props }, ref) {
  return <textarea ref={ref} className={classNames("ui-textarea", className)} {...props} />;
});
