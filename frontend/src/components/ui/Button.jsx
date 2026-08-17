import { LoaderCircle } from "lucide-react";
import { forwardRef } from "react";

import classNames from "./classNames";

const Button = forwardRef(function Button({
  type = "button",
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel = "Đang xử lý...",
  startIcon,
  endIcon,
  fullWidth = false,
  className = "",
  disabled,
  children,
  ...props
}, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={classNames(
        "ui-button",
        `ui-button--${variant}`,
        `ui-button--${size}`,
        fullWidth && "ui-button--block",
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <LoaderCircle className="ui-button__spinner" size={18} aria-hidden="true" />
      ) : startIcon ? (
        <span className="ui-button__icon" aria-hidden="true">{startIcon}</span>
      ) : null}
      <span className="ui-button__label">{loading ? loadingLabel : children}</span>
      {!loading && endIcon ? (
        <span className="ui-button__icon" aria-hidden="true">{endIcon}</span>
      ) : null}
    </button>
  );
});

export default Button;
