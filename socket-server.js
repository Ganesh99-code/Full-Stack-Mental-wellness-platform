import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Instantiate Redis for the Adapter and for direct operations
const pubClient = new Redis(process.env.REDIS_URI);
const subClient = pubClient.duplicate();
const redis = new Redis(process.env.REDIS_URI);

pubClient.on('error', (err) => console.error('Redis Pub Error:', err.message));
subClient.on('error', (err) => console.error('Redis Sub Error:', err.message));
redis.on('error', (err) => console.error('Redis Socket Error:', err.message));

let io;

export function setupSocket(server) {
  if (process.env.NODE_ENV === 'development') {
    if (!global.io) {
      global.io = new Server(server, { path: '/api/socket' });
      global.io.adapter(createAdapter(pubClient, subClient));
      setupEvents(global.io);
    }
    io = global.io;
  } else {
    if (!io) {
      io = new Server(server, { path: '/api/socket' });
      io.adapter(createAdapter(pubClient, subClient));
      setupEvents(io);
    }
  }
  return io;
}

function setupEvents(socketIo) {
    socketIo.on('connection', (socket) => {
        console.log('🟢 New client connected:', socket.id);

        socket.on('join', (userId) => {
          socket.join(userId);
          console.log(`👥 User ${userId} joined room`);
        });

        socket.on('sendMessage', (msg) => {
          socketIo.to(msg.receiverId).emit('receiveMessage', msg);
        });

        // WebRTC Signaling
        socket.on('webrtc-offer', (data) => socketIo.to(data.receiverId).emit('webrtc-offer', data));
        socket.on('webrtc-answer', (data) => socketIo.to(data.receiverId).emit('webrtc-answer', data));
        socket.on('webrtc-ice-candidate', (data) => socketIo.to(data.receiverId).emit('webrtc-ice-candidate', data));

        socket.on('disconnect', () => {
          console.log('🔌 Client disconnected:', socket.id);
        });

        // --- Peer Matching Logic with Redis ---
        socket.on('find-peer', async ({ userId, emotion }) => {
            console.log(`🔍 User ${userId} looking for a peer with emotion: ${emotion}`);
            
            const queueKey = `waitingPeers_${emotion}`;
            const lockKey = `user_searching_${userId}`;
            
            // 1. Check if user is already searching to prevent duplicate spam
            const isSearching = await redis.get(lockKey);
            if (isSearching) return;
            
            await redis.set(lockKey, 'true', 'EX', 60); // 60 sec lock
            
            // 2. Try to pop an existing peer from the queue
            let existingPeerStr = await redis.lpop(queueKey);
            let matchedPeer = existingPeerStr ? JSON.parse(existingPeerStr) : null;
            
            // If they popped themselves (e.g. they refreshed their browser and left a dead socket in the queue),
            // we discard the dead socket and try to pop the next one!
            while (matchedPeer && matchedPeer.userId === userId) {
                 console.log(`♻️ Ignored ghost socket for user ${userId}`);
                 await redis.del(`user_searching_${matchedPeer.userId}`);
                 
                 existingPeerStr = await redis.lpop(queueKey);
                 matchedPeer = existingPeerStr ? JSON.parse(existingPeerStr) : null;
            }
            
            if (matchedPeer) {
                // Match found! Clear locks
                await redis.del(lockKey);
                await redis.del(`user_searching_${matchedPeer.userId}`);
                
                console.log(`✅ Match found! ${userId} is matching with ${matchedPeer.userId}`);
                
                // Because of Redis Adapter, this will seamlessly broadcast across both servers!
                socketIo.to(matchedPeer.socketId).emit('peer-matched', { peerId: userId });
                socket.emit('peer-matched', { peerId: matchedPeer.userId });
            } else {
                console.log(`⏳ No match found yet. User ${userId} is now waiting in queue for ${emotion}.`);
                await redis.rpush(queueKey, JSON.stringify({ socketId: socket.id, userId }));
            }
        });

        socket.on('cancel-peer-search', async (userId) => {
            await redis.del(`user_searching_${userId}`);
        });
    });
}
