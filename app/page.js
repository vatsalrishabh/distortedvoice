"use client";

import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import * as Tone from "tone";
import { FaPhone, FaPhoneSlash, FaUserCircle } from "react-icons/fa";
import { MdCallEnd } from "react-icons/md";

const socket = io("https://distortedvoice-express.onrender.com");

export default function Home() {
  const remoteAudioRef = useRef();
  const pcRef = useRef(null);

  const [username, setUsername] = useState("");
  const [registered, setRegistered] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [inCall, setInCall] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [targetUser, setTargetUser] = useState("");

  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected to socket server");
    });

    socket.on("users", (users) => {
      setConnectedUsers(users.filter((u) => u !== username));
    });

    socket.on("username-error", (msg) => {
      alert(msg);
      setRegistered(false);
      setUsername("");
    });

    socket.on("offer", ({ from, offer }) => {
      setIncomingCall({ from, offer });
    });

    socket.on("answer", async ({ answer }) => {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      try {
        if (pcRef.current) {
          await pcRef.current.addIceCandidate(candidate);
        }
      } catch (e) {
        console.error("Error adding ICE candidate", e);
      }
    });

    socket.on("call-ended", () => {
      endCallCleanup();
    });

    return () => {
      socket.off("users");
      socket.off("username-error");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("call-ended");
    };
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

  const handleRegister = (e) => {
    e.preventDefault();
    if (username.length >= 3) {
      socket.emit("register", username);
      setRegistered(true);
    }
  };

  const callUser = async (user) => {
    if (inCall || isCalling) return;
    setTargetUser(user);
    setIsCalling(true);
    setInCall(true);
    createPeerConnection(user);

    await Tone.start();
    const source = new Tone.UserMedia();
    await source.open();

    const pitchValue = username < user ? 5 : -5;
    const effect = new Tone.PitchShift(pitchValue); // ❌ Do NOT connect to destination

    source.connect(effect);
    const dest = Tone.context.createMediaStreamDestination();
    effect.connect(dest);

    dest.stream.getTracks().forEach((track) => {
      pcRef.current.addTrack(track, dest.stream);
    });

    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);
    socket.emit("offer", { to: user, offer });
  };

  const acceptCall = async () => {
    setInCall(true);
    setTargetUser(incomingCall.from);
    createPeerConnection(incomingCall.from);

    await pcRef.current.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
    const answer = await pcRef.current.createAnswer();
    await pcRef.current.setLocalDescription(answer);

    await Tone.start();
    const source = new Tone.UserMedia();
    await source.open();

    const pitchValue = username < incomingCall.from ? 5 : -5;
    const effect = new Tone.PitchShift(pitchValue); // ❌ No .toDestination()

    source.connect(effect);
    const dest = Tone.context.createMediaStreamDestination();
    effect.connect(dest);

    dest.stream.getTracks().forEach((track) => {
      pcRef.current.addTrack(track, dest.stream);
    });

    socket.emit("answer", { to: incomingCall.from, answer });
    setIncomingCall(null);
  };

  const declineCall = () => setIncomingCall(null);

  const endCallCleanup = () => {
    setInCall(false);
    setIsCalling(false);
    setIncomingCall(null);
    setTargetUser("");
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  };

  const endCall = () => {
    socket.emit("end-call", { to: targetUser });
    endCallCleanup();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-blue-900">
      <div className="bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl p-8 w-full max-w-2xl mt-8 border border-white/20">
        <h1 className="text-3xl font-extrabold text-white text-center mb-8 tracking-tight drop-shadow-lg">
          <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Distorted Voice Call
          </span>
        </h1>

        {!registered ? (
          <form onSubmit={handleRegister} className="flex flex-col items-center gap-4">
            <input
              type="text"
              placeholder="Enter unique name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="px-5 py-3 rounded-xl border-none shadow-md text-lg w-72 bg-white/70 placeholder-gray-500"
              minLength={3}
              required
            />
            <button
              type="submit"
              className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white px-6 py-3 rounded-xl font-semibold shadow-lg"
            >
              <FaUserCircle className="text-xl" /> Join
            </button>
          </form>
        ) : (
          <>
            <div className="w-full max-w-md mx-auto mb-8">
              <h2 className="text-lg font-semibold mb-3 text-white/90">Users Online</h2>
              <ul className="space-y-2">
                {connectedUsers.length === 0 && (
                  <li className="text-gray-300">No users available</li>
                )}
                {connectedUsers.map((user) => (
                  <li key={user} className="flex justify-between items-center bg-white/10 rounded-xl px-4 py-2">
                    <span className="flex items-center gap-2 text-white font-medium">
                      <FaUserCircle className="text-blue-300" /> {user}
                    </span>
                    <button
                      onClick={() => callUser(user)}
                      disabled={isCalling || inCall}
                      className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-blue-500 text-white px-4 py-2 rounded-full shadow-lg"
                    >
                      <FaPhone className="text-lg" />
                      Call
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {incomingCall && (
              <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50">
                <div className="bg-white/90 p-8 rounded-2xl shadow-2xl flex flex-col items-center border-2 border-blue-400">
                  <p className="mb-4 font-semibold text-lg text-blue-900">
                    Incoming call from <span className="text-purple-700">{incomingCall.from}</span>
                  </p>
                  <div className="flex gap-6">
                    <button
                      onClick={acceptCall}
                      className="flex items-center gap-2 bg-green-500 text-white px-6 py-2 rounded-full font-bold"
                    >
                      <FaPhone className="text-xl" /> Accept
                    </button>
                    <button
                      onClick={declineCall}
                      className="flex items-center gap-2 bg-red-500 text-white px-6 py-2 rounded-full font-bold"
                    >
                      <FaPhoneSlash className="text-xl" /> Decline
                    </button>
                  </div>
                </div>
              </div>
            )}

            {inCall && (
              <div className="flex flex-col items-center gap-4 mt-4">
                <span className="font-medium text-green-200 text-lg">
                  In call with <span className="text-blue-200">{targetUser}</span>
                </span>
                <button
                  onClick={endCall}
                  className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-pink-500 text-white px-6 py-2 rounded-full font-bold shadow-lg"
                >
                  <MdCallEnd className="text-xl" />
                  End Call
                </button>
              </div>
            )}

            {/* Remote audio playback only */}
            <div className="flex justify-center mt-8">
              <div className="bg-white/10 rounded-xl p-4 shadow-lg flex flex-col items-center border border-white/20">
                <h2 className="text-lg font-medium mb-2 text-white/80">Their Voice</h2>
                <audio ref={remoteAudioRef} autoPlay playsInline controls className="w-64 rounded-lg shadow" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
