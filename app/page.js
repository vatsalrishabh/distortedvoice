"use client";

import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import * as Tone from "tone";

const socket = io(undefined, { path: "/api" });

export default function Home() {
  const localAudioRef = useRef();
  const remoteAudioRef = useRef();
  const pcRef = useRef(null);
  const [username, setUsername] = useState("");
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [targetUser, setTargetUser] = useState("");
  const [isCalling, setIsCalling] = useState(false);

  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected to socket server");
    });

    socket.on("users", (users) => {
      setConnectedUsers(users.filter((u) => u !== username));
    });

    socket.on("username-error", (msg) => {
      alert(msg);
      setUsername("");
    });

    socket.on("offer", async ({ from, offer }) => {
      setTargetUser(from);
      if (!pcRef.current) createPeerConnection(from);
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      socket.emit("answer", { to: from, answer });
    });

    socket.on("answer", async ({ answer }) => {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      try {
        await pcRef.current.addIceCandidate(candidate);
      } catch (e) {
        console.error("Error adding ICE candidate", e);
      }
    });
  }, [username]);

  const createPeerConnection = (to) => {
    pcRef.current = new RTCPeerConnection();

    pcRef.current.ontrack = (event) => {
      remoteAudioRef.current.srcObject = event.streams[0];
    };

    pcRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { to, candidate: event.candidate });
      }
    };
  };

  const handleRegister = () => {
    if (username) {
      socket.emit("register", username);
    }
  };

  const callUser = async (user) => {
    setTargetUser(user);
    createPeerConnection(user);
    setIsCalling(true);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioCtx = Tone.getContext().rawContext;
    const source = audioCtx.createMediaStreamSource(stream);

    // Pitch shifting using Tone.js
    const pitchShift = new Tone.PitchShift(5).toDestination(); // 5 semitones up
    const dest = audioCtx.createMediaStreamDestination();

    // Connect source to pitch shifter and then to destination
    source.connect(pitchShift._input);
    pitchShift._output.connect(dest);

    dest.stream.getTracks().forEach((track) => {
      pcRef.current.addTrack(track, dest.stream);
    });

    localAudioRef.current.srcObject = stream;

    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);
    socket.emit("offer", { to: user, offer });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      <h1 className="text-2xl font-bold">Voice Changer Call</h1>

      {!username ? (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter unique name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="px-3 py-2 border rounded"
          />
          <button
            onClick={handleRegister}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Join
          </button>
        </div>
      ) : (
        <div className="w-full max-w-md">
          <h2 className="text-lg font-semibold mb-2">Available Users</h2>
          <ul className="space-y-2">
            {connectedUsers.map((user) => (
              <li key={user} className="flex justify-between items-center border-b pb-1">
                <span>{user}</span>
                <button
                  onClick={() => callUser(user)}
                  disabled={isCalling}
                  className="bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50"
                >
                  Call
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-10 mt-6">
        <div>
          <h2 className="text-lg font-medium mb-2">Local Audio</h2>
          <audio ref={localAudioRef} autoPlay controls className="w-64" />
        </div>

        <div>
          <h2 className="text-lg font-medium mb-2">Remote Audio</h2>
          <audio ref={remoteAudioRef} autoPlay controls className="w-64" />
        </div>
      </div>
    </div>
  );
}