const express = require("express");
const AWS = require("aws-sdk");

const app = express();
const PORT = process.env.PORT || 8080;
const APP_VERSION = process.env.APP_VERSION || "1.0.0";

const dynamo = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || "us-east-1",
});

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    version: APP_VERSION,
    message: "Hello from Elastic Beanstalk!",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy", version: APP_VERSION });
});

app.get("/data", async (req, res) => {
  const table = process.env.DYNAMODB_TABLE_NAME;
  if (!table) {
    return res.status(500).json({ error: "DYNAMODB_TABLE_NAME not configured" });
  }
  try {
    const result = await dynamo.scan({ TableName: table }).promise();
    res.json({ items: result.Items, count: result.Count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
