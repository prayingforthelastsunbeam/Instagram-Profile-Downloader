const express = require('express');
const path = require('path');
const { scrapeInstagram } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store active scraping sessions
const sessions = {};

// Start scraping job
app.post('/api/scrape', (req, res) => {
  const { url, cookies } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Instagram profile URL is required' });
  }

  const sessionId = Date.now().toString();
  sessions[sessionId] = {
    logs: [],
    status: 'starting',
    result: null,
    clients: []
  };

  // Start scraper in background
  scrapeInstagram(url, cookies, (message) => {
    // onProgress callback
    const logEntry = { time: Date.now(), text: message };
    sessions[sessionId].logs.push(logEntry);
    
    // Broadcast to connected SSE clients
    sessions[sessionId].clients.forEach(client => {
      client.write(`data: ${JSON.stringify(logEntry)}\n\n`);
    });
  }).then(result => {
    sessions[sessionId].status = 'completed';
    sessions[sessionId].result = result;
    const finalLog = { time: Date.now(), text: 'COMPLETE', result };
    sessions[sessionId].clients.forEach(client => {
      client.write(`data: ${JSON.stringify(finalLog)}\n\n`);
    });
  }).catch(err => {
    sessions[sessionId].status = 'error';
    const errorLog = { time: Date.now(), text: `❌ ERROR: ${err.message}` };
    sessions[sessionId].clients.forEach(client => {
      client.write(`data: ${JSON.stringify(errorLog)}\n\n`);
    });
  });

  res.json({ sessionId });
});

// SSE endpoint for streaming progress
app.get('/api/progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send historical logs first
  session.logs.forEach(log => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  });

  if (session.status === 'completed' || session.status === 'error') {
    if (session.status === 'completed') {
      res.write(`data: ${JSON.stringify({ time: Date.now(), text: 'COMPLETE', result: session.result })}\n\n`);
    }
    return res.end();
  }

  // Register client
  session.clients.push(res);

  // Remove client on close
  req.on('close', () => {
    session.clients = session.clients.filter(client => client !== res);
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
