"use client";

import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import * as Tone from "tone";
import { FaPhone, FaPhoneSlash, FaMicrophone, FaMicrophoneSlash, FaUserCircle } from "react-icons/fa";
import { MdCallEnd } from "react-icons/md";

const socket = io("https://distortedvoice-express.onrender.com");

export default function Home() {
  const localAudioRef = useRef();
  const remoteAudioRef = useRef();
  const pcRef = useRef(null);

  const [username, setUsername] = useState("");
  const [registered, setRegistered] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [inCall, setInCall] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null); // { from, offer }
  const [targetUser, setTargetUser] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [localStream, setLocalStream] = useState(null);

  // Register and user list logic
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
        await pcRef.current.addIceCandidate(candidate);
      } catch (e) {
        console.error("Error adding ICE candidate", e);
      }
    });

    socket.on("call-ended", () => {
      setInCall(false);
      setIsCalling(false);
      setIncomingCall(null);
      setTargetUser("");
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (localAudioRef.current) localAudioRef.current.srcObject = null;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
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

  // Peer connection setup
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

  // Register handler
  const handleRegister = (e) => {
    e.preventDefault();
    if (username.length >= 3) {
      socket.emit("register", username);
      setRegistered(true);
    }
  };

  // Call user
  const callUser = async (user) => {
    if (inCall || isCalling) return;
    setTargetUser(user);
    setIsCalling(true);
    setInCall(true);
    createPeerConnection(user);

    await Tone.start(); // Ensure Tone.js is started

    const source = new Tone.UserMedia();
    await source.open(); // This will ask for mic permission

    // Different effect for each user
    const effect = username < user
      ? new Tone.PitchShift(5).toDestination()
      : new Tone.PitchShift(-5).toDestination();

    source.connect(effect);

    // Get the processed stream for WebRTC
    const dest = Tone.context.createMediaStreamDestination();
    effect.connect(dest);

    dest.stream.getTracks().forEach((track) => {
      pcRef.current.addTrack(track, dest.stream);
    });

    localAudioRef.current.srcObject = source._stream;
    setLocalStream(dest.stream);

    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);
    socket.emit("offer", { to: user, offer });
  };

  // Accept incoming call
  const acceptCall = async () => {
    setInCall(true);
    setTargetUser(incomingCall.from);
    createPeerConnection(incomingCall.from);

    await pcRef.current.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
    const answer = await pcRef.current.createAnswer();
    await pcRef.current.setLocalDescription(answer);

    await Tone.start(); // Ensure Tone.js is started

    const source = new Tone.UserMedia();
    await source.open(); // This will ask for mic permission

    // Different effect for each user
    const effect = username < incomingCall.from
      ? new Tone.PitchShift(5).toDestination()
      : new Tone.PitchShift(-5).toDestination();

    source.connect(effect);

    // Get the processed stream for WebRTC
    const dest = Tone.context.createMediaStreamDestination();
    effect.connect(dest);

    dest.stream.getTracks().forEach((track) => {
      pcRef.current.addTrack(track, dest.stream);
    });

    localAudioRef.current.srcObject = source._stream;
    setLocalStream(dest.stream);

    socket.emit("answer", { to: incomingCall.from, answer });
    setIncomingCall(null);
  };

  // Decline call
  const declineCall = () => {
    setIncomingCall(null);
  };

  // End call
  const endCall = () => {
    socket.emit("end-call", { to: targetUser });
    setInCall(false);
    setIsCalling(false);
    setTargetUser("");
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localAudioRef.current) localAudioRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  };

  // Mute/unmute handler
  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-blue-900 transition-all duration-500">
      <div className="bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl p-8 w-full max-w-2xl mt-8 border border-white/20 animate-fade-in">
        <h1 className="text-3xl font-extrabold text-white text-center mb-8 tracking-tight drop-shadow-lg">
          <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Distorted Voice Call
          </span>
        </h1>

        {/* Username registration */}
        {!registered ? (
          <form onSubmit={handleRegister} className="flex flex-col items-center gap-4 animate-fade-in">
            <input
              type="text"
              placeholder="Enter unique name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="px-5 py-3 rounded-xl border-none shadow-md focus:ring-2 focus:ring-blue-400 focus:outline-none text-lg w-72 bg-white/70 placeholder-gray-500 transition-all duration-200"
              minLength={3}
              required
            />
            <button
              type="submit"
              className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-purple-500 hover:to-blue-500 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:scale-105 transition-all duration-200"
              disabled={username.length < 3}
            >
              <FaUserCircle className="text-xl" />
              Join
            </button>
          </form>
        ) : (
          <>
            {/* User list */}
            <div className="w-full max-w-md mx-auto mb-8 animate-fade-in">
              <h2 className="text-lg font-semibold mb-3 text-white/90">Users Online</h2>
              <ul className="space-y-2">
                {connectedUsers.length === 0 && (
                  <li className="text-gray-300">No users available</li>
                )}
                {connectedUsers.map((user) => (
                  <li
                    key={user}
                    className="flex justify-between items-center bg-white/10 rounded-xl px-4 py-2 shadow hover:bg-gradient-to-r hover:from-blue-400/30 hover:to-purple-400/30 transition-all duration-200"
                  >
                    <span className="flex items-center gap-2 text-white font-medium">
                      <FaUserCircle className="text-blue-300" /> {user}
                    </span>
                    <button
                      onClick={() => callUser(user)}
                      disabled={isCalling || inCall}
                      className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-blue-500 hover:from-blue-500 hover:to-green-500 text-white px-4 py-2 rounded-full shadow-lg hover:scale-110 transition-all duration-200 disabled:opacity-50"
                      title="Call"
                    >
                      <FaPhone className="text-lg" />
                      Call
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Incoming call modal */}
            {incomingCall && (
              <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 animate-fade-in-fast">
                <div className="bg-white/90 p-8 rounded-2xl shadow-2xl flex flex-col items-center border-2 border-blue-400 animate-pop-in">
                  <p className="mb-4 font-semibold text-lg text-blue-900">
                    Incoming call from <span className="text-purple-700">{incomingCall.from}</span>
                  </p>
                  <div className="flex gap-6">
                    <button
                      onClick={acceptCall}
                      className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-full font-bold shadow-lg hover:scale-110 transition-all duration-150"
                    >
                      <FaPhone className="text-xl" /> Accept
                    </button>
                    <button
                      onClick={declineCall}
                      className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-full font-bold shadow-lg hover:scale-110 transition-all duration-150"
                    >
                      <FaPhoneSlash className="text-xl" /> Decline
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Call controls */}
            {inCall && (
              <div className="flex flex-col items-center gap-4 mt-4 animate-fade-in">
                <span className="font-medium text-green-200 text-lg tracking-wide drop-shadow">
                  In call with <span className="text-blue-200">{targetUser}</span>
                </span>
                <div className="flex gap-4">
                  <button
                    onClick={toggleMute}
                    className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold shadow-lg transition-all duration-150 ${
                      isMuted
                        ? "bg-yellow-400 hover:bg-yellow-500 text-gray-900"
                        : "bg-gray-700 hover:bg-gray-900 text-white"
                    }`}
                  >
                    {isMuted ? <FaMicrophoneSlash className="text-xl" /> : <FaMicrophone className="text-xl" />}
                    {isMuted ? "Unmute" : "Mute"}
                  </button>
                  <button
                    onClick={endCall}
                    className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-pink-500 hover:from-pink-500 hover:to-red-500 text-white px-6 py-2 rounded-full font-bold shadow-lg hover:scale-110 transition-all duration-150"
                  >
                    <MdCallEnd className="text-xl" />
                    End Call
                  </button>
                </div>
              </div>
            )}

            {/* Audio panels */}
            <div className="flex flex-col md:flex-row gap-10 mt-8 justify-center items-center animate-fade-in">
              <div className="bg-white/10 rounded-xl p-4 shadow-lg flex flex-col items-center border border-white/20">
                <h2 className="text-lg font-medium mb-2 text-white/80">Your Voice</h2>
                <audio ref={localAudioRef} autoPlay controls className="w-64 rounded-lg shadow" />
              </div>
              <div className="bg-white/10 rounded-xl p-4 shadow-lg flex flex-col items-center border border-white/20">
                <h2 className="text-lg font-medium mb-2 text-white/80">Their Voice</h2>
                <audio ref={remoteAudioRef} autoPlay controls className="w-64 rounded-lg shadow" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Animations */}
      <style jsx global>{`
        .animate-fade-in {
          animation: fadeIn 1s;
        }
        .animate-fade-in-fast {
          animation: fadeIn 0.3s;
        }
        .animate-pop-in {
          animation: popIn 0.4s cubic-bezier(.68,-0.55,.27,1.55);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(30px);}
          to { opacity: 1; transform: translateY(0);}
        }
        @keyframes popIn {
          0% { opacity: 0; transform: scale(0.7);}
          100% { opacity: 1; transform: scale(1);}
        }
      `}</style>
    </div>
  );
}