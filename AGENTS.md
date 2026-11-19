# Kairn repository instructions

- Start with [implementation progress](docs/progress.md) to find the current milestone, its implementation plan, verified work, and pending decisions. Use the [documentation index](docs/README.md) to find the core planning references. Follow the [requirements](docs/core/product-requirements.md) for product scope and the [architecture](docs/core/architecture.md) for boundaries.
- Update [implementation progress](docs/progress.md) in the same change when a milestone starts, completes, changes direction, or hits a material blocker. Record the next concrete step and the actual validation result, with links to durable evidence. Keep it short and use Git history for older status.
- Keep automated regression checks and reusable fixtures under `tests/`. Keep test-only routes out of application bundles.
