import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * CampusLink — "Counter".
 * Every value here resolves to a CSS custom property declared in
 * src/index.css. Nothing in this file should hardcode a colour,
 * shadow, radius or duration.
 */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1rem", md: "1.5rem" },
      screens: { "2xl": "1120px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        divider: "hsl(var(--divider))",
        "border-strong": "hsl(var(--border-strong))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",

        surface: {
          DEFAULT: "hsl(var(--surface))",
          foreground: "hsl(var(--surface-foreground))",
          sunken: "hsl(var(--surface-sunken))",
          elevated: "hsl(var(--surface-elevated))",
        },

        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          soft: "hsl(var(--primary-soft))",
          deep: "hsl(var(--primary-deep))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          soft: "hsl(var(--accent-soft))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          soft: "hsl(var(--info-soft))",
        },

        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          soft: "hsl(var(--success-soft))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          soft: "hsl(var(--warning-soft))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          soft: "hsl(var(--destructive-soft))",
        },

        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        faint: "hsl(var(--text-faint))",

        disabled: {
          DEFAULT: "hsl(var(--disabled-surface))",
          foreground: "hsl(var(--disabled-foreground))",
        },

        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },

      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
      },

      fontFamily: {
        display: "var(--font-display)",
        body: "var(--font-body)",
        data: "var(--font-data)",
        heading: "var(--font-display)",
      },

      // The type scale. Fredoka (display/heading) is a rounded sans, so
      // headings lean on weight for emphasis rather than tight negative
      // tracking; data sizes are tuned for the OTP/tip/distance numerals.
      fontSize: {
        display: ["3.25rem", { lineHeight: "0.98", letterSpacing: "-0.01em" }],
        "display-sm": ["2.25rem", { lineHeight: "1.02", letterSpacing: "-0.005em" }],
        h1: ["1.875rem", { lineHeight: "1.08", letterSpacing: "-0.005em" }],
        h2: ["1.5rem", { lineHeight: "1.15" }],
        h3: ["1.0625rem", { lineHeight: "1.3" }],
        body: ["1rem", { lineHeight: "1.62" }],
        "body-sm": ["0.875rem", { lineHeight: "1.55" }],
        caption: ["0.8125rem", { lineHeight: "1.4" }],
        label: ["0.6875rem", { lineHeight: "1.3", letterSpacing: "0.13em" }],
        data: ["1.875rem", { lineHeight: "1", letterSpacing: "0.02em" }],
        "data-lg": ["2.75rem", { lineHeight: "1", letterSpacing: "0.14em" }],
      },

      maxWidth: {
        layout: "var(--layout-max)",
        measure: "var(--measure)",
      },

      boxShadow: {
        subtle: "var(--elevation-subtle)",
        default: "var(--elevation-default)",
        elevated: "var(--elevation-elevated)",
        floating: "var(--elevation-floating)",
      },

      transitionDuration: {
        instant: "var(--duration-instant)",
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
        deliberate: "var(--duration-deliberate)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        emphasized: "var(--ease-emphasized)",
      },

      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "rise-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "settle-through": {
          "0%": { opacity: "1" },
          "100%": { opacity: "0.4" },
        },
        "dot-settle": {
          "0%": { transform: "scale(0.4)" },
          "60%": { transform: "scale(1.25)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "rise-in": "rise-in var(--duration-base) var(--ease-out) both",
        "dot-settle": "dot-settle var(--duration-slow) var(--ease-emphasized) both",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
