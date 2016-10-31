var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var clicks = 0;

app.set('port', (process.env.PORT || 5000));

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', function (socket) {
    socket.on('user clicks', function () {
        clicks++;
        io.emit('user clicks', clicks);
    });
});

http.listen(app.get('port'), function () {
    console.log('listening on *:', app.get('port'));
});
