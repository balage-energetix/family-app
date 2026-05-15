import { useEffect, useState, useRef } from 'react';
import { Peer } from 'peerjs';

export const useFamilySync = (roomId, userId) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [connected, setConnected] = useState(false);
  const [activeSlot, setActiveSlot] = useState(null);
  
  const peerRef = useRef(null);
  const connectionsRef = useRef({}); 
  const callsRef = useRef({});

  useEffect(() => {
    if (!roomId) return;

    const initPeer = async () => {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 1280, height: 720 }, 
          audio: { echoCancellation: true, noiseSuppression: true } 
        });
        setLocalStream(stream);
      } catch (err) {
        console.error('Media Access Denied', err);
      }

      // Try 10 slots for better discovery
      for (let i = 1; i <= 10; i++) {
        const potentialId = `${roomId}-v2-slot-${i}`;
        const peer = new Peer(potentialId);
        
        const success = await new Promise((resolve) => {
          peer.on('open', () => resolve(true));
          peer.on('error', (err) => {
            if (err.type === 'unavailable-id') resolve(false);
            else resolve(true);
          });
          setTimeout(() => resolve(false), 4000);
        });

        if (success) {
          peerRef.current = peer;
          setActiveSlot(i);
          setupPeerListeners(peer, stream, i);
          break;
        } else {
          peer.destroy();
        }
      }
    };

    const setupPeerListeners = (peer, stream, mySlot) => {
      setConnected(true);

      peer.on('call', (call) => {
        if (callsRef.current[call.peer]) return; // Avoid duplicate calls
        call.answer(stream);
        call.on('stream', (remoteStream) => {
          addRemoteStream(call.peer, remoteStream);
          callsRef.current[call.peer] = call;
        });
      });

      peer.on('connection', (conn) => {
        setupDataConnection(conn);
      });

      // Aggressive discovery: try every 2 seconds
      const interval = setInterval(() => {
        for (let i = 1; i <= 10; i++) {
          if (i === mySlot) continue;
          const otherId = `${roomId}-v2-slot-${i}`;
          
          if (!connectionsRef.current[otherId]) {
            const conn = peer.connect(otherId, { reliable: true });
            conn.on('open', () => setupDataConnection(conn));
          }

          if (!callsRef.current[otherId] && stream) {
            const call = peer.call(otherId, stream);
            call.on('stream', (remoteStream) => {
              addRemoteStream(otherId, remoteStream);
              callsRef.current[otherId] = call;
            });
            call.on('error', () => {
              delete callsRef.current[otherId];
            });
          }
        }
      }, 2000);

      peer.on('close', () => clearInterval(interval));
      peer.on('disconnected', () => peer.reconnect());
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
    if (connectionsRef.current[conn.peer]) return;
    connectionsRef.current[conn.peer] = conn;
    
    conn.on('data', (data) => {
      if (data.type === 'chat') {
        setMessages(prev => [...prev, { ...data, timestamp: Date.now() }]);
      } else if (data.type === 'reaction') {
        setReactions(prev => [...prev, { ...data, id: Math.random(), timestamp: Date.now() }]);
      }
    });

    conn.on('close', () => {
      delete connectionsRef.current[conn.peer];
    });
  };

  const sendMessage = (text) => {
    const msg = { type: 'chat', sender: userId, text };
    Object.values(connectionsRef.current).forEach(conn => {
      if (conn.open) conn.send(msg);
    });
    setMessages(prev => [...prev, { ...msg, timestamp: Date.now() }]);
  };

  const sendReaction = (emoji) => {
    const reaction = { type: 'reaction', emoji, sender: userId };
    Object.values(connectionsRef.current).forEach(conn => {
      if (conn.open) conn.send(reaction);
    });
    setReactions(prev => [...prev, { ...reaction, id: Math.random(), timestamp: Date.now() }]);
  };

  return {
    localStream,
    remoteStreams,
    messages,
    reactions,
    connected,
    activeSlot,
    sendMessage,
    sendReaction
  };
};
