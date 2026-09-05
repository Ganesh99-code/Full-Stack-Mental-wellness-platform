import http from 'http';
import httpProxy from 'http-proxy';

const targets = [
  { host: 'localhost', port: 3002 },
  { host: 'localhost', port: 3003 }
];

// Create a proxy object with WebSocket support
const proxy = httpProxy.createProxyServer({
    ws: true,
    xfwd: true // adds x-forwarded-for headers
});

proxy.on('error', (err, req, res) => {
    console.error('🔥 Proxy Error:', err.message);
    if (res && res.writeHead) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway: One of the backend servers is down or not responding.');
    }
});

// Simple IP hashing function for sticky sessions
// This ensures that the same user always hits the same server so their WebSockets don't drop
function hashIp(ip) {
    let hash = 0;
    if (ip) {
        for (let i = 0; i < ip.length; i++) {
            hash = (hash << 5) - hash + ip.charCodeAt(i);
            hash |= 0; // Convert to 32bit integer
        }
    }
    return Math.abs(hash);
}

const server = http.createServer((req, res) => {
    // Get client IP
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    
    // Determine which server to route to
    const targetIndex = hashIp(ip) % targets.length;
    const target = `http://${targets[targetIndex].host}:${targets[targetIndex].port}`;
    
    // console.log(`[HTTP] Routing ${ip} to ${target}`);
    proxy.web(req, res, { target });
});

// Handle WebSocket upgrades (Socket.io)
server.on('upgrade', (req, socket, head) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const targetIndex = hashIp(ip) % targets.length;
    const target = `http://${targets[targetIndex].host}:${targets[targetIndex].port}`;
    
    // console.log(`[WS] Routing ${ip} to ${target}`);
    proxy.ws(req, socket, head, { target });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('\n=============================================');
    console.log(`🚀 Load Balancer is running on http://localhost:${PORT}`);
    console.log(`⚖️  Routing traffic to backend servers: 3002 and 3003`);
    console.log('=============================================\n');
});
