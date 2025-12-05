const express = require("express");
const app = express();

app.get("/health", (req, res) => {
  res.json({ ok: true, message: "Minimal app is working ✅" });
});

app.listen(3000, () => {
  console.log("Test server running on port 3000");
});
