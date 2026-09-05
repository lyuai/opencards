# ADR 0001: Separate narrative knowledge from executable rules

Status: accepted

Markdown in `knowledge/` is the reviewable, Obsidian-friendly source for explanations,
strategy, citations, and examples. A deterministic per-game adapter is authoritative
for legal actions and state transitions. JSON Schemas version the interchange data.

This avoids making prose executable, prevents LLM hallucinations from deciding
legality, and still lets experts edit the domain knowledge without writing Python.
