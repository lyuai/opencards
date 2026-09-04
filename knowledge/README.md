# OpenCards Knowledge Vault

Open this directory directly as an Obsidian vault. Notes use YAML frontmatter,
stable IDs, wiki links, and ordinary Git history.

## Content states

`draft` -> `verified` -> `published` -> `superseded`

- A draft may be AI-generated but cannot be used as an authoritative rule.
- A verified note needs a named reviewer and at least one primary source.
- Published strategy may inform coaching prompts, but executable legality always
  comes from the versioned game engine and conformance tests.
- Corrections enter `feedback/inbox`; they are never written directly into a rule.

## Required frontmatter

```yaml
id: guandan.rules.overview
game: guandan
kind: rule
ruleset: competition-draft-2026-09
status: draft
sources: []
reviewed_by: []
updated: 2026-09-04
```

Use one claim per heading when possible. Give important claims stable block IDs so
the coach can cite a precise note and game-engine test.
