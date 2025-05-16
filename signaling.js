const {
  getRouterRtpCapabilities,
  createWebRtcTransport,
  getRoom,
  getOrCreateRoom,
  closeRoom
} = require("./mediasoup");

// Keep track of all connected clients for each room
const roomClients = new Map();

module.exports = function registerSignalingHandlers(ws) {
  ws.on("message", async (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      console.error("[Signaling] Failed to parse message:", e);
      return;
    }

    const roomId = data.roomId;
    if (!roomId) {
      console.error("[Signaling] No roomId provided");
      ws.send(JSON.stringify({
        type: "error",
        error: "No room ID provided"
      }));
      return;
    }

    // Add client to room
    if (!roomClients.has(roomId)) {
      roomClients.set(roomId, new Set());
    }
    roomClients.get(roomId).add(ws);

    switch (data.type) {
      case "get-rtp-capabilities": {
        // Create room if it doesn't exist
        const room = await getOrCreateRoom(roomId);
        const rtpCapabilities = room.router.rtpCapabilities;
        ws.send(
          JSON.stringify({
            type: "rtp-capabilities",
            rtpCapabilities,
          })
        );
        break;
      }

      case "create-transport": {
        const { transport, params } = await createWebRtcTransport(roomId);
        ws.send(
          JSON.stringify({
            type: "transport-created",
            params,
          })
        );
        break;
      }

      case "connect-transport": {
        const room = getRoom(roomId);
        if (!room) {
          ws.send(JSON.stringify({
            type: "error",
            error: "Room not found"
          }));
          return;
        }
        const transport = room.transports.get(data.transportId);
        if (!transport) {
          ws.send(JSON.stringify({
            type: "error",
            error: "Transport not found"
          }));
          return;
        }
        await transport.connect({ dtlsParameters: data.dtlsParameters });
        break;
      }

      case "produce": {
        const room = getRoom(roomId);
        if (!room) {
          ws.send(JSON.stringify({
            type: "error",
            error: "Room not found"
          }));
          return;
        }
        const transport = room.transports.get(data.transportId);
        if (!transport) {
          ws.send(JSON.stringify({
            type: "error",
            error: "Transport not found"
          }));
          return;
        }
        const producer = await transport.produce({
          kind: data.kind,
          rtpParameters: data.rtpParameters,
        });
        room.producers.set(producer.id, producer);
        ws.send(
          JSON.stringify({
            type: "produced",
            id: producer.id,
          })
        );
        break;
      }

      case "consume": {
        const room = getRoom(roomId);
        if (!room) {
          ws.send(JSON.stringify({
            type: "error",
            error: "Room not found"
          }));
          return;
        }
        const transport = room.transports.get(data.transportId);
        if (!transport) {
          ws.send(JSON.stringify({
            type: "error",
            error: "Transport not found"
          }));
          return;
        }

        for (const producer of room.producers.values()) {
          if (
            !room.router.canConsume({
              producerId: producer.id,
              rtpCapabilities: data.rtpCapabilities,
            })
          ) {
            console.warn(`[Signaling] Cannot consume producer ${producer.id}`);
            continue;
          }

          const consumer = await transport.consume({
            producerId: producer.id,
            rtpCapabilities: data.rtpCapabilities,
            paused: false,
          });

          room.consumers.set(consumer.id, consumer);

          ws.send(
            JSON.stringify({
              type: "consumer-created",
              id: consumer.id,
              producerId: producer.id,
              kind: consumer.kind,
              rtpParameters: consumer.rtpParameters,
            })
          );
        }
        break;
      }

      case "close-room": {
        // Notify all viewers in the room
        const clients = roomClients.get(roomId);
        if (clients) {
          for (const client of clients) {
            if (client !== ws) { // Don't send to the streamer
              client.send(JSON.stringify({
                type: "stream-stopped"
              }));
            }
          }
        }
        
        // Close the room
        await closeRoom(roomId);
        roomClients.delete(roomId);
        break;
      }

      default:
        console.warn("[Signaling] Unknown message type:", data.type);
    }
  });

  // Handle client disconnection
  ws.on("close", () => {
    // Remove client from all rooms
    for (const [roomId, clients] of roomClients.entries()) {
      clients.delete(ws);
      if (clients.size === 0) {
        roomClients.delete(roomId);
      }
    }
  });
};
