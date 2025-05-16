const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const { startMediasoup } = require("./mediasoup");
const registerSignalingHandlers = require("./signaling");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

startMediasoup().then(() => {
  wss.on("connection", registerSignalingHandlers);
  server.listen(3000, () => console.log("Server ready: http://localhost:3000"));
});
