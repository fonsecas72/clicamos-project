const request = require('supertest');
const { app, io: ioInstance, server: httpServerInstance, startServer, resetClicks, getClicks } = require('./iosocket');
const Client = require('socket.io-client');
const fs = require('fs');
const path = require('path');

describe('Application Tests', () => {
  let runningServer;
  // clientSocket will be defined per describe block for Socket tests to ensure fresh instances
  let serverAddress;
  const testPort = process.env.PORT || 5003;

  beforeAll((done) => {
    runningServer = startServer(testPort);
    runningServer.on('listening', () => {
      const addr = runningServer.address();
      serverAddress = `http://localhost:${addr.port}`;
      console.log(`Test server listening on ${serverAddress}`);
      done();
    });
    runningServer.on('error', (err) => {
      console.error("Test server failed to start:", err);
      done(err);
    });
  });

  afterAll((done) => {
    ioInstance.close(() => {
      console.log('Socket.IO server closed.');
      runningServer.close(() => {
        console.log('HTTP Test server closed.');
        done();
      });
    });
  });

  beforeEach(() => { // Reset clicks before each test, not just socket tests
    resetClicks();
  });

  // HTTP Server Functionality Tests
  describe('HTTP Server', () => {
    it('should start the server and respond to /', async () => {
      const response = await request(runningServer).get('/');
      expect(response.status).toBe(200);
    });

    it('should serve index.html at the root path', async () => {
      const response = await request(runningServer).get('/');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/html/);
      const indexHTMLContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      expect(response.text).toEqual(indexHTMLContent);
    });
  });

  // Socket.IO Connection Tests
  describe('Socket.IO Connection', () => {
    let clientSocket; // Specific to this describe block

    // beforeEach no longer connects, just instantiates if needed, or tests do it.
    // For these tests, each 'it' block will manage its own connection for clarity.

    afterEach(() => {
      if (clientSocket && clientSocket.connected) {
        clientSocket.disconnect();
      }
    });

    it('should allow a client to connect', (done) => {
      clientSocket = Client(serverAddress, { forceNew: true, transports: ['websocket'], reconnection: false });
      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
      clientSocket.on('connect_error', (err) => done(err));
    });

    it('should emit initial "user clicks" count of 0 upon connection', (done) => {
      clientSocket = Client(serverAddress, { forceNew: true, transports: ['websocket'], reconnection: false });
      // Setup listener *before* connect event fires for the client itself
      clientSocket.on('user clicks', (initialClicks) => {
        expect(initialClicks).toBe(0);
        done();
      });
      clientSocket.on('connect', () => {
        // Connection is established, server should have emitted 'user clicks'
        // The listener above should catch it.
      });
      clientSocket.on('connect_error', (err) => done(err));
    });
  });

  // Socket.IO Event Handling Tests
  describe('Socket.IO Event Handling ("user clicks")', () => {
    let client1Socket, client2Socket;

    beforeEach((done) => {
      client1Socket = Client(serverAddress, { forceNew: true, transports: ['websocket'], reconnection: false });
      client2Socket = Client(serverAddress, { forceNew: true, transports: ['websocket'], reconnection: false });

      let client1Ready = false;
      let client2Ready = false;

      const checkReady = () => {
        if (client1Ready && client2Ready) {
          console.log('[Test Log] beforeEach (event handling): Both clients connected and received initial click.');
          done();
        }
      };

      client1Socket.once('connect', () => {
        console.log('[Test Log] beforeEach (event handling): Client1 connected.');
        client1Socket.once('user clicks', (initialC1) => {
          console.log('[Test Log] beforeEach (event handling): Client1 received initial clicks:', initialC1);
          expect(initialC1).toBe(0);
          client1Ready = true;
          checkReady();
        });
      });

      client2Socket.once('connect', () => {
        console.log('[Test Log] beforeEach (event handling): Client2 connected.');
        client2Socket.once('user clicks', (initialC2) => {
          console.log('[Test Log] beforeEach (event handling): Client2 received initial clicks:', initialC2);
          expect(initialC2).toBe(0);
          client2Ready = true;
          checkReady();
        });
      });

      client1Socket.on('connect_error', (err) => done(err));
      client2Socket.on('connect_error', (err) => done(err));
    });

    afterEach(() => {
      if (client1Socket && client1Socket.connected) client1Socket.disconnect();
      if (client2Socket && client2Socket.connected) client2Socket.disconnect();
    });

    it('should increment clicks to 1 and broadcast to all clients', (done) => {
      // By the time this test runs, beforeEach has ensured both clients are connected
      // and have received their initial '0'. Clicks on server is 0.
      const expectedClicksAfterEvent = 1;
      console.log('[Test Log] Starting: increment clicks to 1');

      const p1Event = new Promise(resolve => {
        client1Socket.once('user clicks', (data) => {
          console.log('[Test Log] Client1 received click event:', data);
          resolve(data);
        });
      });
      const p2Event = new Promise(resolve => {
        client2Socket.once('user clicks', (data) => {
          console.log('[Test Log] Client2 received click event:', data);
          resolve(data);
        });
      });

      console.log('[Test Log] Client1 emitting "user clicks" for increment test');
      client1Socket.emit('user clicks');

      Promise.all([p1Event, p2Event]).then(([eventC1, eventC2]) => {
        console.log('[Test Log] Both clients received click event data for increment test. C1:', eventC1, 'C2:', eventC2);
        expect(eventC1).toBe(expectedClicksAfterEvent);
        expect(eventC2).toBe(expectedClicksAfterEvent);
        console.log('[Test Log] Final expectations passed for increment test. Calling done().');
        done();
      }).catch(err => {
        console.error('[Test Log] Error in promise chain for increment test:', err);
        done(err);
      });
    });

    it('should handle 3 clicks correctly and broadcast final count of 3', (done) => {
      // beforeEach ensures both clients are connected and have received initial '0'.
      // Server clicks count is 0.
      const clicksToMake = 3;
      const expectedFinalClicks = clicksToMake; // After 3 clicks, count should be 3
      console.log('[Test Log] Starting: handle 3 clicks');

      let client1EventsReceived = 0; // This counts events *after* the initial '0'

      client1Socket.on('user clicks', (newClicks) => {
        client1EventsReceived++;
        console.log(`[Test Log] Client1 (3 clicks test) received update ${client1EventsReceived}:`, newClicks);
        expect(newClicks).toBe(client1EventsReceived);
        if (client1EventsReceived < clicksToMake) {
          console.log(`[Test Log] Client1 (3 clicks test) emitting click ${client1EventsReceived + 1}`);
          client1Socket.emit('user clicks');
        }
      });

      const p2FinalEvent = new Promise(resolve => {
        let client2EmissionsAfterInitial = 0;
        client2Socket.on('user clicks', (newClicks) => {
          // The first event client2's .on listener gets here will be for click 1
          client2EmissionsAfterInitial++;
          console.log(`[Test Log] Client2 (3 clicks test) received update ${client2EmissionsAfterInitial}:`, newClicks);

          if (newClicks === expectedFinalClicks && client2EmissionsAfterInitial >= clicksToMake) {
            console.log('[Test Log] Client2 (3 clicks test) received final expected click count.');
            resolve(newClicks);
          } else {
            expect(newClicks).toBe(client2EmissionsAfterInitial); // Check intermediate events are correct
            expect(newClicks).toBeLessThanOrEqual(expectedFinalClicks);
          }
        });
      });

      console.log('[Test Log] Client1 (3 clicks test) emitting first click');
      // The initial '0' was handled in beforeEach. This is the first *actual* click.
      client1Socket.emit('user clicks');

      p2FinalEvent.then((finalClicksC2) => {
        console.log('[Test Log] Client2 (3 clicks test) promise resolved with:', finalClicksC2);
        expect(finalClicksC2).toBe(expectedFinalClicks);
        expect(client1EventsReceived).toBe(clicksToMake);
        console.log('[Test Log] Final expectations passed (3 clicks test). Calling done().');
        done();
      }).catch(err => {
        console.error('[Test Log] Error in promise chain (3 clicks test):', err);
        done(err);
      });
    });
  });
});
