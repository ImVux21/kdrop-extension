# Issue tracker: Local Markdown

Issues and specs for K-Drop Studio live in `.scratch/`.

- One feature per directory: `.scratch/<feature-slug>/`.
- Spec: `.scratch/<feature-slug>/spec.md`.
- Tickets: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`.
- Record dependencies near the top as `Blocked by: NN, NN`.
- Append discussion under `## Comments`.

When a skill asks to publish an issue, create the corresponding Markdown file.
When it asks to fetch a ticket, read the path the user supplied.
