"use client";

import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "subtle";
  size?: "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm shadow-emerald-950 focus-visible:ring-emerald-500",
  secondary:
    "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 hover:text-white border border-zinc-700 shadow-sm focus-visible:ring-zinc-400",
  outline:
    "border border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-850 hover:text-white shadow-2xs focus-visible:ring-zinc-400",
  ghost:
    "bg-transparent text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200 focus-visible:ring-zinc-400",
  danger:
    "bg-red-950/80 text-red-300 border border-red-800 hover:bg-red-900 hover:text-white shadow-sm focus-visible:ring-red-500",
  subtle:
    "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 focus-visible:ring-zinc-400",
};

const sizeStyles: Record<NonNullable<ButtonProps["size"]>, string> = {
  xs: "px-2.5 py-1 text-xs rounded gap-1.5",
  sm: "px-3 py-1.5 text-xs font-semibold rounded-lg gap-1.5",
  md: "px-4 py-2 text-sm font-semibold rounded-xl gap-2",
  lg: "px-5 py-2.5 text-base font-bold rounded-xl gap-2.5",
  icon: "h-8 w-8 p-0 flex items-center justify-center rounded-lg",
  "icon-sm": "h-6 w-6 p-0 flex items-center justify-center rounded",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      loadingText,
      leftIcon,
      rightIcon,
      children,
      className = "",
      disabled,
      type = "button",
      ...props
    },
    ref
  ) => {
    const isActuallyDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isActuallyDisabled}
        aria-busy={isLoading ? "true" : undefined}
        aria-disabled={isActuallyDisabled ? "true" : undefined}
        className={`inline-flex items-center justify-center select-none font-medium cursor-pointer transition-all duration-140 active:scale-[0.975] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 disabled:transform-none ${
          variantStyles[variant]
        } ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <>
            <svg
              className="h-3.5 w-3.5 animate-spin shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              role="status"
              aria-label="Loading"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
            {loadingText ? <span>{loadingText}</span> : children ? <span>{children}</span> : null}
          </>
        ) : (
          <>
            {leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
