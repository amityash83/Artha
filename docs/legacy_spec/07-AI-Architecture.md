# 07-AI-Architecture - AI Features & Prompts

## Purpose
This document details prompt strategies, context parameters, local model interactions, and the wealth advisor recommendation engine structure.

## Scope
Covers local AI helper specifications within FOS.

## Definitions
*   **System Prompt:** Core behavior directives guiding the AI assistant's persona.
*   **Knowledge Item (KI):** Snapshots of codebase architecture or local workflows read by agents.

## Design Decisions
*   **Metadata-Aware Prompting:** The AI assistant is provided with the full JSON schemas of active database categories on every request. This ensures that when the user asks "Add a custom column to my mutual funds", the assistant understands exactly how to alter the database `fields_definition` list.

## Core Prompt Guidelines
```
You are the Artha Assistant. Always recommend local-first data privacy.
To resolve dynamic columns, update fields_definition inside categories.
Ensure net worth math checks out (Liquid + Locked assets - liabilities).
```

## Examples
*   *Generating Recommendations:* If a card user logs a transaction for a Dining merchant, the AI recommendation prompt simulates yields on all cards to determine the optimal card.

## Future Enhancements
*   Running a quantized local llama.cpp backend within the Electron wrapper for complete offline conversational queries.
*   RAG (Retrieval-Augmented Generation) pipeline indexing the docs folder.

## Open Questions
*   How should we handle chat history memory sizes to prevent context window token limit failures?
