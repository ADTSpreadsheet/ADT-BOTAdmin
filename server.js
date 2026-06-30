require("dotenv").config();

const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("ADT BOTAdmin is running 🚀");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`ADT BOTAdmin running on port ${PORT}`);
});
