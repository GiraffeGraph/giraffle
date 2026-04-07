import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "elevated" | "filled" | "outlined";
  isClickable?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, variant = "elevated", isClickable = false, className = "", ...props }, ref) => {
    const classes = [
      "md-card",
      `md-card--${variant}`,
      isClickable ? "md-card--clickable" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div ref={ref} className={classes} tabIndex={isClickable ? 0 : undefined} role={isClickable ? "button" : undefined} {...props}>
        {children}
      </div>
    );
  }
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, className = "", ...props }, ref) => (
    <div ref={ref} className={`md-card-header ${className}`} {...props}>
      {children}
    </div>
  )
);
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ children, className = "", ...props }, ref) => (
    <h3 ref={ref} className={`md-card-title ${className}`} {...props}>
      {children}
    </h3>
  )
);
CardTitle.displayName = "CardTitle";

export const CardSubtitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ children, className = "", ...props }, ref) => (
    <p ref={ref} className={`md-card-subtitle ${className}`} {...props}>
      {children}
    </p>
  )
);
CardSubtitle.displayName = "CardSubtitle";

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, className = "", ...props }, ref) => (
    <div ref={ref} className={`md-card-content ${className}`} {...props}>
      {children}
    </div>
  )
);
CardContent.displayName = "CardContent";

export const CardActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { align?: "start" | "end" }>(
  ({ children, align = "end", className = "", ...props }, ref) => (
    <div
      ref={ref}
      className={`md-card-actions ${align === "start" ? "md-card-actions--start" : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);
CardActions.displayName = "CardActions";
