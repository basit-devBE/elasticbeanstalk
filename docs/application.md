# Application

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Node.js 24 | Latest LTS, supported by EB platform |
| Framework | Express 5 | Minimal, well-known web framework |
| AWS SDK | aws-sdk v2 | DynamoDB client for reads and writes |
| Entry point | `app.js` | Single file, started via `npm start` |

---

## File Structure

```
elasticbeanstalk/
├── app.js                        # Application entry point
├── package.json                  # Dependencies and start script
├── package-lock.json             # Locked dependency tree
├── .gitignore                    # Excludes node_modules, .env, *.zip
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Actions CI/CD workflow
└── docs/                         # This documentation
```

---

## `package.json`

```json
{
  "name": "eb-node-app",
  "version": "1.0.0",
  "main": "app.js",
  "scripts": {
    "start": "node app.js"
  },
  "dependencies": {
    "aws-sdk": "^2.1692.0",
    "express": "^5.2.1"
  }
}
```

Elastic Beanstalk's Node.js platform automatically runs `npm install` when it receives a new deployment bundle, then starts the app using the `start` script.

---

## Endpoints

### `GET /`
Returns the deployment dashboard as an HTML page.

**What it shows:**
- App version (injected per-deployment via `APP_VERSION` environment variable)
- Runtime status, platform, AWS region
- Explanation of the CI/CD pipeline and DynamoDB integration

**No database call is made on this route** — it reads only from environment variables, making it fast and always available even if DynamoDB is unreachable.

---

### `GET /data`
Returns an HTML page listing all items in the DynamoDB table, plus a form to add new items.

**Flow:**
1. Reads `DYNAMODB_TABLE_NAME` from environment
2. Calls `dynamo.scan({ TableName: table })` to fetch all items
3. Renders each item as a card with name, description, and ID badge
4. Renders an add-item form below

**Error handling:** If the table name isn't set or the SDK call fails, an error banner is shown inline — the page still loads.

---

### `POST /data`
Handles form submission from `/data` to add a new item.

**Flow:**
1. Reads `name` and `description` from form body
2. Generates a new UUID with `crypto.randomUUID()` as the partition key
3. Calls `dynamo.put({ TableName, Item })` to write to DynamoDB
4. Redirects to `/data?added=1` on success (shows a success banner)

---

### `GET /health`
Returns a JSON health check response. This route is used by Elastic Beanstalk's health monitoring to determine if the application is running correctly.

```json
{ "status": "healthy", "version": "d77afc5a-3-9" }
```

EB periodically hits this endpoint. If it returns a non-200 status, EB marks the instance as unhealthy and can trigger an alert or replacement.

---

## Environment Variables

All runtime configuration is passed in through Elastic Beanstalk environment properties — nothing is hardcoded.

| Variable | Used by | Description |
|----------|---------|-------------|
| `PORT` | Express | Port to listen on (EB sets this automatically to 8080) |
| `APP_VERSION` | All routes | Current deployed version label, set by the CI/CD workflow on each deploy |
| `AWS_REGION` | DynamoDB client | AWS region where the DynamoDB table lives |
| `DYNAMODB_TABLE_NAME` | `/data` route | Name of the DynamoDB table to read/write |

---

## Versioning

The `APP_VERSION` variable is set by the GitHub Actions workflow on every deployment:

```yaml
--option-settings \
  "Namespace=aws:elasticbeanstalk:application:environment,OptionName=APP_VERSION,Value=${VERSION}"
```

Where `VERSION` is `<short-sha>-<run-number>-<run-attempt>`, e.g. `d77afc5a-3-9`.

This means:
- Every deployment visibly changes the version shown on the dashboard and in the health endpoint
- The version is traceable back to a specific git commit and Actions run
- Rolling back to a previous EB application version also rolls back the displayed version

---

## UI Design

The frontend uses the **De-Great design system** — a text-first, monochromatic design language translated from vanilla CSS:

- **Font:** System UI stack (`ui-sans-serif, system-ui, -apple-system, sans-serif`) — no web fonts loaded
- **Max width:** 680px centered content column
- **Colors:** Neutral gray ramp only (`#171717` → `#fafafa`), semantic accents (green, blue, red) for status only
- **Borders:** `0.5px` throughout — no shadows, no gradients
- **Dark mode:** `@media (prefers-color-scheme: dark)` — automatic, no JavaScript toggle
- **Typography:** h1 28px/500 weight, body 15px/400, muted labels 11px uppercase

All HTML is generated server-side as template strings — no frontend framework, no build step required.
