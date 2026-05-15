import React, { useState, useEffect, useRef } from 'react';
import { 
  Video, VideoOff, Mic, MicOff, Send, Smile, PhoneOff, 
  Users, MessageSquare, Heart, ThumbsUp, Laugh, Hand
} from 'lucide-react';
import { useFamilySync } from './hooks/useFamilySync';
import './index.css';

const VideoTile = ({ stream, label, isLocal }) => {
  const videoRef = useRef();

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-tile glass">
      <video ref={videoRef} autoPlay playsInline muted={isLocal} />
      <div className="video-info">
        {isLocal ? <Video size={16} /> : <Users size={16} />}
        <span>{label}</span>
      </div>
    </div>
  );
};

function App() {
  const [inCall, setInCall] = useState(false);
  const [roomId, setRoomId] = useState('csaladi-kor');
  const [userId, setUserId] = useState('');
  const [inputText, setInputText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const { 
    localStream, remoteStreams, messages, reactions, 
    connected, connectToPeer, sendMessage, sendReaction 
  } = useFamilySync(roomId, userId);

  const handleJoin = () => {
    if (userId.trim()) setInCall(true);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (inputText.trim()) {
      sendMessage(inputText);
      setInputText('');
    }
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(t => t.enabled = isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  };

  // Try to connect to other known family members periodically or on join
  // For this demo, we'll assume they use these IDs
  const familyMembers = ['Anyuka', 'Hugo', 'En'].filter(name => name !== userId);

  useEffect(() => {
    if (inCall && connected) {
      familyMembers.forEach(member => {
        connectToPeer(member);
      });
    }
  }, [inCall, connected, connectToPeer]);

  if (!inCall) {
    return (
      <div className="join-screen">
        <div className="join-card glass">
          <div className="logo" style={{ justifyContent: 'center', marginBottom: '24px' }}>
            <Video size={32} /> FamilyConnect
          </div>
          <h2 style={{ marginBottom: '16px' }}>Csatlakozz a beszélgetéshez</h2>
          <input 
            type="text" 
            className="chat-input" 
            placeholder="A te neved (pl. Anyuka, Hugo, En)" 
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{ width: '100%', marginBottom: '12px' }}
          />
          <input 
            type="text" 
            className="chat-input" 
            placeholder="Szoba neve" 
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            style={{ width: '100%' }}
          />
          <button className="join-btn" onClick={handleJoin}>Belépés</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="header glass">
        <div className="logo">
          <Video size={24} /> FamilyConnect
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: connected ? '#4ade80' : '#f87171' }}>
            ● {connected ? 'Kapcsolódva' : 'Kapcsolódás...'}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>Szoba: {roomId}</span>
        </div>
      </header>

      <main className="main-content">
        <div className="video-grid">
          {localStream && <VideoTile stream={localStream} label={`${userId} (Te)`} isLocal={true} />}
          {remoteStreams.map(rs => (
            <VideoTile key={rs.id} stream={rs.stream} label={rs.id.split('-').pop()} />
          ))}
          {remoteStreams.length === 0 && (
            <div className="glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Várakozás a többiekre... <br/> (Anyuka és Hugo)
            </div>
          )}
        </div>

        <aside className="chat-panel glass">
          <div className="header" style={{ height: '48px', borderBottom: '1px solid var(--glass-border)' }}>
            <MessageSquare size={18} /> Csevegés
          </div>
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.sender === userId ? 'sent' : 'received'}`}>
                <div style={{ fontSize: '0.7rem', opacity: 0.7, marginBottom: '2px' }}>{msg.sender}</div>
                {msg.text}
              </div>
            ))}
          </div>
          <form className="chat-input-area" onSubmit={handleSendMessage}>
            <input 
              type="text" 
              className="chat-input" 
              placeholder="Írj valamit..." 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button type="submit" className="control-btn active" style={{ width: '36px', height: '36px' }}>
              <Send size={16} />
            </button>
          </form>
        </aside>
      </main>

      <div className="controls-bar glass">
        <button className={`control-btn ${isMuted ? 'danger' : 'active'}`} onClick={toggleMute}>
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button className={`control-btn ${isVideoOff ? 'danger' : 'active'}`} onClick={toggleVideo}>
          {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
        </button>
        <div style={{ width: '1px', background: 'var(--glass-border)', margin: '0 8px' }} />
        <button className="control-btn" onClick={() => sendReaction('❤️')}><Heart size={20} color="#fb7185" /></button>
        <button className="control-btn" onClick={() => sendReaction('👍')}><ThumbsUp size={20} color="#60a5fa" /></button>
        <button className="control-btn" onClick={() => sendReaction('😂')}><Laugh size={20} color="#fbbf24" /></button>
        <button className="control-btn" onClick={() => sendReaction('👋')}><Hand size={20} color="#c084fc" /></button>
        <div style={{ width: '1px', background: 'var(--glass-border)', margin: '0 8px' }} />
        <button className="control-btn danger" onClick={() => window.location.reload()}>
          <PhoneOff size={20} />
        </button>
      </div>

      {/* Emoji Bursts */}
      {reactions.map(r => (
        <div 
          key={r.id} 
          className="emoji-burst" 
          style={{ left: `${Math.random() * 80 + 10}%`, bottom: '100px' }}
        >
          {r.emoji}
        </div>
      ))}
    </div>
  );
}

export default App;
