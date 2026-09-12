/**
 * Shared Tailwind CDN configuration.
 *
 * Previously this ~70-line block was pasted into every HTML page - and was
 * missing entirely from terms, privacy, give and announcement-details, which
 * left their footers referencing colour tokens that did not exist. Loading it
 * from one file keeps every page on the same palette and lets the CSP drop
 * 'unsafe-inline' for scripts.
 */
tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          "colors": {
            "on-secondary-container": "#745c00",
            "on-primary": "#ffffff",
            "on-tertiary": "#ffffff",
            "on-background": "#1b1c1a",
            "tertiary-fixed-dim": "#ffb3b5",
            "surface-container-high": "#eae8e4",
            "primary-fixed": "#b1f0ce",
            "primary": "#002d1c",
            "on-primary-fixed-variant": "#0e5138",
            "on-secondary": "#ffffff",
            "surface-container-highest": "#e4e2de",
            "outline": "#717973",
            "surface": "#fbf9f5",
            "surface-tint": "#2c694e",
            "primary-container": "#00452e",
            "on-surface-variant": "#414844",
            "surface-container-lowest": "#ffffff",
            "on-error": "#ffffff",
            "background": "#fbf9f5",
            "secondary-container": "#fed65b",
            "error-container": "#ffdad6",
            "surface-bright": "#fbf9f5",
            "inverse-on-surface": "#f2f0ed",
            "error": "#ba1a1a",
            "surface-container": "#efeeea",
            "inverse-surface": "#30312e",
            "primary-fixed-dim": "#95d4b3",
            "on-tertiary-fixed-variant": "#8e0f28",
            "surface-dim": "#dbdad6",
            "tertiary-container": "#7d001f",
            "on-tertiary-fixed": "#40000b",
            "tertiary-fixed": "#ffdada",
            "on-secondary-fixed-variant": "#574500",
            "on-error-container": "#93000a",
            "inverse-primary": "#95d4b3",
            "surface-variant": "#e4e2de",
            "outline-variant": "#c1c8c2",
            "tertiary": "#540012",
            "on-secondary-fixed": "#241a00",
            "on-primary-fixed": "#002114",
            "secondary-fixed": "#ffe088",
            "secondary": "#735c00",
            "on-primary-container": "#76b394",
            "secondary-fixed-dim": "#e9c349",
            "on-surface": "#1b1c1a",
            "surface-container-low": "#f5f3ef",
            "on-tertiary-container": "#ff7f87"
          },
          "borderRadius": {
            "DEFAULT": "0.25rem",
            "lg": "0.5rem",
            "xl": "0.75rem",
            "full": "9999px"
          },
          "fontFamily": {
            "headline": ["Noto Serif"],
            "body": ["Plus Jakarta Sans"],
            "label": ["Plus Jakarta Sans"]
          }
        }
      }
    };
