import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "filled" | "tonal" | "outlined" | "text" | "elevated";
  icon?: boolean; // Set to true if this is an Icon Button (40x40 circle)
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  fab?: boolean | "small" | "large" | "extended" | "surface";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "filled",
      icon = false,
      leadingIcon,
      trailingIcon,
      fab = false,
      className = "",
      disabled,
      ...props
    },
    ref
  ) => {
    // Determine base class
    let baseClass = "md-button";
    if (icon) {
      baseClass = "md-icon-button";
    } else if (fab) {
      baseClass = "md-fab";
    }

    // Determine variant class
    let variantClass = "";
    if (variant !== "filled") {
      variantClass = `${baseClass}--${variant}`;
    } else if (icon || fab) {
      // Icon and FAB variants need explicit filled modifier sometimes, 
      // but usually base is filled.
      variantClass = `${baseClass}--filled`;
    }

    // Determine fab specific size overrides
    let fabClass = "";
    if (fab === "small") fabClass = "md-fab--small";
    if (fab === "large") fabClass = "md-fab--large";
    if (fab === "extended") fabClass = "md-fab--extended";
    if (fab === "surface") fabClass = "md-fab--surface";

    // Determine icon padding modifiers for standard buttons
    let iconPaddingClass = "";
    if (!icon && !fab) {
      if (leadingIcon) iconPaddingClass += " md-button--icon-leading";
      if (trailingIcon) iconPaddingClass += " md-button--icon-trailing";
    }

    const classes = [baseClass, variantClass, fabClass, iconPaddingClass, className]
      .filter(Boolean)
      .join(" ");

    return (
      <button ref={ref} className={classes} disabled={disabled} aria-disabled={disabled} {...props}>
        {leadingIcon && (
          <span className="material-symbols-outlined" aria-hidden="true">
            {leadingIcon}
          </span>
        )}
        
        {children}
        
        {trailingIcon && (
          <span className="material-symbols-outlined" aria-hidden="true">
            {trailingIcon}
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
