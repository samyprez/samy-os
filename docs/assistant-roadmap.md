# Samy OS Assistant — Fast Track

## Target commands

- “Check my calendar.”
- “What do I have today?”
- “Show tasks for Salami Sibao.”
- “Update the Salami Sibao website task to completed.”
- “What clients need follow-up?”

## Safety model

Read-only actions can run immediately. Any action that changes data, sends a message, or creates an event must show a preview and require Samy’s confirmation.

## Implementation order

1. Connect UI input to the local intent parser.
2. Add Supabase tables for clients, tasks, notes, and brands.
3. Replace mock task data with Supabase queries.
4. Add Google sign-in.
5. Add Google Calendar read access.
6. Add event creation with confirmation.
7. Add OpenAI tool calling for flexible natural-language commands.
8. Add voice input in the browser.

## Definition of usable V1

Samy can sign in, view and update clients and tasks from any device, ask for today’s schedule, and create or update records through a confirmed assistant action.
