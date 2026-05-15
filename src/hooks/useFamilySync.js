import { useEffect, useState, useRef } from 'react';
import { Peer } from 'peerjs';

export const useFamilySync = (roomId, userId) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [connected, setConnected] = useState(false);
  
  const peerRef = useRef(null);
  const connectionsRef = useRef({}); 
  const callsRef = useRef({});

  useEffect(() => {
    if (!roomId) return;

    const initPeer = async () => {
      // Get media stream first
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
      } catch (err) {
        console.error('Failed to get local stream', err);
      }

      // Try to find an available slot in the room (1-5)
      let foundPeer = false;
      for (let i = 1; i <= 5; i++) {
        const potentialId = `${roomId}-slot-${i}`;
        const peer = new Peer(potentialId);
        
        const success = await new Promise((resolve) => {
          peer.on('open', () => resolve(true));
          peer.on('error', (err) => {
            if (err.type === 'unavailable-id') resolve(false);
            else resolve(true); // Other errors we just accept
          });
          setTimeout(() => resolve(false), 3000);
        });

        if (success) {
          peerRef.current = peer;
          setupPeerListeners(peer, stream, i);
          foundPeer = true;
          break;
        } else {
          peer.destroy();
        }
      }

      if (!foundPeer) alert('A szoba megtelt!');
    };

    const setupPeerListeners = (peer, stream, mySlot) => {
      setConnected(true);

      // Handle incoming calls
      peer.on('call', (call) => {
        call.answer(stream);
        call.on('stream', (remoteStream) => {
          addRemoteStream(call.peer, remoteStream);
        });
      });

      // Handle incoming data connections
      peer.on('connection', (conn) => {
        setupDataConnection(conn);
      });

      // Periodically try to connect to other slots
      const interval = setInterval(() => {
        for (let i = 1; i <= 5; i++) {
          if (i === mySlot) continue;
          const otherId = `${roomId}-slot-${i}`;
          
          // Connect for Data
          if (!connectionsRef.current[otherId]) {
            const conn = peer.connect(otherId);
            conn.on('open', () => setupDataConnection(conn));
          }

          // Connect for Video
          if (!callsRef.current[otherId] && stream) {
            const call = peer.call(otherId, stream);
            call.on('stream', (remoteStream) => {
              addRemoteStream(otherId, remoteStream);
              callsRef.current[otherId] = call;
            });
          }
        }
      }, 3000);

      peer.on('close', () => clearInterval(interval));
    };

    initPeer();

    return () => {
      peerRef.current?.destroy();
      localStream?.getTracks().forEach(t => t.stop());
    };
  }, [roomId]);

  const addRemoteStream = (peerId, stream) => {
    setRemoteStreams(prev => {
      if (prev.find(s => s.id === peerId)) return prev;
      return [...prev, { id: peerId, stream }];
    });
  };

  const setupDataConnection = (conn) => {
    connectionsRef.current[conn.peer] = conn;
    conn.on('data', (data) => {
      if (data.type === 'chat') {
        setMessages(prev => [...prev, { ...data, timestamp: Date.now() }]);
      } else if (data.type === 'reaction') {
        setReactions(prev => [...prev, { ...data, id: Math.random(), timestamp: Date.now() }]);
      }
    });
  };

  const sendMessage = (text) => {
    const msg = { type: 'chat', sender: userId, text };
    Object.values(connectionsRef.current).forEach(conn => conn.send(msg));
    setMessages(prev => [...prev, { ...msg, timestamp: Date.now() }]);
  };

  const sendReaction = (emoji) => {
    const reaction = { type: 'reaction', emoji, sender: userId };
    Object.values(connectionsRef.current).forEach(conn => conn.send(reaction));
    setReactions(prev => [...prev, { ...reaction, id: Math.random(), timestamp: Date.now() }]);
  };

  return {
    localStream,
    remoteStreams,
    messages,
    reactions,
    connected,
    sendMessage,
    sendReaction
  };
};
