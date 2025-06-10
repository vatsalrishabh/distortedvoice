"use client";

import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import * as Tone from "tone";

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
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      <h1 className="text-2xl font-bold mb-4">Voice Changer Call</h1>

      {/* Username registration */}
      {!registered ? (
        <form onSubmit={handleRegister} className="flex gap-2">
          <input
            type="text"
            placeholder="Enter unique name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="px-3 py-2 border rounded"
            minLength={3}
            required
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded"
            disabled={username.length < 3}
          >
            Submit
          </button>
        </form>
      ) : (
        <>
          {/* User list */}
          <div className="w-full max-w-md">
            <h2 className="text-lg font-semibold mb-2">Users Online</h2>
            <ul className="space-y-2">
              {connectedUsers.length === 0 && (
                <li className="text-gray-500">No users available</li>
              )}
              {connectedUsers.map((user) => (
                <li key={user} className="flex justify-between items-center border-b pb-1">
                  <span>{user}</span>
                  <button
                    onClick={() => callUser(user)}
                    disabled={isCalling || inCall}
                    className="bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50"
                    title="Call"
                  >
                    📞
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Incoming call modal */}
          {incomingCall && (
            <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
              <div className="bg-white p-6 rounded shadow-lg flex flex-col items-center">
                <p className="mb-4 font-semibold">
                  Incoming call from <span className="text-blue-600">{incomingCall.from}</span>
                </p>
                <div className="flex gap-4">
                  <button
                    onClick={acceptCall}
                    className="bg-green-600 text-white px-4 py-2 rounded"
                  >
                    Accept
                  </button>
                  <button
                    onClick={declineCall}
                    className="bg-red-600 text-white px-4 py-2 rounded"
                  >
                    Decline
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Call controls */}
          {inCall && (
            <div className="flex flex-col items-center gap-2 mt-4">
              <span className="font-medium text-green-700">
                In call with {targetUser}
              </span>
              <button
                onClick={toggleMute}
                className={`px-4 py-2 rounded ${isMuted ? "bg-yellow-500" : "bg-gray-600"} text-white`}
              >
                {isMuted ? "Unmute" : "Mute"}
              </button>
              <button
                onClick={endCall}
                className="bg-red-600 text-white px-4 py-2 rounded"
              >
                End Call
              </button>
            </div>
          )}

          {/* Audio panels */}
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
        </>
      )}
    </div>
  );
}