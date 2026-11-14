# Open Questions

1. No dedicated endpoint returns a user's team for an event; the planned workaround is to inspect the event team list and team details.
2. There is no team file listing endpoint; files must be discovered from chat attachments.
3. There is no endpoint for events a user judges or mentors; direct event links are required.
4. There is no token refresh endpoint; access tokens expire after 30 minutes.
5. Production deployment needs same-origin proxying or CORS configuration.
6. WebSocket event payload shapes are undocumented; REST refetching is the reliable fallback.
7. Notification deep-link targets depend on the fields present in `NotificationRead`.
8. There is no global search endpoint.
