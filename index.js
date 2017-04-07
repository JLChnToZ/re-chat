'use strict';
const http = require('http');
const express = require('express');
const socketIO = require('socket.io');

const app = express();
const server = http.Server(app);
const io = socketIO(server);

app.use(express.static('static'));

const connections = new Map();

io.on('connection', socket => {
  const whiteList = new Set(), blackList = new Set();
  let currentName;
  socket.on('rename', name => {
    name = name.trim();
    const oldName = currentName;
    if(oldName !== undefined) {
      if(connections.get(oldName) !== socket) {
        socket.emit('rename-failed', oldName);
        return;
      }
      connections.delete(oldName);
    }
    if(!name.length || name.charAt(0) === '-') {
      socket.emit('rename-failed', oldName);
      return;
    }
    connections.set(currentName = name, socket);
    for(const others of connections.values())
      others.emit('user-updated', { oldName, newName: currentName });
    if(!oldName) socket.emit('online', Array.from(connections.keys()));
  });
  socket.on('sendmsg', (data) => {
    const { to, message } = data;
    to.split(/\s*,\s*/g).forEach(target => {
      if(target.charAt(0) === '-')
        blackList.add(target.substr(1));
      else if(target.length)
        whiteList.add(target);
    });
    if(whiteList.size && !blackList.size)
      whiteList.add(currentName);
    const msg = {
      from: currentName,
      message,
      time: Date.now() / 1000,
      group: (blackList.size || !whiteList.size) ? [] :
        Array.from(whiteList.values()).sort()
    };
    connections.forEach((others, name) => {
      if(name === currentName || (whiteList.size && !whiteList.has(name)) || blackList.has(name)) return;
      others.emit('msgarrive', msg);
    });
    socket.emit('msgsent', msg);
    whiteList.clear();
    blackList.clear();
  });
  socket.on('disconnect', () => {
    if(currentName) {
      connections.delete(currentName);
      for(const others of connections.values())
        others.emit('user-updated', { oldName: currentName });
    }
  });
});

server.listen(8999, () => {
  console.log('listening on *:8999');
});
