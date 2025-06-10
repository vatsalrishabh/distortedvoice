import { Server } from "socket.io";

let io;
const users = new Map(); // username -> socket.id

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req, res) {
  if (!res.socket.server.io) {
    console.log("Initializing Socket.io...");
    io = new Server(res.socket.server, {
      path: "/api/socket",
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
        const targetId = users.get(to);
        if (targetId) io.to(targetId).emit("offer", { from: socket.username, offer });
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
        if (socket.username) users.delete(socket.username);
        io.emit("users", [...users.keys()]);
      });
    });
  } else {
    console.log("Socket.io already initialized.");
  }
  res.end();
}