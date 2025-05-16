const mediasoup = require("mediasoup");

let worker;
let rooms = new Map(); // Map to store room-specific routers and their associated transports/producers/consumers

const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
  },
];

async function startMediasoup() {
  worker = await mediasoup.createWorker();
  return { worker };
}

async function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    console.log(`[Mediasoup] Creating new room: ${roomId}`);
    const router = await worker.createRouter({ mediaCodecs });
    rooms.set(roomId, {
      router,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map()
    });
  }
  return rooms.get(roomId);
}

function getRouterRtpCapabilities(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  return room.router.rtpCapabilities;
}

async function createWebRtcTransport(roomId) {
  const room = await getOrCreateRoom(roomId);
  const transport = await room.router.createWebRtcTransport({
    listenIps: [{ ip: "127.0.0.1", announcedIp: null }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  room.transports.set(transport.id, transport);
  console.log(`[Mediasoup] Created transport ${transport.id} for room ${roomId}`);

  return {
    transport,
    params: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    },
  };
}

function getRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    console.log(`[Mediasoup] Room not found: ${roomId}`);
  }
  return room;
}

async function closeRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    console.log(`[Mediasoup] Room not found for closure: ${roomId}`);
    return;
  }

  console.log(`[Mediasoup] Closing room: ${roomId}`);

  // Close all consumers
  for (const consumer of room.consumers.values()) {
    try {
      await consumer.close();
    } catch (err) {
      console.error(`[Mediasoup] Error closing consumer: ${err}`);
    }
  }
  room.consumers.clear();

  // Close all producers
  for (const producer of room.producers.values()) {
    try {
      await producer.close();
    } catch (err) {
      console.error(`[Mediasoup] Error closing producer: ${err}`);
    }
  }
  room.producers.clear();

  // Close all transports
  for (const transport of room.transports.values()) {
    try {
      await transport.close();
    } catch (err) {
      console.error(`[Mediasoup] Error closing transport: ${err}`);
    }
  }
  room.transports.clear();

  // Close the router
  try {
    await room.router.close();
  } catch (err) {
    console.error(`[Mediasoup] Error closing router: ${err}`);
  }

  // Remove the room
  rooms.delete(roomId);
  console.log(`[Mediasoup] Room closed: ${roomId}`);
}

module.exports = {
  startMediasoup,
  getRouterRtpCapabilities,
  worker: () => worker,
  getRoom,
  getOrCreateRoom,
  createWebRtcTransport,
  closeRoom,
};
