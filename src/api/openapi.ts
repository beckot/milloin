const pollToken = { name: "pollToken", in: "path", required: true, schema: { type: "string" } } as const;
const ownerSecurity = [{ ownerBearer: [] }] as const;
const participantSecurity = [{ participantBearer: [] }] as const;

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "milloin API",
    version: "1.0.0",
    description: "Agent-friendly scheduling poll API. All core workflows are available without browser automation.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      ownerBearer: { type: "http", scheme: "bearer", description: "Organizer credential" },
      participantBearer: { type: "http", scheme: "bearer", description: "Private participant edit capability" },
    },
    schemas: {
      Vote: { type: "string", enum: ["YES", "NO"] },
      Slot: { type: "object", required: ["id", "startsAtUtc"], properties: { id: { type: "string" }, startsAtUtc: { type: "string", format: "date-time" } } },
      AvailabilityInput: { type: "object", required: ["displayName", "votes"], properties: { displayName: { type: "string" }, votes: { type: "object", additionalProperties: { $ref: "#/components/schemas/Vote" } } } },
      Poll: { type: "object", required: ["id", "title", "timezone", "durationMinutes", "status", "slots", "participants"], properties: { id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, location: { type: "string" }, timezone: { type: "string", example: "Europe/Helsinki" }, durationMinutes: { type: "integer" }, status: { type: "string", enum: ["OPEN", "CLOSED"] }, winnerSlotId: { type: "string" }, slots: { type: "array", items: { $ref: "#/components/schemas/Slot" } }, participants: { type: "array", items: { type: "object", required: ["id", "displayName", "votes"], properties: { id: { type: "string" }, displayName: { type: "string" }, votes: { type: "object", additionalProperties: { $ref: "#/components/schemas/Vote" } } } } } } },
    },
  },
  paths: {
    "/polls": { post: { summary: "Create poll", security: ownerSecurity, responses: { "201": { description: "Created" }, "401": { description: "Unauthorized" } } } },
    "/polls/{pollToken}": {
      parameters: [pollToken],
      get: { summary: "Read public poll", responses: { "200": { description: "Poll" } } },
      patch: { summary: "Update poll metadata", security: ownerSecurity, responses: { "200": { description: "Updated poll" } } },
      delete: { summary: "Delete poll", security: ownerSecurity, responses: { "204": { description: "Deleted" } } },
    },
    "/polls/{pollToken}/results": { get: { summary: "Read availability summary", parameters: [pollToken], responses: { "200": { description: "Results with yes counts" } } } },
    "/polls/{pollToken}/slots": { post: { summary: "Add candidate time", parameters: [pollToken], security: ownerSecurity, responses: { "200": { description: "Updated poll" } } } },
    "/polls/{pollToken}/slots/{slotId}": { delete: { summary: "Delete candidate time and associated votes", parameters: [pollToken, { name: "slotId", in: "path", required: true, schema: { type: "string" } }], security: ownerSecurity, responses: { "200": { description: "Updated poll" } } } },
    "/polls/{pollToken}/participants": { post: { summary: "Submit availability", parameters: [pollToken], responses: { "201": { description: "Created response including one-time private edit token" } } } },
    "/polls/{pollToken}/participants/{participantId}": { put: { summary: "Edit participant availability", parameters: [pollToken, { name: "participantId", in: "path", required: true, schema: { type: "string" } }], security: participantSecurity, responses: { "200": { description: "Updated poll" } } } },
    "/polls/{pollToken}/winner": { post: { summary: "Select winner and close poll", parameters: [pollToken], security: ownerSecurity, responses: { "200": { description: "Closed poll" } } } },
    "/polls/{pollToken}/close": { post: { summary: "Close poll", parameters: [pollToken], security: ownerSecurity, responses: { "200": { description: "Closed poll" } } } },
    "/polls/{pollToken}/reopen": { post: { summary: "Reopen poll", parameters: [pollToken], security: ownerSecurity, responses: { "200": { description: "Open poll" } } } },
    "/polls/{pollToken}/calendar.ics": { get: { summary: "Download winning time as iCalendar", parameters: [pollToken], responses: { "200": { description: "iCalendar event" }, "409": { description: "No winner selected" } } } },
  },
} as const;
