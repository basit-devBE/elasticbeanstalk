# DynamoDB Integration

## Why DynamoDB

Amazon DynamoDB was chosen as the external data service for this project because:

- **No VPC configuration required** — unlike RDS, DynamoDB is accessed over the public AWS endpoint. No subnet, security group, or VPC peering setup is needed.
- **No connection pooling** — DynamoDB uses HTTP-based API calls, not persistent TCP connections. This fits well with a single-instance EB environment.
- **Serverless pricing** — on-demand capacity means no minimum charges for a demo/lab workload.
- **SDK simplicity** — the AWS SDK v2 DynamoDB DocumentClient handles marshalling/unmarshalling of JavaScript types automatically.

---

## Table Design

| Property | Value |
|----------|-------|
| Table name | `eb-demo-stuff` |
| Partition key | `id` (String) |
| Capacity mode | On-demand |
| Region | `eu-north-1` |

### Item schema

There is no enforced schema in DynamoDB beyond the partition key. Items in this table use the following attributes by convention:

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | String | Yes (partition key) | UUID generated at write time |
| `name` | String | No | Display name of the item |
| `description` | String | No | Optional longer description |

---

## Connection

The DynamoDB client is initialised once at application startup:

```javascript
const AWS = require("aws-sdk");

const dynamo = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || "eu-north-1",
});
```

**No credentials are passed here.** The AWS SDK automatically discovers credentials using the credential provider chain:

1. Environment variables (`AWS_ACCESS_KEY_ID` etc.) — not set in production
2. **EC2 Instance Metadata Service (IMDS)** — the SDK calls the instance metadata endpoint to retrieve a temporary token for the IAM instance role

On Elastic Beanstalk, option 2 applies. The EC2 instance has the `aws-elasticbeanstalk-ec2-role` attached as its instance profile, and that role has `AmazonDynamoDBFullAccess`. The SDK fetches short-lived credentials automatically and refreshes them before they expire.

---

## Read Operation — Scan

The `/data` GET route reads all items from the table:

```javascript
const result = await dynamo.scan({ TableName: table }).promise();
items = result.Items || [];
```

`scan` returns every item in the table. For a demo table with a small number of items this is appropriate. In a production system with large tables, a `query` with a known key or a paginated `scan` would be used instead.

---

## Write Operation — Put

The `/data` POST route writes a new item:

```javascript
await dynamo.put({
  TableName: table,
  Item: {
    id: crypto.randomUUID(),
    name: name || "Untitled",
    description: description || "",
  },
}).promise();
```

`crypto.randomUUID()` is a built-in Node.js function (available since Node 14.17) that generates a v4 UUID. This ensures every item gets a unique partition key without needing an auto-increment counter.

`put` overwrites any existing item with the same `id`. Since UUIDs are statistically unique, collisions are not a concern in practice.

---

## Configuration via Environment Variables

The table name is never hardcoded. It is read from the `DYNAMODB_TABLE_NAME` environment variable at request time:

```javascript
const table = process.env.DYNAMODB_TABLE_NAME;
```

This variable is set in **Elastic Beanstalk → Configuration → Environment properties**. Changing the table (e.g. pointing to a production table vs a staging table) requires only an EB configuration change — no code change, no redeployment.

If the variable is not set, the `/data` route shows an informative error banner rather than crashing.

---

## IAM Permissions for the EC2 Role

For the application to call DynamoDB, the EC2 instance profile (`aws-elasticbeanstalk-ec2-role`) must have the following permissions at minimum:

| Action | Required for |
|--------|-------------|
| `dynamodb:Scan` | `GET /data` — listing all items |
| `dynamodb:PutItem` | `POST /data` — adding a new item |

In this project, the AWS managed policy `AmazonDynamoDBFullAccess` is attached to the role. For a production deployment, a custom policy scoped to the specific table ARN would be more appropriate:

```json
{
  "Effect": "Allow",
  "Action": ["dynamodb:Scan", "dynamodb:PutItem"],
  "Resource": "arn:aws:dynamodb:eu-north-1:<account-id>:table/eb-demo-stuff"
}
```

---

## Demonstrating the Integration

During the live review, the DynamoDB integration can be demonstrated as follows:

1. Navigate to `http://<env>.elasticbeanstalk.com/data`
2. The existing seed items appear — proving the read connection works
3. Fill in the "Add Item" form with a name and description
4. Submit — the page reloads with a success banner and the new item appears
5. Go to the **DynamoDB console → eb-demo-stuff → Explore items** — the new item is visible there too, confirming the write went through
