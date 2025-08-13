# WhatsApp Automation App Using Venom, Vanilla JS, HTML, CSS, and Express

## Overview

Create a WhatsApp automation app that supports multiple sessions with Venom, allowing users to:
- Enter sender name (session identifier)
- Scan QR code in the UI (not terminal)
- Enter message text
- Send messages to contacts whose numbers and names are stored in a backend JSON file
- Support multiple sessions simultaneously

## File Structure and Responsibilities

```
/backend
  ├── contacts.json          # JSON file with contacts: array of {name, number}
  └── server.js              # Express backend with Venom integration and API endpoints

/frontend
  ├── index.html             # Main UI page with inputs and QR code display
  ├── script.js              # Frontend JS to handle UI logic and API calls
  └── style.css              # Styling for the UI (modern, clean, responsive)
```

## Backend Implementation

### 1. `backend/contacts.json`

- JSON array of contact objects with `name` and `number` fields.
- Example:
  ```json
  [
    {"name": "Alice", "number": "1234567890"},
    {"name": "Bob", "number": "0987654321"}
  ]
  ```
- This file will be loaded by the backend to map names to numbers.

### 2. `backend/server.js`

- Use Express.js to create REST API endpoints.
- Use Venom library to manage WhatsApp sessions.
- Support multiple sessions keyed by sender name.
- Maintain a map of active Venom clients per sender name.
- API Endpoints:
  - `POST /api/start-session`  
    - Input: `{ senderName: string }`  
    - Action: Initialize Venom client for senderName if not exists.  
    - Response: `{ qr: string }` (QR code as base64 image data)  
    - Handle QR code event from Venom and send QR data to frontend.
  - `POST /api/send-message`  
    - Input: `{ senderName: string, names: string (comma-separated), message: string }`  
    - Action: Parse names, map to numbers from contacts.json, send message via Venom client for senderName.  
    - Response: `{ success: boolean, details: string }`
- Error Handling:
  - Validate senderName exists and session is active.
  - Validate names exist in contacts.json.
  - Handle Venom client errors gracefully.
- Best Practices:
  - Use async/await for Venom operations.
  - Clean up sessions on server shutdown.
  - Log session and message sending status.

## Frontend Implementation

### 3. `frontend/index.html`

- Layout:
  - Header with app title.
  - Input field for sender name.
  - Button to start session.
  - QR code display area (canvas or img).
  - Textarea for message input.
  - Input field for recipient names (comma-separated).
  - Send message button.
  - Status area for feedback.
- UI/UX:
  - Modern, clean design using Tailwind CSS CDN.
  - Responsive layout for desktop and mobile.
  - Clear instructions and feedback messages.
  - Disable inputs/buttons appropriately during async operations.
- No external icons or images except placeholders if needed.

### 4. `frontend/script.js`

- Handle UI events:
  - On "Start Session" click: send senderName to backend `/api/start-session`.
  - Display QR code image returned from backend.
  - Poll or use WebSocket (if implemented) to update QR code if it changes.
  - On "Send Message" click: send senderName, parsed names array, and message to backend `/api/send-message`.
- Input parsing:
  - Split recipient names by comma, trim spaces.
  - Validate inputs before sending.
- Display success/error messages in status area.
- Use fetch API for backend communication.
- Handle network errors gracefully.

### 5. `frontend/style.css`

- Use Tailwind CSS for styling.
- Additional custom styles for layout, spacing, typography.
- Ensure good contrast and accessibility.
- Style QR code container with border and padding.
- Style buttons with hover and active states.

## Integration and Flow

1. User opens frontend page.
2. Enters sender name and clicks "Start Session".
3. Frontend calls backend to start Venom session for that sender.
4. Backend creates Venom client, listens for QR code event.
5. Backend sends QR code image data to frontend.
6. Frontend displays QR code for scanning.
7. User scans QR code with WhatsApp app.
8. User enters recipient names (comma-separated) and message.
9. User clicks "Send Message".
10. Frontend sends data to backend.
11. Backend maps names to numbers from contacts.json and sends messages via Venom client.
12. Backend responds with success or error.
13. Frontend displays status.

## Additional Considerations

- Support multiple sessions by maintaining Venom clients keyed by sender name.
- Handle Venom client lifecycle: initialization, QR code generation, session ready, error, and cleanup.
- Use JSON file for contacts; can be extended to database later.
- Use CORS middleware in Express if frontend served separately.
- Use environment variables or config for backend port and Venom options.
- Log important events for debugging.

## Summary

- Create `backend/contacts.json` with contacts data.
- Implement `backend/server.js` with Express and Venom for multi-session WhatsApp automation.
- Build modern, responsive UI in `frontend/index.html` with inputs for sender name, message, recipient names, and QR code display.
- Implement frontend logic in `frontend/script.js` to interact with backend APIs.
- Style UI with Tailwind CSS in `frontend/style.css`.
- Ensure robust error handling and user feedback.
- Support multiple sessions and QR code scanning in UI.
- Use vanilla JS, HTML, CSS as requested.
- No external icons or image services; use typography, colors, spacing for UI.
