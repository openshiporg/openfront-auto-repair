# Openfront Auto Repair: agent rules

- NEVER build outbox/texting/email notification machinery or cron/worker services. External events = Openfront Commerce webhooks (features/webhooks) only.
- Time-based states (for example tire registration overdue) are computed on read, never by a scheduled job.
