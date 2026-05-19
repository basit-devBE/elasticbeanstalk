const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;
const APP_VERSION = "1.0.0";

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
