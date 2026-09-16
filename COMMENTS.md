# Comment Style Guide

## Module header

Every source file begins with a module-level docstring. It states the file’s responsibility, the layer it belongs to (view, store, service, middleware, and so on), and the primary surfaces it exposes.

Use a block comment (`/** ... */` in JS/TS, `<!-- ... -->` in Vue templates). Keep it factual: what the module owns, not a walkthrough of the implementation.

## Backend and middleware

Document each exported function, route handler, and middleware with a brief JSDoc block:

- **Intent** — the isolated responsibility of the function
- **`@param`** — name, expected shape, and role of each argument
- **`@returns`** — payload, status side effects, or `next()` continuation
- **`@throws` / error paths** — only when the function itself produces a meaningful failure contract

Do not restate the function name. Document contracts, not line-by-line control flow.

## Frontend

Vue templates are partitioned into named UI regions:

- A **category** comment groups related features (for example `<!-- Navigation -->`).
- A **`Title:`** comment labels each distinct visual feature inside that region (for example `<!-- Title: User Menu -->`).

Place these annotations immediately above the markup they describe. Keep category and title names stable so the template can be scanned as a layout outline.
