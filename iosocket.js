var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http, {
  cors: {
    origin: "*", // Allow all origins
    methods: ["GET", "POST"]
  }
});

// var clicks = 0; // This declaration is moved down and is the single source of truth

app.set('port', (process.env.PORT || 5000));

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

var clicks = 0; // Central declaration of clicks

io.on('connection', function (socket) {
    console.log(`[Server] Client connected: ${socket.id}. Emitting initial clicks: ${clicks}`);
    socket.emit('user clicks', clicks); // Emit only to the connecting socket
    socket.on('user clicks', function () {
        clicks++;
        console.log(`[Server] Client ${socket.id} clicked. Clicks now: ${clicks}. Broadcasting.`);
        io.emit('user clicks', clicks); // Broadcast subsequent updates to all
    });
    socket.on('disconnect', function() {
        console.log(`[Server] Client disconnected: ${socket.id}`);
    });
});

// const server = http.listen(app.get('port'), function () { // Don't auto-start
//     console.log('listening on *:', app.get('port'));
// });

function startServer(port) {
  return http.listen(port, function () {
    console.log('listening on *:', port);
  });
}

// var clicks = 0; // Ensure clicks is initialized here // This was duplicated

function resetClicks() { // Function to reset clicks for testing
  clicks = 0;
}

// Export http directly so tests can manage its lifecycle
module.exports = { app, io, server: http, startServer, resetClicks, getClicks: () => clicks };
