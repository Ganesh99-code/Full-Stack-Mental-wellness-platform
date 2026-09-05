"use client";
import { useContext, useState, useEffect, useCallback, Suspense } from 'react';
import { UserContext } from '../../context/UserContext';
import ChatBox from '../../components/ChatBox';
import io from 'socket.io-client';
import { useSearchParams } from 'next/navigation';

function MyChatsContent() {
    const { user } = useContext(UserContext);
    const searchParams = useSearchParams();
    const peerId = searchParams.get('peerId');

    const [contacts, setContacts] = useState([]);
    const [selectedPerson, setSelectedPerson] = useState(null);
    const [contactsLoading, setContactsLoading] = useState(true);
    
    // Fetch contacts
    const fetchContacts = useCallback(async () => {
        if (!user?.id) return;
        setContactsLoading(true);
        try {
            const res = await fetch(`/api/myChats?userId=${user.id}`);
            const data = await res.json();
            if (data.success) {
                setContacts(data.contacts);
                // Auto-select if peerId is provided
                if (peerId) {
                    const peerContact = data.contacts.find(c => c._id === peerId);
                    if (peerContact) setSelectedPerson(peerContact);
                }
            }
        } catch (error) {
            console.error("Failed to fetch contacts", error);
        }
        setContactsLoading(false);
    }, [user?.id]);

    useEffect(() => {
        fetchContacts();
    }, [fetchContacts]);

    // Listen for new messages to update the contacts list in real-time
    useEffect(() => {
        if (!user?.id) return;

        const socket = io({ path: '/api/socket' });
        socket.emit('join', user.id);

        socket.on('receiveMessage', (newMsg) => {
            if (newMsg.receiverId === user.id) {
                // A new message arrived, refresh the contacts list so the new person appears
                fetchContacts();
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [user?.id, fetchContacts]);

    return (
        <div className="min-h-screen flex pt-20 bg-gray-50">
            {/* Contacts Sidebar - 30% */}
            <div className="w-[30%] border-r border-gray-300 p-6 bg-white shadow-sm">
                <h2 className="text-xl font-semibold mb-6 text-gray-800">My Chats</h2>
                {contactsLoading ? (
                    <p className="text-gray-500 text-sm">Loading contacts...</p>
                ) : contacts.length === 0 ? (
                    <p className="text-gray-500 text-sm">No chats yet. Start a conversation!</p>
                ) : (
                    <ul className="space-y-3">
                        {contacts.map((c) => (
                            <li
                                key={c._id}
                                onClick={() => setSelectedPerson(c)}
                                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                                    selectedPerson?._id === c._id ? 'bg-blue-100 border border-blue-300' : 'bg-gray-50 hover:bg-gray-100'
                                }`}
                            >
                                <img
                                    src={c.image || '/images/default.jpg'}
                                    alt={c.name}
                                    className="w-12 h-12 rounded-full object-cover shadow-sm"
                                />
                                <span className="text-base font-medium text-gray-700">{c.name}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Chat Box Area - 70% */}
            <div className="w-[70%] p-6 flex flex-col items-center justify-center bg-gray-50">
                {selectedPerson ? (
                    <ChatBox person={selectedPerson} onClose={() => setSelectedPerson(null)} />
                ) : (
                    <div className="text-center">
                        <img src="/images/mainPage.png" alt="Select chat" className="w-64 opacity-50 mx-auto mb-4" />
                        <p className="text-gray-500 text-lg">Select a conversation from the left to start chatting.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function MyChatsPage() {
    return (
        <Suspense fallback={<div className="min-h-screen pt-20 bg-gray-50 flex justify-center items-center">Loading chats...</div>}>
            <MyChatsContent />
        </Suspense>
    );
}
