const express = require("express");
const AWS = require("aws-sdk");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 8080;
const APP_VERSION = process.env.APP_VERSION || "1.0.0";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const dynamo = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || "eu-north-1",
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(title, activePath, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --text-900: #171717;
      --text-700: #404040;
      --text-500: #737373;
      --text-400: #a3a3a3;
      --border: #d4d4d4;
      --surface-100: #f5f5f5;
      --surface-50: #fafafa;
      --white: #ffffff;
      --blue: #3b82f6;
      --green: #22c55e;
      --red: #ef4444;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --text-900: #fafafa;
        --text-700: #d4d4d4;
        --text-500: #a3a3a3;
        --text-400: #737373;
        --border: #404040;
        --surface-100: #171717;
        --surface-50: #0a0a0a;
        --white: #000000;
      }
    }

    body {
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      font-size: 15px;
      line-height: 1.7;
      color: var(--text-700);
      background: var(--surface-100);
    }

    nav {
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--surface-100);
      border-bottom: 0.5px solid var(--border);
    }

    nav .inner {
      max-width: 680px;
      margin: 0 auto;
      padding: 0 1.25rem;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    nav .logo {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-900);
      text-decoration: none;
    }

    nav .links {
      display: flex;
      gap: 1.5rem;
      list-style: none;
    }

    nav .links a {
      font-size: 13px;
      color: var(--text-500);
      text-decoration: none;
      transition: color 0.15s;
    }

    nav .links a:hover, nav .links a.active { color: var(--text-900); }

    main {
      max-width: 680px;
      margin: 0 auto;
      padding: 2.5rem 1.25rem 5rem;
    }

    h1 {
      font-size: 28px;
      font-weight: 500;
      line-height: 1.2;
      letter-spacing: -0.02em;
      color: var(--text-900);
      margin-bottom: 0.75rem;
    }

    h2 {
      font-size: 20px;
      font-weight: 500;
      line-height: 1.3;
      color: var(--text-900);
      margin-bottom: 1rem;
    }

    p { color: var(--text-700); }

    .eyebrow {
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-400);
      margin-bottom: 0.5rem;
    }

    .section { margin-top: 3rem; }

    .badge {
      display: inline-block;
      font-family: ui-monospace, monospace;
      font-size: 11px;
      padding: 0.15rem 0.5rem;
      border: 0.5px solid var(--border);
      border-radius: 4px;
      color: var(--text-500);
      background: var(--surface-50);
    }

    .badge.green { color: var(--green); border-color: var(--green); }
    .badge.blue { color: var(--blue); border-color: var(--blue); }

    .stat-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.75rem;
      margin-top: 1.5rem;
    }

    .stat {
      background: var(--white);
      border: 0.5px solid var(--border);
      border-radius: 6px;
      padding: 1rem 1.25rem;
    }

    .stat-label {
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-400);
      margin-bottom: 0.35rem;
    }

    .stat-value {
      font-family: ui-monospace, monospace;
      font-size: 14px;
      font-weight: 500;
      color: var(--text-900);
    }

    .card {
      background: var(--white);
      border: 0.5px solid var(--border);
      border-radius: 6px;
      padding: 1.25rem;
    }

    .card + .card { margin-top: 0.75rem; }

    .card-title {
      font-size: 15px;
      font-weight: 500;
      color: var(--text-900);
      margin-bottom: 0.25rem;
    }

    .card-desc {
      font-size: 14px;
      color: var(--text-500);
      margin-bottom: 0.5rem;
    }

    form {
      background: var(--white);
      border: 0.5px solid var(--border);
      border-radius: 6px;
      padding: 1.5rem;
      margin-top: 0;
    }

    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-700);
      margin-bottom: 0.35rem;
    }

    input, textarea {
      width: 100%;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      font-size: 14px;
      padding: 0.5rem 0.75rem;
      border: 0.5px solid var(--border);
      border-radius: 4px;
      background: var(--surface-50);
      color: var(--text-900);
      outline: none;
      margin-bottom: 1rem;
    }

    input:focus, textarea:focus { border-color: var(--blue); }

    textarea { resize: vertical; min-height: 80px; }

    button[type="submit"] {
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      font-size: 13px;
      font-weight: 500;
      padding: 0.5rem 1.25rem;
      background: var(--text-900);
      color: var(--surface-100);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    button[type="submit"]:hover { opacity: 0.8; }

    .empty {
      text-align: center;
      padding: 3rem 0;
      color: var(--text-400);
      font-size: 14px;
      border: 0.5px dashed var(--border);
      border-radius: 6px;
    }

    .alert {
      padding: 0.75rem 1rem;
      border-radius: 4px;
      font-size: 13px;
      margin-bottom: 1.5rem;
    }

    .alert.success { color: var(--green); border: 0.5px solid var(--green); background: var(--surface-50); }
    .alert.error { color: var(--red); border: 0.5px solid var(--red); background: var(--surface-50); }

    code {
      font-family: ui-monospace, monospace;
      font-size: 13px;
      padding: 0.1rem 0.35rem;
      background: var(--surface-50);
      border: 0.5px solid var(--border);
      border-radius: 3px;
      color: var(--text-700);
    }

    footer {
      border-top: 0.5px solid var(--border);
      max-width: 680px;
      margin: 0 auto;
      padding: 1.25rem 1.25rem;
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      color: var(--text-500);
    }
  </style>
</head>
<body>
  <nav>
    <div class="inner">
      <a href="/" class="logo">⚡ EB Node App</a>
      <ul class="links">
        <li><a href="/" ${activePath === "/" ? 'class="active"' : ""}>Home</a></li>
        <li><a href="/data" ${activePath === "/data" ? 'class="active"' : ""}>Data</a></li>
        <li><a href="/health" ${activePath === "/health" ? 'class="active"' : ""}>Health</a></li>
      </ul>
    </div>
  </nav>
  ${body}
  <footer>
    <span>EB Node App</span>
    <span>v${APP_VERSION}</span>
  </footer>
</body>
</html>`;
}

app.get("/", (req, res) => {
  res.send(layout("EB Node App", "/", `
    <main>
      <p class="eyebrow">AWS Elastic Beanstalk</p>
      <h1>DDeployment Dashboard</h1>
      <p>Node.js application running on AWS Elastic Beanstalk with DynamoDB integration. Deployed automatically via GitHub Actions on every push to <code>master</code>.</p>

      <div class="stat-row">
        <div class="stat">
          <div class="stat-label">Version</div>
          <div class="stat-value">${escapeHtml(APP_VERSION)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Status</div>
          <div class="stat-value" style="color: var(--green)">Running</div>
        </div>
        <div class="stat">
          <div class="stat-label">Platform</div>
          <div class="stat-value">Node.js</div>
        </div>
        <div class="stat">
          <div class="stat-label">Region</div>
          <div class="stat-value">${escapeHtml(process.env.AWS_REGION || "eu-north-1")}</div>
        </div>
      </div>

      <div class="section">
        <h2>How it works</h2>
        <div class="card">
          <div class="card-title">CI/CD Pipeline</div>
          <div class="card-desc">Every push to <code>master</code> triggers a GitHub Actions workflow that packages the app, uploads it to S3, and deploys a new versioned release to Elastic Beanstalk — automatically.</div>
        </div>
        <div class="card">
          <div class="card-title">External Service Integration</div>
          <div class="card-desc">Connected to Amazon DynamoDB table <code>${escapeHtml(process.env.DYNAMODB_TABLE_NAME || "not configured")}</code>. Connection details are managed via Elastic Beanstalk environment variables — no credentials in code.</div>
        </div>
        <div class="card">
          <div class="card-title">Managed Infrastructure</div>
          <div class="card-desc">No manual server management. Elastic Beanstalk handles EC2 provisioning, load balancing, health monitoring, and platform updates.</div>
        </div>
      </div>
    </main>
  `));
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy", version: APP_VERSION });
});

app.get("/data", async (req, res) => {
  const table = process.env.DYNAMODB_TABLE_NAME;
  let items = [];
  let error = null;

  if (table) {
    try {
      const result = await dynamo.scan({ TableName: table }).promise();
      items = result.Items || [];
    } catch (err) {
      error = err.message;
    }
  } else {
    error = "DYNAMODB_TABLE_NAME environment variable not set.";
  }

  const added = req.query.added === "1";

  const itemsHtml = items.length > 0
    ? items.map(item => `
        <div class="card">
          <div class="card-title">${escapeHtml(item.name || "Untitled")}</div>
          ${item.description ? `<div class="card-desc">${escapeHtml(item.description)}</div>` : ""}
          <span class="badge">id: ${escapeHtml(String(item.id))}</span>
        </div>
      `).join("")
    : `<div class="empty">No items yet — add one below ↓</div>`;

  res.send(layout("Data — EB Node App", "/data", `
    <main>
      <p class="eyebrow">Amazon DynamoDB</p>
      <h1>Data Explorer</h1>
      <p>Items stored in the <code>${escapeHtml(table || "—")}</code> table. Connection managed via Elastic Beanstalk environment variables.</p>

      ${added ? '<div class="alert success">✓ Item added successfully.</div>' : ""}
      ${error ? `<div class="alert error">Error: ${escapeHtml(error)}</div>` : ""}

      <div class="section">
        <h2>Items <span class="badge blue">${items.length}</span></h2>
        ${itemsHtml}
      </div>

      <div class="section">
        <h2>Add Item</h2>
        <form method="POST" action="/data">
          <label for="name">Name</label>
          <input type="text" id="name" name="name" placeholder="e.g. Demo Item Three" required>
          <label for="description">Description</label>
          <textarea id="description" name="description" placeholder="Optional description"></textarea>
          <button type="submit">Add to DynamoDB →</button>
        </form>
      </div>
    </main>
  `));
});

app.post("/data", async (req, res) => {
  const table = process.env.DYNAMODB_TABLE_NAME;
  if (!table) return res.redirect("/data");

  const { name, description } = req.body;

  try {
    await dynamo.put({
      TableName: table,
      Item: {
        id: crypto.randomUUID(),
        name: name || "Untitled",
        description: description || "",
      },
    }).promise();
    res.redirect("/data?added=1");
  } catch (err) {
    res.redirect("/data?error=" + encodeURIComponent(err.message));
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
