"use client";
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function VideoCall({ callId, user }) {
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnection = useRef(null);
    const socket = useRef(null);
    const localStream = useRef(null);
    const pendingCandidates = useRef([]);
    const router = useRouter();

    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [status, setStatus] = useState("Waiting for others to join...");

    // Configuration with STUN and placeholder TURN servers from env
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            {
                urls: process.env.NEXT_PUBLIC_TURN_URL || 'turn:placeholder.metered.ca:80',
                username: process.env.NEXT_PUBLIC_TURN_USERNAME || 'placeholder',
                credential: process.env.NEXT_PUBLIC_TURN_PASSWORD || 'placeholder'
            }
        ]
    };

    useEffect(() => {
        // Initialize Socket
        socket.current = io({ path: '/api/socket' });

        // Join the specific room for this call
        socket.current.emit('join', callId);

        // Get Local Media Stream
        async function getMedia() {
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error("Camera access requires a secure connection (HTTPS) or localhost. You are likely accessing this from an insecure HTTP connection.");
                }
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                localStream.current = stream;
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                }
                
                // Once media is obtained, notify others in the room we are ready
                socket.current.emit('sendMessage', { 
                    receiverId: callId, 
                    type: 'user-ready', 
                    senderId: user.id 
                });
            } catch (err) {
                console.error("Error accessing media devices.", err);
                setStatus("Error: " + (err.message || "Could not access camera or microphone."));
            }
        }
        getMedia();

        // Socket Listeners for Signaling
        socket.current.on('receiveMessage', async (msg) => {
            if ((msg.type === 'user-ready' || msg.type === 'user-ready-echo') && msg.senderId !== user.id) {
                // Prevent race condition: only the user with the smaller ID initiates the call
                if (user.id < msg.senderId) {
                    if (!peerConnection.current) {
                        setStatus("Peer joined. Initiating connection...");
                        initiateCall();
                    }
                } else {
                    setStatus("Peer joined. Waiting for connection...");
                    if (msg.type === 'user-ready') {
                        // Let the caller know we are here
                        socket.current.emit('sendMessage', { 
                            receiverId: callId, 
                            type: 'user-ready-echo', 
                            senderId: user.id 
                        });
                    }
                }
            }
        });

        socket.current.on('webrtc-offer', async (data) => {
            if (data.senderId === user.id) return; // Ignore our own offer
            setStatus("Receiving call...");
            await handleReceiveOffer(data.offer);
        });

        socket.current.on('webrtc-answer', async (data) => {
            if (data.senderId === user.id) return;
            setStatus("Call connected!");
            setIsConnected(true);
            await handleReceiveAnswer(data.answer);
        });

        socket.current.on('webrtc-ice-candidate', async (data) => {
            if (data.senderId === user.id) return;
            const pc = peerConnection.current;
            if (pc) {
                const candidate = new RTCIceCandidate(data.candidate);
                if (pc.remoteDescription) {
                    try {
                        await pc.addIceCandidate(candidate);
                    } catch (e) {
                        console.error("Error adding received ice candidate", e);
                    }
                } else {
                    pendingCandidates.current.push(candidate);
                }
            }
        });

        return () => {
            if (localStream.current) {
                localStream.current.getTracks().forEach(track => track.stop());
            }
            if (peerConnection.current) {
                peerConnection.current.close();
            }
            if (socket.current) {
                socket.current.disconnect();
            }
        };
    }, [callId, user]);

    // Setup WebRTC Peer Connection
    const createPeerConnection = () => {
        const pc = new RTCPeerConnection(rtcConfig);

        // Add local tracks to connection
        if (localStream.current) {
            localStream.current.getTracks().forEach(track => {
                pc.addTrack(track, localStream.current);
            });
        }

        // Handle incoming ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.current.emit('webrtc-ice-candidate', {
                    receiverId: callId,
                    senderId: user.id,
                    candidate: event.candidate
                });
            }
        };

        // Handle incoming remote stream
        pc.ontrack = (event) => {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
                setIsConnected(true);
                setStatus("Call connected!");
            }
        };

        return pc;
    };

    // Caller creates offer
    const initiateCall = async () => {
        peerConnection.current = createPeerConnection();
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);

        socket.current.emit('webrtc-offer', {
            receiverId: callId,
            senderId: user.id,
            offer: offer
        });
    };

    // Receiver handles offer and creates answer
    const handleReceiveOffer = async (offer) => {
        peerConnection.current = createPeerConnection();
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
        
        // Add any pending candidates
        pendingCandidates.current.forEach(async (c) => {
            try { await peerConnection.current.addIceCandidate(c); } catch(e){}
        });
        pendingCandidates.current = [];

        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);

        socket.current.emit('webrtc-answer', {
            receiverId: callId,
            senderId: user.id,
            answer: answer
        });
    };

    // Caller handles incoming answer
    const handleReceiveAnswer = async (answer) => {
        if (peerConnection.current) {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
            
            // Add any pending candidates
            pendingCandidates.current.forEach(async (c) => {
                try { await peerConnection.current.addIceCandidate(c); } catch(e){}
            });
            pendingCandidates.current = [];
        }
    };

    // UI Controls
    const toggleMute = () => {
        if (localStream.current) {
            localStream.current.getAudioTracks()[0].enabled = isMuted;
            setIsMuted(!isMuted);
        }
    };

    const toggleVideo = () => {
        if (localStream.current) {
            localStream.current.getVideoTracks()[0].enabled = isVideoOff;
            setIsVideoOff(!isVideoOff);
        }
    };

    const leaveCall = () => {
        router.push('/myCalls');
    };

    return (
        <div className="flex flex-col items-center w-full max-w-5xl mx-auto p-4">
            <div className="mb-4 text-gray-600 font-medium bg-gray-200 px-4 py-2 rounded-full">
                Status: {status}
            </div>

            {/* Side-by-Side Video Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mb-8">
                {/* Local Video */}
                <div className="relative bg-gray-900 rounded-2xl overflow-hidden aspect-video shadow-lg">
                    <video 
                        ref={localVideoRef} 
                        autoPlay 
                        playsInline 
                        muted // Always mute local video to prevent echo
                        className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : 'block'}`}
                    />
                    {isVideoOff && (
                        <div className="absolute inset-0 flex items-center justify-center text-white">
                            Camera Off
                        </div>
                    )}
                    <div className="absolute bottom-4 left-4 bg-black/50 text-white px-3 py-1 rounded-md text-sm">
                        You
                    </div>
                </div>

                {/* Remote Video */}
                <div className="relative bg-gray-800 rounded-2xl overflow-hidden aspect-video shadow-lg flex items-center justify-center">
                    {!isConnected ? (
                        <div className="text-gray-400">Waiting for peer...</div>
                    ) : (
                        <video 
                            ref={remoteVideoRef} 
                            autoPlay 
                            playsInline 
                            className="w-full h-full object-cover"
                        />
                    )}
                </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-6 bg-gray-100 p-4 rounded-full shadow-sm border border-gray-300">
                <button 
                    onClick={toggleMute}
                    className={`p-4 rounded-full transition-colors ${isMuted ? 'bg-red-500 text-white' : 'bg-white text-gray-700 shadow-md hover:bg-gray-50'}`}
                    title={isMuted ? "Unmute" : "Mute"}
                >
                    {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                </button>

                <button 
                    onClick={toggleVideo}
                    className={`p-4 rounded-full transition-colors ${isVideoOff ? 'bg-red-500 text-white' : 'bg-white text-gray-700 shadow-md hover:bg-gray-50'}`}
                    title={isVideoOff ? "Turn on camera" : "Turn off camera"}
                >
                    {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
                </button>

                <button 
                    onClick={leaveCall}
                    className="bg-red-600 hover:bg-red-700 text-white p-4 rounded-full shadow-md transition-colors flex items-center gap-2"
                    title="Leave Call"
                >
                    <PhoneOff size={24} />
                    <span className="hidden sm:inline font-semibold">Leave Call</span>
                </button>
            </div>
        </div>
    );
}
