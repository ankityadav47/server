# IMAP Server API

This is a Node.js Express server that handles IMAP operations for the BulkMail application. It provides an API for connecting to IMAP servers, fetching emails, and testing connections.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

## API Endpoints

### Fetch Emails

**POST /api/fetch-email**

Fetches emails from an IMAP server based on the provided configuration.

**Request Body:**

```json
{
  "action": "fetch", // or "check"
  "emailConfig": {
    "host": "mail.example.com",
    "username": "user@example.com",
    "password": "your-password",
    "security": "SSL" // or "TLS", "STARTTLS", "NONE"
  }
}
```

**Response:**

```json
{
  "success": true,
  "message": "Emails fetched successfully",
  "totalMessages": 100,
  "newMessages": 10,
  "fetchedEmails": [
    {
      "uid": "123",
      "messageId": "<message-id@example.com>",
      "sender": "Sender Name <sender@example.com>",
      "senderEmail": "sender@example.com",
      "senderName": "Sender Name",
      "recipient": "recipient@example.com",
      "subject": "Email Subject",
      "body": "Plain text body",
      "htmlBody": "<html>HTML body</html>",
      "receivedAt": "2023-01-01T00:00:00.000Z",
      "headers": {},
      "inReplyTo": null,
      "references": null
    }
  ]
}
```

### Test Connection

**POST /api/test-connection**

Tests the connection to an IMAP server.

**Request Body:**

```json
{
  "emailConfig": {
    "host": "mail.example.com",
    "username": "user@example.com",
    "password": "your-password",
    "security": "SSL" // or "TLS", "STARTTLS", "NONE"
  }
}
```

**Response:**

```json
{
  "success": true,
  "message": "Connection test successful",
  "mailboxInfo": {
    "totalMessages": 100,
    "host": "mail.example.com",
    "port": 993
  }
}
```

### Health Check

**GET /health**

Checks if the server is running.

**Response:**

```json
{
  "status": "ok"
}
```

## Error Handling

All endpoints return appropriate error responses with suggestions for fixing common IMAP connection issues:

```json
{
  "success": false,
  "error": "Authentication failed",
  "details": "Error details from the IMAP server",
  "suggestion": "Please check your username and password."
}
```

## Deployment

This server can be deployed to any Node.js hosting platform such as:

- Vercel
- Render
- Heroku
- AWS Lambda
- Digital Ocean

Make sure to set the `PORT` environment variable if needed.