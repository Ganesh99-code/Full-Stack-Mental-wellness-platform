"use client";
import { useContext, useState, useEffect, useRef } from "react";
import { UserContext } from "../../context/UserContext";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import problemCategories from "../../data/groups";

export default function PeerMatchPage() {
    const { user } = useContext(UserContext);
    const router = useRouter();
    
    const [selectedEmotion, setSelectedEmotion] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const socket = useRef(null);

    useEffect(() => {
        // Initialize socket once on mount
        socket.current = io({ path: '/api/socket' });

        socket.current.on('peer-matched', async ({ peerId }) => {
            // We use the latest user ID from the component state, but since this closure might be stale,
            // we should ideally use a ref, or just assume the user context is stable.
            
            try {
                // We'll hit the API to add the contact
                // Since this closure might have a stale `user`, we should fetch user from context or localstorage if needed,
                // but usually `user` is stable. To be safe, we just send it if it exists.
                // The user object stores the ID in the `.id` field!
                const currentUserId = user?.id || JSON.parse(localStorage.getItem('user'))?.id;
                
                if (currentUserId) {
                    await fetch('/api/myChats', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ senderId: currentUserId, receiverId: peerId })
                    });
                }
            } catch (err) {
                console.error("Failed to add contact", err);
            }

            // Redirect to chat
            router.push(`/myChats?peerId=${peerId}`);
        });

        return () => {
            // Cleanup on unmount only
            socket.current.disconnect();
        };
        // We only want to run this ONCE when the component mounts, so we use an empty dependency array.
        // This prevents the WebSocket from disconnecting when `isSearching` changes!
    }, [router]);

    const handleSearch = (emotionSlug) => {
        if (!user?.id) return;
        setSelectedEmotion(emotionSlug);
        setIsSearching(true);
        socket.current.emit('find-peer', { userId: user.id, emotion: emotionSlug });
    };

    const handleCancel = () => {
        if (!user?.id) return;
        setIsSearching(false);
        setSelectedEmotion(null);
        socket.current.emit('cancel-peer-search', user.id);
    };

    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-cream">
                <p className="text-xl text-gray-700">Please log in to find a peer.</p>
            </div>
        );
    }

    if (isSearching) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-cream">
                <div className="relative flex justify-center items-center">
                    <div className="absolute animate-ping h-32 w-32 rounded-full bg-teal-400 opacity-75"></div>
                    <div className="relative bg-teal-500 rounded-full h-24 w-24 flex items-center justify-center shadow-lg text-white font-bold text-xl">
                        Wait
                    </div>
                </div>
                <h2 className="mt-8 text-2xl font-semibold text-gray-800">Looking for a peer...</h2>
                <p className="mt-2 text-gray-600">Finding someone who is also dealing with {problemCategories.find(p => p.slug === selectedEmotion)?.title}</p>
                <button 
                    onClick={handleCancel}
                    className="mt-8 px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors shadow-md font-medium"
                >
                    Cancel Search
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen pt-24 pb-12 bg-cream px-4">
            <div className="max-w-5xl mx-auto">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-gray-900 mb-4">Find a Peer</h1>
                    <p className="text-lg text-gray-600">Connect instantly and anonymously with someone experiencing similar emotions.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {problemCategories.map((prob) => (
                        <div 
                            key={prob.slug}
                            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-gray-100 flex flex-col items-center text-center group"
                            onClick={() => handleSearch(prob.slug)}
                        >
                            <div className="w-16 h-16 rounded-full overflow-hidden mb-4 ring-4 ring-teal-50 group-hover:ring-teal-100 transition-all">
                                <img src={prob.image} alt={prob.title} className="w-full h-full object-cover" />
                            </div>
                            <h3 className="font-semibold text-gray-800 mb-2">{prob.title}</h3>
                            <button className="mt-auto bg-teal-50 text-teal-700 px-4 py-2 rounded-full text-sm font-medium group-hover:bg-teal-100 transition-colors w-full">
                                Find Match
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
