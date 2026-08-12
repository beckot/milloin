export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "milloin API",
    version: "1.0.0",
    description: "Agent-friendly API for creating scheduling polls and submitting availability without browser automation.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      ownerBearer: { type: "http", scheme: "bearer", description: "Organizer API capability" },
      participantBearer: { type: "http", scheme: "bearer", description: "Participant private edit capability" },
    },
    schemas: {
      Vote: { type: "string", enum: ["YES", "NO"] },
      Slot: {
        type: "object",
        required: ["id", "startsAtUtc"],
        properties: { id: { type: "string" }, startsAtUtc: { type: "string", format: "date-time" } },
      },
      Participant: {
        type: "object",
        required: ["id", "displayName", "votes"],
        properties: {
          id: { type: "string" },
          displayName: { type: "string" },
          votes: { type: "object", additionalProperties: { $ref: "#/components/schemas/Vote" } },
        },
      },
      Poll: {
        type: "object",
        required: ["id", "ownerId", "title", "timezone", "durationMinutes", "status", "slots", "participants"],
        properties: {
          id: { type: "string" }, ownerId: { type: "string", readOnly: true }, title: { type: "string" },
          description: { type: "string" }, location: { type: "string" }, timezone: { type: "string", example: "Europe/Helsinki" },
          durationMinutes: { type: "integer" }, status: { type: "string", enum: ["OPEN", "CLOSED"] }, winnerSlotId: { type: "string" },
          slots: { type: "array", items: { $ref: "#/components/schemas/Slot" } },
          participants: { type: "array", items: { $ref: "#/components/schemas/Participant" } },
        },
      },
      AvailabilityInput: {
        type: "object", required: ["displayName", "votes"],
        properties: { displayName: { type: "string" }, votes: { type: "object", additionalProperties: { $ref: "#/components/schemas/Vote" } } },
      },
      Error: { type: "object", properties: { error: { type: "string" }, message: { type: "string" } } },
    },
  },
  paths: {
    "/polls": {
      post: {
        summary: "Create a scheduling poll", security: [{ ownerBearer: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["title", "timezone", "durationMinutes"], properties: { title: { type: "string" }, description: { type: "string" }, location: { type: "string" }, timezone: { type: "string" }, durationMinutes: { type: "integer" } } } } } },
        responses: { "201": { description: "Created" }, "401": { description: "Unauthorized" } },
      },
    },
    "/polls/{pollToken}": {
      parameters: [{ name: "pollToken", in: "path", required: true, schema: { type: "string" } }],
      get: { summary: "Read a public poll", responses: { "200": { description: "Poll", content: { "application/json": { schema: { $ref: "#/components/schemas/Poll" } } } } } },
      delete: { summary: "Delete a poll", security: [{ ownerBearer: [] }], responses: { "204": { description: "Deleted" } } },
    },
    "/polls/{pollToken}/slots": {
      parameters: [{ name: "pollToken", in: "path", required: true, schema: { type: "string" } }],
      post: { summary: "Add a candidate time", security: [{ ownerBearer: [] }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Slot" } } } }, responses: { "200": { description: "Updated poll" } } },
    },
    "/polls/{pollToken}/slots/{slotId}": {
      parameters: [{ name: "pollToken", in: "path", required: true, schema: { type: "string" } }, { name: "slotId", in: "path", required: true, schema: { type: "string" } }],
      delete: { summary: "Delete a candidate time and its votes", security: [{ ownerBearer: [] }], responses: { "200": { description: "Updated poll" } } },
    },
    "/polls/{pollToken}/participants": {
      parameters: [{ name: "pollToken", in: "path", required: true, schema: { type: "string" } }],
      post: { summary: "Submit a new participant response", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AvailabilityInput" } } } }, responses: { "201": { description: "Response created; includes private editToken" } } },
    },
    "/polls/{pollToken}/participants/{participantId}": {
      parameters: [{ name: "pollToken", in: "path", required: true, schema: { type: "string" } }, { name: "participantId", in: "path", required: true, schema: { type: "string" } }],
      put: { summary: "Edit one participant response", security: [{ participantBearer: [] }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AvailabilityInput" } } } }, responses: { "200": { description: "Updated poll" } } },
    },
    "/polls/{pollToken}/winner": {
      parameters: [{ name: "pollToken", in: "path", required: true, schema: { type: "string" } }],
      post: { summary: "Select winning time and close poll", security: [{ ownerBearer: [] }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["slotId"], properties: { slotId: { type: "string" } } } } } }, responses: { "200": { description: "Closed poll" } } },
    },
    "/polls/{pollToken}/close": {
      post: { summary: "Close a poll", security: [{ ownerBearer: [] }], parameters: [{ name: "pollToken", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Closed poll" } } },
    },
    "/polls/{pollToken}/reopen": {
      post: { summary: "Reopen a poll", security: [{ ownerBearer: [] }], parameters: [{ name: "pollToken", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Open poll" } } },
    },
    "/polls/{pollToken}/calendar.ics": {
      get: { summary: "Download the selected winning time as iCalendar", parameters: [{ name: "pollToken", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "iCalendar event", content: { "text/calendar": {} } }, "409": { description: "No winner selected" } } },
    },
  },
} as const;
