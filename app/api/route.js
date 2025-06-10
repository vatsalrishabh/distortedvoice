import { Server } from "socket.io";

let io;
const users = new Map(); // username -> socket.id
const calls = new Map(); // username -> targetUsername

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req, res) {
  if (!res.socket.server.io) {
    console.log("Initializing Socket.io...");
    io = new Server(res.socket.server, {
      path: "/api", // <-- update this line to match frontend
      addTrailingSlash: false,
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    res.socket.server.io = io;

    io.on("connection", (socket) => {
      console.log("New client connected:", socket.id);

      socket.on("register", (username) => {
        if ([...users.values()].includes(socket.id)) return;
        if ([...users.keys()].includes(username)) {
          socket.emit("username-error", "Username already taken");
        } else {
          users.set(username, socket.id);
          socket.username = username;
          io.emit("users", [...users.keys()]);
        }
      });

      socket.on("offer", ({ to, offer }) => {
        // Prevent users from being in multiple calls
        if (calls.has(socket.username) || calls.has(to)) {
          socket.emit("call-error", "One of the users is already in a call.");
          return;
        }
        const targetId = users.get(to);
        if (targetId) {
          calls.set(socket.username, to);
          calls.set(to, socket.username);
          io.to(targetId).emit("offer", { from: socket.username, offer });
        }
      });

      socket.on("answer", ({ to, answer }) => {
        const targetId = users.get(to);
        if (targetId) io.to(targetId).emit("answer", { answer });
      });

      socket.on("ice-candidate", ({ to, candidate }) => {
        const targetId = users.get(to);
        if (targetId) io.to(targetId).emit("ice-candidate", { candidate });
      });

      socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
        if (socket.username) {
          // Remove from users
          users.delete(socket.username);
          // End any active call
          const peer = calls.get(socket.username);
          if (peer) {
            calls.delete(peer);
            const peerId = users.get(peer);
            if (peerId) {
              io.to(peerId).emit("call-ended");
            }
          }
          calls.delete(socket.username);
        }
        io.emit("users", [...users.keys()]);
      });

      // Optional: handle manual call end (if you add this on frontend)
      socket.on("end-call", ({ to }) => {
        calls.delete(socket.username);
        calls.delete(to);
        const targetId = users.get(to);
        if (targetId) {
          io.to(targetId).emit("call-ended");
        }
      });
    });
  } else {
    console.log("Socket.io already initialized.");
  }
  res.end();
}