import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// Polyfill for older Android Chrome / Samsung Internet (< Chrome 99)
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    const rad = Array.isArray(r) ? r[0] : (r || 0);
    this.beginPath();
    this.moveTo(x + rad, y);
    this.arcTo(x + w, y,     x + w, y + h, rad);
    this.arcTo(x + w, y + h, x,     y + h, rad);
    this.arcTo(x,     y + h, x,     y,     rad);
    this.arcTo(x,     y,     x + w, y,     rad);
    this.closePath();
  };
}

var BACKEND_URL = 'https://oyun-club-backend-production.up.railway.app';
var SockContext = React.createContext(null);
 
function useSocket(username) {
  var socketRef = useRef(null);
  var s1 = useState(false);
  var isConnected = s1[0];
  var setIsConnected = s1[1];
  var s2 = useState(false);
  var isRegistered = s2[0];
  var setIsRegistered = s2[1];
  var s3 = useState(null);
  var roomData = s3[0];
  var setRoomData = s3[1];
  var s4 = useState([]);
  var messages = s4[0];
  var setMessages = s4[1];
  var s5 = useState(null);
  var socketError = s5[0];
  var setSocketError = s5[1];
  var s6 = useState(null);
  var lastGameMove = s6[0];
  var setLastGameMove = s6[1];
  var s7 = useState([]);
  var publicRooms = s7[0];
  var setPublicRooms = s7[1];
  var s8 = useState(null);
  var myUserId = s8[0];
  var setMyUserId = s8[1];
  var s9 = useState([]);
  var friendList = s9[0]; // [{userId, name, online}]
  var setFriendList = s9[1];
  var s10 = useState([]);
  var friendRequests = s10[0]; // [{fromId, fromName}]
  var setFriendRequests = s10[1];
  var s11 = useState(null);
  var friendToast = s11[0];
  var setFriendToast = s11[1];
  var s12 = useState(null);
  var gameInvite = s12[0]; // {fromId, fromName, roomId, gameId}
  var setGameInvite = s12[1];
  var s13 = useState(null);
  var playerJoinedToast = s13[0]; // {name: string}
  var setPlayerJoinedToast = s13[1];

  useEffect(
    function () {
      if (!username) return;
      var socket;
      var retryCount = 0;

      // Wake up Railway backend first (HTTP ping), then connect socket
      fetch(BACKEND_URL + '/api/health').catch(function(){});

      import('https://cdn.socket.io/4.7.5/socket.io.esm.min.js')
        .then(function (mod) {
          var ioFunc = mod.io || mod.default;
          socket = ioFunc(BACKEND_URL, {
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 12000,
            timeout: 20000,
          });
          socketRef.current = socket;

          socket.on('connect', function () {
            retryCount = 0;
            setIsConnected(true);
            setSocketError(null);
            // Daha önce kaydedilmiş userId varsa gönder — sunucu arkadaş listesini geri yükler
            var storedUserId = null;
            try { storedUserId = localStorage.getItem('oyunclub_userid'); } catch(e){}
            socket.emit('register', { name: username, userId: storedUserId }, function (res) {
              if (res && res.success) {
                setIsRegistered(true);
                if (res.user && res.user.id) {
                  setMyUserId(res.user.id);
                  try { localStorage.setItem('oyunclub_userid', res.user.id); } catch(e){}
                  // Bağlantı kurulunca arkadaş listesini ve bekleyen istekleri otomatik yükle
                  socket.emit('get_friends', null, function(r) {
                    if (r && r.friends) {
                      setFriendList(r.friends);
                      setFriendRequests(r.pending || r.requests || []);
                      if ((r.pending || r.requests || []).length > 0) {
                        setFriendToast('🤝 ' + (r.pending || r.requests).length + ' bekleyen arkadaşlık isteği var!');
                        setTimeout(function(){ setFriendToast(null); }, 5000);
                      }
                    }
                  });
                }
              } else {
                setSocketError(res ? res.error : 'Kayit basarisiz');
              }
            });
          });

          socket.on('disconnect', function () {
            setIsConnected(false);
            setIsRegistered(false);
          });

          socket.on('connect_error', function () {
            retryCount++;
            if (retryCount <= 2) {
              setSocketError('Sunucuya baglaniliyor... (' + retryCount + '. deneme)');
            } else {
              setSocketError('Sunucu uyaniyor, lutfen bekleyin...');
            }
            setIsConnected(false);
          });

          socket.on('room_updated', function (data) {
            console.log('Oda guncellendi:', data);
            setRoomData(function (prev) {
              if (!prev) return data;
              if (data.players && prev.players && data.players.length > prev.players.length) {
                var newPlayer = data.players.find(function(p) {
                  return !prev.players.some(function(pp) {
                    return (pp.id && p.id) ? pp.id === p.id : pp.name === p.name;
                  });
                });
                if (newPlayer) {
                  setPlayerJoinedToast({ name: newPlayer.name });
                  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    try { new Notification('Oyuncu katıldı! 🎮', { body: newPlayer.name + ' masaya katıldı', icon: '/icon-192x192.png' }); } catch(e) {}
                  }
                }
              }
              if (
                data.players &&
                prev.players &&
                data.players.length < prev.players.length
              ) {
                return Object.assign({}, data, {
                  state: 'waiting',
                  gameState: null,
                  gameResult: null,
                  rpsReveal: null,
                });
              }
              return Object.assign({}, prev, data);
            });
          });

          socket.on('player_left', function (data) {
            setMessages(function (prev) {
              return prev.concat([
                { type: 'system', text: data.name + ' masadan ayrildi' },
              ]);
            });
            setRoomData(function (prev) {
              if (!prev) return prev;
              return Object.assign({}, prev, {
                state: 'waiting',
                gameState: null,
                gameResult: null,
                rpsReveal: null,
              });
            });
          });

          socket.on('chat_new_message', function (msg) {
            setMessages(function (prev) {
              return prev.concat([
                {
                  username: msg.name,
                  text: msg.message,
                  timestamp: msg.timestamp,
                },
              ]);
            });
          });

          socket.on('game_started', function (data) {
            console.log('Oyun basladi:', data);
            setRoomData(function (prev) {
              if (!prev) return data;
              return Object.assign({}, prev, data, {
                rpsReveal: null,
                gameResult: null,
              });
            });
          });

          socket.on('game_state_updated', function (data) {
            setRoomData(function (prev) {
              if (!prev) return prev;
              return Object.assign({}, prev, {
                gameState: data.gameState,
                state: data.state,
              });
            });
          });

          socket.on('game_finished', function (data) {
            console.log('Oyun bitti:', data);
            setRoomData(function (prev) {
              if (!prev) return prev;
              return Object.assign({}, prev, {
                state: 'finished',
                gameResult: data,
                gameState: prev.gameState
                  ? Object.assign({}, prev.gameState, {
                      winner: data.winner,
                      winLine: data.winLine,
                    })
                  : null,
              });
            });
          });

          socket.on('rps_opponent_chose', function () {
            console.log('Rakip secim yapti');
          });

          socket.on('rps_reveal', function (data) {
            console.log('RPS sonuc:', data);
            setRoomData(function (prev) {
              if (!prev) return prev;
              return Object.assign({}, prev, {
                rpsReveal: data,
                rpsScores: data.scores,
                state: data.gameWinner !== null ? 'finished' : prev.state,
                gameResult:
                  data.gameWinner !== null
                    ? {
                        winner: data.gameWinner,
                        winnerName: prev.players[data.gameWinner]
                          ? prev.players[data.gameWinner].name
                          : '?',
                      }
                    : prev.gameResult,
              });
            });
          });

          socket.on('rps_new_round', function (data) {
            console.log('Yeni raund:', data);
            setRoomData(function (prev) {
              if (!prev) return prev;
              return Object.assign({}, prev, {
                rpsReveal: null,
                rpsRound: data.round,
                rpsScores: data.scores,
              });
            });
          });

          socket.on('game_move', function(data) {
            setLastGameMove({ ...data, _ts: Date.now() });
          });

          socket.on('rooms_updated', function(data) {
            if (data && data.rooms) setPublicRooms(data.rooms);
          });

          // --- ARKADAŞ SİSTEMİ EVENTLERİ ---
          socket.on('friend_online', function(data) {
            setFriendList(function(prev) {
              return prev.map(function(f) { return f.userId === data.userId ? Object.assign({},f,{online:true,name:data.name}) : f; });
            });
          });
          socket.on('friend_offline', function(data) {
            setFriendList(function(prev) {
              return prev.map(function(f) { return f.userId === data.userId ? Object.assign({},f,{online:false}) : f; });
            });
          });
          socket.on('friend_request_incoming', function(data) {
            setFriendRequests(function(prev) { return prev.concat([data]); });
            setFriendToast('🤝 ' + data.fromName + ' arkadaşlık isteği gönderdi!');
            setTimeout(function(){ setFriendToast(null); }, 4000);
          });
          socket.on('friend_accepted', function(data) {
            var uid = data.byId || data.userId;
            var uname = data.byName || data.name;
            setFriendList(function(prev) { return prev.concat([{userId:uid,name:uname,online:true}]); });
            setFriendToast('✅ ' + uname + ' arkadaşlık isteğini kabul etti!');
            setTimeout(function(){ setFriendToast(null); }, 4000);
          });
          socket.on('friend_removed', function(data) {
            setFriendList(function(prev) { return prev.filter(function(f){return f.userId!==data.userId;}); });
          });
          socket.on('game_invite', function(data) {
            setGameInvite(data);
          });
        })
        .catch(function () {
          setSocketError('Socket.io yuklenemedi');
        });

      return function () {
        if (socket) {
          socket.removeAllListeners();
          socket.disconnect();
        }
        socketRef.current = null;
      };
    },
    [username]
  );

  var createRoom = useCallback(
    function (gameId, isPublic) {
      if (!socketRef.current || !isRegistered) return;
      socketRef.current.emit('create_room', { gameId: gameId, isPublic: isPublic !== false }, function (res) {
        if (res && res.success) {
          setRoomData(res.room);
          setMessages([]);
        } else {
          setSocketError(res ? res.error : 'Oda olusturulamadi');
        }
      });
    },
    [isRegistered]
  );

  var joinRoom = useCallback(
    function (roomCode) {
      if (!socketRef.current) { setSocketError('Bağlantı yok, lütfen bekleyin'); return; }
      if (!isRegistered) { setSocketError('Sunucuya kayıt bekleniyor...'); return; }
      setSocketError(null);
      console.log('[joinRoom] kod:', roomCode);
      socketRef.current.emit('join_room', { roomId: roomCode.toUpperCase().trim() }, function (res) {
        console.log('[joinRoom] yanit:', res);
        if (res && res.success) {
          setRoomData(res.room);
          setMessages([]);
        } else {
          setSocketError(res ? res.error : 'Katilma basarisiz - kod yanlis olabilir');
        }
      });
    },
    [isRegistered]
  );

  var leaveRoom = useCallback(function () {
    if (!socketRef.current) return;
    socketRef.current.emit('leave_room', null, function () {
      setRoomData(null);
      setMessages([]);
    });
  }, []);

  var sendMessage = useCallback(function (text) {
    if (!socketRef.current || !text.trim()) return;
    socketRef.current.emit(
      'chat_message',
      { message: text.trim() },
      function () {}
    );
  }, []);

  var startGame = useCallback(function () {
    if (!socketRef.current) return;
    socketRef.current.emit('start_game', null, function (res) {
      if (res && !res.success) {
        setSocketError(res.error || 'Baslatilamadi');
      }
    });
  }, []);

  var sendXOXMove = useCallback(function (cellIndex) {
    if (!socketRef.current) return;
    setSocketError(null);
    socketRef.current.emit(
      'xox_move',
      { cellIndex: cellIndex },
      function (res) {
        if (res && res.error) {
          console.log('Hamle:', res.error);
        }
      }
    );
  }, []);

  var sendRPSChoice = useCallback(function (choice) {
    if (!socketRef.current) return;
    setSocketError(null);
    socketRef.current.emit('rps_choice', { choice: choice }, function (res) {
      if (res && res.error) {
        console.log('RPS:', res.error);
      }
    });
  }, []);

  var restartGame = useCallback(function () {
    if (!socketRef.current) return;
    setSocketError(null);
    socketRef.current.emit('restart_game', null, function (res) {
      if (res && res.error) {
        console.log('Restart:', res.error);
      } else {
        setRoomData(function (prev) {
          if (!prev) return prev;
          return Object.assign({}, prev, {
            gameResult: null,
            rpsReveal: null,
            rpsScores: null,
            rpsRound: null,
          });
        });
      }
    });
  }, []);

  var sendGameMove = useCallback(function(data) {
    if (!socketRef.current) return;
    socketRef.current.emit('game_move', data, function() {});
  }, []);

  var fetchPublicRooms = useCallback(function() {
    fetch('https://oyun-club-backend-production.up.railway.app/api/rooms')
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d && d.rooms) setPublicRooms(d.rooms); })
      .catch(function() {});
  }, []);

  var getFriends = useCallback(function(cb) {
    if (!socketRef.current) return;
    socketRef.current.emit('get_friends', null, function(res) {
      if (res && res.friends) {
        setFriendList(res.friends);
        setFriendRequests(res.pending || res.requests || []);
      }
      if (cb) cb(res);
    });
  }, []);

  var sendFriendRequest = useCallback(function(toUserId, cb) {
    if (!socketRef.current) return;
    socketRef.current.emit('friend_request', { toId: toUserId }, cb || function(){});
  }, []);

  var acceptFriend = useCallback(function(fromId, cb) {
    if (!socketRef.current) return;
    socketRef.current.emit('accept_friend', { fromId }, function(res) {
      if (res && res.success) {
        setFriendRequests(function(prev){ return prev.filter(function(r){ return r.fromId !== fromId; }); });
        if (res.friendId) setFriendList(function(prev){ return prev.concat([{userId:res.friendId,name:res.friendName,online:true}]); });
      }
      if (cb) cb(res);
    });
  }, []);

  var rejectFriend = useCallback(function(fromId, cb) {
    if (!socketRef.current) return;
    socketRef.current.emit('reject_friend', { fromId }, function(res) {
      if (res && res.success) setFriendRequests(function(prev){ return prev.filter(function(r){ return r.fromId !== fromId; }); });
      if (cb) cb(res);
    });
  }, []);

  var removeFriend = useCallback(function(friendId, cb) {
    if (!socketRef.current) return;
    socketRef.current.emit('remove_friend', { friendId }, function(res) {
      if (res && res.success) setFriendList(function(prev){ return prev.filter(function(f){ return f.userId !== friendId; }); });
      if (cb) cb(res);
    });
  }, []);

  var searchUser = useCallback(function(query, cb) {
    if (!socketRef.current) return;
    socketRef.current.emit('search_user', { query }, cb || function(){});
  }, []);

  var inviteFriend = useCallback(function(toUserId, roomId, gameId, cb) {
    if (!socketRef.current) return;
    socketRef.current.emit('invite_friend', { toUserId, roomId, gameId }, cb || function(){});
  }, []);

  return {
    isConnected: isConnected,
    isRegistered: isRegistered,
    roomData: roomData,
    messages: messages,
    socketError: socketError,
    createRoom: createRoom,
    joinRoom: joinRoom,
    leaveRoom: leaveRoom,
    sendMessage: sendMessage,
    startGame: startGame,
    sendXOXMove: sendXOXMove,
    sendRPSChoice: sendRPSChoice,
    restartGame: restartGame,
    setSocketError: setSocketError,
    sendGameMove: sendGameMove,
    lastGameMove: lastGameMove,
    publicRooms: publicRooms,
    fetchPublicRooms: fetchPublicRooms,
    myUserId: myUserId,
    friendList: friendList,
    friendRequests: friendRequests,
    friendToast: friendToast,
    gameInvite: gameInvite,
    setGameInvite: setGameInvite,
    clearGameInvite: function() { setGameInvite(null); },
    playerJoinedToast: playerJoinedToast,
    clearPlayerJoinedToast: function() { setPlayerJoinedToast(null); },
    getFriends: getFriends,
    sendFriendRequest: sendFriendRequest,
    acceptFriend: acceptFriend,
    rejectFriend: rejectFriend,
    removeFriend: removeFriend,
    searchUser: searchUser,
    inviteFriend: inviteFriend,
  };
}

// ============================================================
// CHAT PANEL
// ============================================================
function ChatPanel(props) {
  var messages = props.messages || [];
  var onSend = props.onSend;
  var currentUser = props.currentUser;
  var isConnected = props.isConnected || false;
  var playerCount = props.playerCount || 0;
  var s1 = useState('');
  var text = s1[0];
  var setText = s1[1];
  var messagesEndRef = useRef(null);
  var inputRef = useRef(null);

  useEffect(
    function () {
      if (messagesEndRef.current)
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    },
    [messages]
  );

  function handleSend() {
    if (!text.trim() || !onSend) return;
    onSend(text.trim());
    setText('');
    if (inputRef.current) inputRef.current.focus();
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: 360,
        height: 400,
        borderRadius: 16,
        overflow: 'hidden',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'var(--surface-hover)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text)',
            margin: 0,
          }}
        >
          Masa Sohbeti
        </h3>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {isConnected ? playerCount + ' oyuncu' : 'Baglaniyor...'}
        </span>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              fontSize: 13,
              textAlign: 'center',
              padding: 20,
              opacity: 0.5,
            }}
          >
            Henuz mesaj yok.
          </div>
        ) : (
          messages.map(function (msg, i) {
            if (msg.type === 'system')
              return (
                <div
                  key={i}
                  style={{
                    textAlign: 'center',
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    padding: '4px 0',
                    fontStyle: 'italic',
                  }}
                >
                  {msg.text}
                </div>
              );
            var isMine = msg.username === currentUser;
            return (
              <div
                key={i}
                style={{
                  maxWidth: '80%',
                  padding: '8px 12px',
                  borderRadius: isMine
                    ? '12px 12px 4px 12px'
                    : '12px 12px 12px 4px',
                  background: isMine ? '#6366f1' : 'var(--surface-hover)',
                  color: isMine ? '#fff' : 'var(--text)',
                  alignSelf: isMine ? 'flex-end' : 'flex-start',
                  fontSize: 13,
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                }}
              >
                {!isMine && (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#818cf8',
                      marginBottom: 2,
                    }}
                  >
                    {msg.username}
                  </div>
                )}
                <div>{msg.text}</div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderTop: '1px solid var(--border)',
        }}
      >
        <input
          ref={inputRef}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 20,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 13,
            outline: 'none',
            fontFamily: "'DM Sans', sans-serif",
          }}
          type="text"
          placeholder={
            isConnected ? 'Mesajinizi yazin...' : 'Baglanti bekleniyor...'
          }
          value={text}
          onChange={function (e) {
            setText(e.target.value);
          }}
          onKeyDown={function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={!isConnected}
          maxLength={500}
        />
        <button
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: 'none',
            background: '#6366f1',
            color: '#fff',
            cursor: text.trim() && isConnected ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            opacity: text.trim() && isConnected ? 1 : 0.4,
          }}
          onClick={handleSend}
          disabled={!text.trim() || !isConnected}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MULTIPLAYER XOX
// ============================================================
function MultiplayerXOX(props) {
  var gs = props.gameState;
  var players = props.players;
  var username = props.username;
  console.log("DEBUG-USER:", username);
  var onMove = props.onMove;
  if (!gs) return null;
  var myIndex = -1;
  for (var i = 0; i < players.length; i++) {
    if (players[i].name === username) {
      myIndex = i;
      break;
    }
  }
  var isMyTurn = gs.currentTurn === myIndex;
  var mySymbol = myIndex === 0 ? 'X' : 'O';
  var turnPlayerName = players[gs.currentTurn]
    ? players[gs.currentTurn].name
    : '?';

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        marginBottom: 12,
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div
          style={{
            fontSize: 14,
            color: 'var(--text-secondary)',
            marginBottom: 4,
          }}
        >
          Sen:{' '}
          <strong style={{ color: myIndex === 0 ? '#E63946' : '#457B9D' }}>
            {mySymbol}
          </strong>{' '}
          — Rakip:{' '}
          <strong style={{ color: myIndex === 0 ? '#457B9D' : '#E63946' }}>
            {myIndex === 0 ? 'O' : 'X'}
          </strong>
        </div>
        {gs.winner === null && (
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: isMyTurn ? '#2A9D8F' : 'var(--text-secondary)',
            }}
          >
            {isMyTurn ? 'Senin siran!' : turnPlayerName + ' oynuyor...'}
          </div>
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
          maxWidth: 240,
          margin: '0 auto',
        }}
      >
        {gs.board.map(function (cell, i) {
          var isWinCell = gs.winLine && gs.winLine.indexOf(i) !== -1;
          return (
            <button
              key={i}
              onClick={function () {
                if (isMyTurn && !cell && gs.winner === null) onMove(i);
              }}
              style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: 8,
                border: isWinCell
                  ? '2px solid #E63946'
                  : '2px solid var(--border)',
                background: isWinCell
                  ? cell === 'X'
                    ? '#FEE2E2'
                    : '#DBEAFE'
                  : 'var(--surface-hover)',
                cursor:
                  isMyTurn && !cell && gs.winner === null
                    ? 'pointer'
                    : 'default',
                fontSize: 28,
                fontFamily: "'Sora', sans-serif",
                fontWeight: 800,
                color: cell === 'X' ? '#E63946' : '#457B9D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: !isMyTurn && !cell && gs.winner === null ? 0.5 : 1,
              }}
            >
              {cell}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// MULTIPLAYER RPS
// ============================================================
function MultiplayerRPS(props) {
  var players = props.players;
  var username = props.username;
  var onChoice = props.onChoice;
  var rpsReveal = props.rpsReveal;
  var rpsScores = props.rpsScores;
  var rpsRound = props.rpsRound;
  var gameState = props.gameState;

  var s1 = useState(false);
  var hasChosen = s1[0];
  var setHasChosen = s1[1];
  var s2 = useState(null);
  var myChoice = s2[0];
  var setMyChoice = s2[1];

  var myIndex = -1;
  for (var i = 0; i < players.length; i++) {
    if (players[i].name === username) {
      myIndex = i;
      break;
    }
  }

  // rpsReveal null olunca (yeni raund) seçimi sıfırla
  useEffect(
    function () {
      if (!rpsReveal) {
        setHasChosen(false);
        setMyChoice(null);
      }
    },
    [rpsReveal]
  );

  var choices = [
    { id: 'rock', emoji: '✊', name: 'Tas' },
    { id: 'paper', emoji: '✋', name: 'Kagit' },
    { id: 'scissors', emoji: '✌️', name: 'Makas' },
  ];

  // Skor: önce rpsScores (güncel), yoksa gameState.scores, yoksa [0,0]
  var scores = rpsScores || (gameState ? gameState.scores : null) || [0, 0];
  var round = rpsRound || (gameState ? gameState.round : null) || 1;

  function handleChoice(choiceId) {
    if (hasChosen) return;
    setHasChosen(true);
    setMyChoice(choiceId);
    onChoice(choiceId);
  }

  function getEmoji(id) {
    for (var j = 0; j < choices.length; j++) {
      if (choices[j].id === id) return choices[j].emoji;
    }
    return '?';
  }

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        marginBottom: 12,
      }}
    >
      {/* Skor tablosu */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 24,
          marginBottom: 16,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {players[0] ? players[0].name : '?'}
            {myIndex === 0 ? ' (Sen)' : ''}
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              fontFamily: "'Sora', sans-serif",
              color: '#2A9D8F',
            }}
          >
            {scores[0]}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginBottom: 4,
            }}
          >
            Raund
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              fontFamily: "'Sora', sans-serif",
            }}
          >
            {round}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
            ilk 3 kazanir
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {players[1] ? players[1].name : '?'}
            {myIndex === 1 ? ' (Sen)' : ''}
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              fontFamily: "'Sora', sans-serif",
              color: '#E63946',
            }}
          >
            {scores[1]}
          </div>
        </div>
      </div>

      {/* Sonuç göster */}
      {rpsReveal && rpsReveal.choices && (
        <div
          style={{
            textAlign: 'center',
            marginBottom: 16,
            padding: 12,
            borderRadius: 10,
            background: 'var(--surface-hover)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 24,
              marginBottom: 8,
            }}
          >
            <div>
              <div style={{ fontSize: 48 }}>
                {getEmoji(rpsReveal.choices[0])}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {players[0] ? players[0].name : ''}
              </div>
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--text-secondary)',
              }}
            >
              vs
            </div>
            <div>
              <div style={{ fontSize: 48 }}>
                {getEmoji(rpsReveal.choices[1])}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {players[1] ? players[1].name : ''}
              </div>
            </div>
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color:
                rpsReveal.roundResult === 'draw'
                  ? 'var(--text-secondary)'
                  : rpsReveal.roundResult === myIndex
                  ? '#2A9D8F'
                  : '#E63946',
            }}
          >
            {rpsReveal.roundResult === 'draw'
              ? 'Berabere!'
              : rpsReveal.roundResult === myIndex
              ? 'Bu eli kazandin!'
              : 'Bu eli kaybettin!'}
          </div>
          {rpsReveal.gameWinner !== null && (
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                marginTop: 12,
                fontFamily: "'Sora', sans-serif",
                color: rpsReveal.gameWinner === myIndex ? '#2A9D8F' : '#E63946',
              }}
            >
              {rpsReveal.gameWinner === myIndex
                ? 'Oyunu Kazandin! 🎉'
                : (players[rpsReveal.gameWinner]
                    ? players[rpsReveal.gameWinner].name
                    : '') + ' Kazandi!'}
            </div>
          )}
          {rpsReveal.gameWinner === null && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginTop: 8,
              }}
            >
              Sonraki el yakinda...
            </div>
          )}
        </div>
      )}

      {/* Seçim butonları */}
      {!rpsReveal && (
        <div>
          {hasChosen ? (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>
                {getEmoji(myChoice)}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                Secimini yaptin! Rakip bekleniyor...
              </div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  textAlign: 'center',
                  fontSize: 14,
                  color: 'var(--text-secondary)',
                  marginBottom: 12,
                }}
              >
                Secimini yap:
              </div>
              <div
                style={{ display: 'flex', justifyContent: 'center', gap: 12 }}
              >
                {choices.map(function (c) {
                  return (
                    <button
                      key={c.id}
                      onClick={function () {
                        handleChoice(c.id);
                      }}
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 12,
                        border: '2px solid var(--border)',
                        background: 'var(--surface-hover)',
                        cursor: 'pointer',
                        fontSize: 36,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                      }}
                    >
                      <span>{c.emoji}</span>
                      <span
                        style={{ fontSize: 10, color: 'var(--text-secondary)' }}
                      >
                        {c.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SHARE RESULT BUTTON
// ============================================================
function ShareResultButton({ winnerName, myName, gameName }) {
  var didWin = winnerName === myName;
  var text = didWin
    ? 'Oyun Clubda ' + gameName + ' oyununu kazandim! Seninle oynamak icin: ' + window.location.origin
    : 'Oyun Clubda ' + gameName + ' oynadim! Seninle oynamak icin: ' + window.location.origin;

  function handleNativeShare() {
    if (navigator.share) {
      navigator.share({ title: 'Oyun Club', text: text, url: window.location.origin }).catch(function(){});
    }
  }

  function handleTwitter() {
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text), '_blank');
  }

  function handleWhatsApp() {
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  }

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', margin: '12px 0' }}>
      {navigator.share && (
        <button onClick={handleNativeShare}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
          Paylas
        </button>
      )}
      <button onClick={handleTwitter}
        style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1DA1F2', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
        Twitter
      </button>
      <button onClick={handleWhatsApp}
        style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#25D366', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
        WhatsApp
      </button>
    </div>
  );
}

// ============================================================
// MULTIPLAYER LOBBY
// ============================================================
var MP_GAMES = [
  { id: 'xox',         name: 'XOX',                icon: '❌⭕',    players: 2, online: true  },
  { id: 'rps',         name: 'Taş Kağıt Makas',    icon: '✊✋✌️', players: 2, online: true  },
  { id: 'connectfour', name: '4 Sıra',              icon: '🔵',     players: 2, local: true   },
  { id: 'gomoku',      name: 'Beş Taş',             icon: '⚫',     players: 2, local: true   },
  { id: 'reaction',    name: 'Tepki Yarışı',         icon: '⚡',     players: 2, local: true   },
  { id: 'mathduel',    name: 'Matematik Düellosu',   icon: '🧮',     players: 2, local: true   },
  { id: 'cardbattle',  name: 'Kart Savaşı',          icon: '🃏',     players: 2, local: true   },
  { id: 'memorybattle',name: 'Hafıza Savaşı',        icon: '🧠',     players: 2, local: true   },
  { id: 'wordrace',    name: 'Kelime Yarışı',         icon: '🔤',     players: 2, local: true   },
];

function MultiplayerLobby(props) {
  var passedName = props && props.userName ? props.userName : "";
  var s1 = useState(null); var selectedMPGame = s1[0]; var setSelectedMPGame = s1[1];
  var s2 = useState(''); var joinCode = s2[0]; var setJoinCode = s2[1];
  var s3 = useState(passedName || "Oyuncu"); var username = s3[0];
  var s4 = useState(false); var showPrivacyModal = s4[0]; var setShowPrivacyModal = s4[1];
  var s5 = useState(false); var autoJoined = s5[0]; var setAutoJoined = s5[1];
  var lastMoveRef = useRef(null);

  var sock = props.sock || { isConnected: false, isRegistered: false, roomData: null, players: [], messages: [], myUserId: null, friendList: [], friendRequests: [], friendToast: null, gameInvite: null };

  // Auto-join from URL params
  useEffect(function() {
    if (props.initialCode && sock.isRegistered && !autoJoined && !sock.roomData) {
      setAutoJoined(true);
      sock.joinRoom(props.initialCode);
    }
  }, [props.initialCode, sock.isRegistered, autoJoined, sock.roomData]);

  // Auto-select game passed from main lobby
  useEffect(function() {
    if (props.initialGame) setSelectedMPGame(props.initialGame);
  }, [props.initialGame]);

  // Request notification permission when joining/creating a room
  useEffect(function() {
    if (sock.roomData && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(function() {});
    }
  }, [!!sock.roomData]);

  // Auto-dismiss player joined toast after 3s
  useEffect(function() {
    if (!sock.playerJoinedToast) return;
    var t = setTimeout(sock.clearPlayerJoinedToast, 3000);
    return function() { clearTimeout(t); };
  }, [sock.playerJoinedToast]);

  // Kullanıcı başka sayfaya geçip odada bekliyorsa 10sn sonra odayı kapat
  useEffect(function() {
    if (props.active !== false) return;
    if (!sock.roomData) return;
    var t = setTimeout(function() { sock.leaveRoom(); }, 10000);
    return function() { clearTimeout(t); };
  }, [props.active, !!sock.roomData]);

  // Fetch public rooms on mount; rooms_updated socket event handles real-time updates
  useEffect(function() {
    if (!sock.roomData) {
      sock.fetchPublicRooms();
      var interval = setInterval(sock.fetchPublicRooms, 8000);
      return function() { clearInterval(interval); };
    }
  }, [sock.roomData]);

  function handleCreateRoom(isPublic) {
    setShowPrivacyModal(false);
    sock.createRoom(selectedMPGame, isPublic);
  }

  function handleJoinPublicRoom(roomId) {
    sock.joinRoom(roomId);
  }

  function handleCopyLink() {
    if (!sock.roomData) return;
    var link = window.location.origin + '/?room=' + sock.roomData.id;
    navigator.clipboard.writeText(link).catch(function() {});
  }

  var gameNames = {
    xox: 'XOX', rps: 'Tas Kagit Makas', connectfour: '4 Sira', gomoku: 'Bes Tas',
    reaction: 'Tepki Yarisi', mathduel: 'Matematik Duellosu', cardbattle: 'Kart Savasi',
    memorybattle: 'Hafiza Savasi', wordrace: 'Kelime Yarisi'
  };
  var gameIcons = {
    xox: '❌⭕', rps: '✊✋✌️', connectfour: '🔵', gomoku: '⚫',
    reaction: '⚡', mathduel: '🧮', cardbattle: '🃏', memorybattle: '🧠', wordrace: '🔤'
  };

  // --- ROOM VIEW ---
  if (sock.roomData) {
    var players = sock.roomData.players || [];
    var maxP = sock.roomData.maxPlayers || 2;
    var canStart = players.length >= maxP;
    var isHost = players[0] && players[0].id === sock.myUserId;
    var myIndex = sock.myUserId
      ? players.findIndex(function(p) { return p.id === sock.myUserId; })
      : players.findIndex(function(p) { return p.name === username; });
    var currentGame = sock.roomData.gameId;
    var onlineProps = {
      myIndex: myIndex >= 0 ? myIndex : 0,
      opponentName: (players.find(function(p) { return p.id !== sock.myUserId && p.name !== username; }) || players[myIndex === 0 ? 1 : 0] || {}).name || 'Rakip',
      onMove: sock.sendGameMove,
      remoteMove: sock.lastGameMove,
    };

    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px' }}>
        {/* Player joined toast */}
        {sock.playerJoinedToast && (
          <div style={{ position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 9998, background: 'linear-gradient(135deg,#059669,#34d399)', color: '#fff', borderRadius: 14, padding: '12px 22px', fontWeight: 700, fontSize: 15, boxShadow: '0 4px 24px rgba(5,150,105,0.35)', display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap', fontFamily: "'DM Sans',sans-serif", animation: 'fadeInDown 0.3s ease' }}>
            <span style={{ fontSize: 22 }}>🎮</span>
            {sock.playerJoinedToast.name} masaya katıldı!
          </div>
        )}
        {/* Room header */}
        <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 20, marginBottom: 16, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Sora', sans-serif" }}>
                {gameIcons[currentGame] || '🎮'} {gameNames[currentGame] || currentGame}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                Masa Kodu: <strong style={{ letterSpacing: 2, fontFamily: 'monospace', fontSize: 16 }}>{sock.roomData.id}</strong>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCopyLink}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Davet Linki
              </button>
              <button onClick={sock.leaveRoom}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#FEE2E2', color: '#DC2626', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Cik
              </button>
            </div>
          </div>
          {/* Players */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {players.map(function(p, i) {
              return (
                <div key={p.id || i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: i === myIndex ? 'rgba(99,102,241,0.1)' : 'var(--surface-hover)', border: '1px solid ' + (i === myIndex ? '#6366f1' : 'var(--border)'), borderRadius: 10, padding: '8px 14px' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: i === 0 ? '#E63946' : '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>{p.name ? p.name[0].toUpperCase() : '?'}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}{i === myIndex ? ' (Sen)' : ''}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{i === 0 ? 'Host' : 'Oyuncu 2'}</div>
                  </div>
                </div>
              );
            })}
            {players.length < maxP && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-hover)', border: '1px dashed var(--border)', borderRadius: 10, padding: '8px 14px', opacity: 0.6 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>?</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Rakip bekleniyor...</div>
              </div>
            )}
          </div>
        </div>

        {/* Start button / waiting */}
        {sock.roomData.state === 'waiting' && canStart && isHost && (
          <button onClick={sock.startGame}
            style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #059669, #34D399)', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>
            Oyunu Baslat
          </button>
        )}
        {sock.roomData.state === 'waiting' && !canStart && (
          <div style={{ textAlign: 'center', padding: '12px', background: 'var(--surface)', borderRadius: 12, marginBottom: 16, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 24 }}>⏳</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>Rakip bekleniyor... Daveti kopyala ve arkadasina gonder!</div>
          </div>
        )}
        {sock.roomData.state === 'waiting' && canStart && !isHost && (
          <div style={{ textAlign: 'center', padding: 12, fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Host oyunu baslatmasini bekleyin...
          </div>
        )}

        {/* Game area */}
        {sock.roomData.state === 'playing' && currentGame === 'xox' && (
          <MultiplayerXOX gameState={sock.roomData.gameState} players={players} username={username} onMove={sock.sendXOXMove} />
        )}
        {sock.roomData.state === 'playing' && currentGame === 'rps' && (
          <MultiplayerRPS players={players} username={username} onChoice={sock.sendRPSChoice} rpsReveal={sock.roomData.rpsReveal} rpsScores={sock.roomData.rpsScores} rpsRound={sock.roomData.rpsRound} gameState={sock.roomData.gameState} />
        )}
        {sock.roomData.state === 'playing' && currentGame === 'gomoku' && (
          <GomokuGame onGameEnd={function(){}} soundOn={false} onlineProps={onlineProps} />
        )}
        {sock.roomData.state === 'playing' && currentGame === 'connectfour' && (
          <ConnectFourGame onGameEnd={function(){}} soundOn={false} onlineProps={onlineProps} />
        )}
        {sock.roomData.state === 'playing' && currentGame === 'cardbattle' && (
          <CardBattleGame onGameEnd={function(){}} soundOn={false} onlineProps={onlineProps} />
        )}
        {sock.roomData.state === 'playing' && currentGame === 'memorybattle' && (
          <MemoryBattleGame onGameEnd={function(){}} soundOn={false} onlineProps={onlineProps} />
        )}
        {sock.roomData.state === 'playing' && currentGame === 'mathduel' && (
          <MathDuelGame onGameEnd={function(){}} soundOn={false} onlineProps={onlineProps} />
        )}
        {sock.roomData.state === 'playing' && currentGame === 'reaction' && (
          <ReactionGame onGameEnd={function(){}} soundOn={false} onlineProps={onlineProps} />
        )}
        {sock.roomData.state === 'playing' && currentGame === 'wordrace' && (
          <WordRaceGame onGameEnd={function(){}} soundOn={false} onlineProps={onlineProps} />
        )}

        {/* Game finished */}
        {sock.roomData.state === 'finished' && (
          <div style={{ padding: 24, borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)', textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>
              {sock.roomData.gameResult && sock.roomData.gameResult.winnerName === username ? '🏆' :
               sock.roomData.gameResult && sock.roomData.gameResult.winner === 'draw' ? '🤝' : '😔'}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Sora', sans-serif", marginBottom: 8 }}>
              {sock.roomData.gameResult && sock.roomData.gameResult.winnerName === username ? 'Kazandin! Tebrikler!' :
               sock.roomData.gameResult && sock.roomData.gameResult.winner === 'draw' ? 'Berabere!' :
               sock.roomData.gameResult && sock.roomData.gameResult.winnerName ? sock.roomData.gameResult.winnerName + ' kazandi!' : 'Oyun Bitti!'}
            </div>
            <ShareResultButton
              winnerName={sock.roomData.gameResult && sock.roomData.gameResult.winnerName}
              myName={username}
              gameName={gameNames[currentGame] || currentGame}
            />
            {isHost && canStart && (
              <button onClick={sock.restartGame}
                style={{ marginTop: 12, padding: '10px 24px', borderRadius: 10, border: 'none', background: '#2A9D8F', color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Tekrar Oyna
              </button>
            )}
          </div>
        )}

        {/* Chat */}
        <ChatPanel messages={sock.messages} onSend={sock.sendMessage} currentUser={username} isConnected={sock.isRegistered} playerCount={players.length} />

        {sock.socketError && (
          <div style={{ padding: '10px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 13, marginTop: 12 }}>
            {sock.socketError}
          </div>
        )}
      </div>
    );
  }

  // --- LOBBY VIEW ---
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px' }}>
      {/* Connection status */}
      <div style={{ padding: '12px 16px', borderRadius: 12, background: sock.isConnected ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: '1px solid ' + (sock.isConnected ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'), color: sock.isConnected ? '#16a34a' : '#dc2626', fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: sock.isConnected ? '#16a34a' : '#ef4444', display: 'inline-block', flexShrink: 0, boxShadow: sock.isConnected ? '0 0 6px #16a34a' : '0 0 6px #ef4444' }} />
        <span style={{ flex: 1 }}>
          {sock.isRegistered
            ? '🟢 Bağlandı — masa oluşturabilir veya katılabilirsin!'
            : sock.isConnected
            ? '🟡 Hazırlanıyor...'
            : sock.socketError
            ? '🔴 ' + sock.socketError + ' — otomatik yeniden deniyor...'
            : '🟡 Sunucuya bağlanılıyor... (ilk açılışta 20-30 sn sürebilir)'}
        </span>
        {!sock.isConnected && (
          <button onClick={function() { window.location.reload(); }} style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.15)', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
            🔄 Yenile
          </button>
        )}
      </div>

      {/* Game selection */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Masa Olustur</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
          {MP_GAMES.map(function(g) {
            return (
              <div key={g.id} onClick={function() { setSelectedMPGame(g.id); }}
                style={{ padding: '14px 10px', borderRadius: 12, border: '2px solid ' + (selectedMPGame === g.id ? '#6366f1' : 'var(--border)'), background: selectedMPGame === g.id ? 'rgba(99,102,241,0.12)' : 'var(--surface)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>{g.icon}</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>2 oyuncu</div>
              </div>
            );
          })}
        </div>
        {selectedMPGame && (
          <button
            onClick={function() { setShowPrivacyModal(true); }}
            disabled={!sock.isRegistered}
            style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: sock.isRegistered ? 'var(--accent)' : '#ccc', color: '#fff', fontWeight: 700, fontSize: 15, cursor: sock.isRegistered ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif" }}>
            Masa Olustur
          </button>
        )}
      </div>

      {/* Join by code */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 12 }}>🔑 Koda ile Katıl</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={joinCode}
            onChange={function(e) {
              setJoinCode(e.target.value.toUpperCase());
              sock.setSocketError(null);
            }}
            onKeyDown={function(e) {
              if (e.key === 'Enter' && joinCode.trim() && sock.isRegistered) {
                sock.setSocketError(null);
                sock.joinRoom(joinCode.trim());
              }
            }}
            placeholder="Masa kodu gir (örn: AB1234)"
            maxLength={6}
            style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: '2px solid ' + (sock.socketError && joinCode ? '#ef4444' : 'var(--border)'), background: 'var(--surface)', color: 'var(--text)', fontSize: 16, fontFamily: 'monospace', letterSpacing: 4, outline: 'none', textTransform: 'uppercase' }}
          />
          <button
            onClick={function() {
              if (!joinCode.trim()) return;
              sock.setSocketError(null);
              sock.joinRoom(joinCode.trim());
            }}
            disabled={!sock.isRegistered || !joinCode.trim()}
            style={{ padding: '12px 24px', borderRadius: 10, border: 'none', background: sock.isRegistered && joinCode.trim() ? '#059669' : '#ccc', color: '#fff', fontWeight: 700, fontSize: 15, cursor: sock.isRegistered && joinCode.trim() ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif" }}>
            Katıl →
          </button>
        </div>
        {sock.socketError && (
          <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 13, fontWeight: 500 }}>
            ⚠️ {sock.socketError === 'Masa bulunamdı' || sock.socketError === 'Masa bulunamadı'
              ? 'Masa bulunamadı. Kod yanlış olabilir veya masa kapanmış olabilir.'
              : sock.socketError}
          </div>
        )}
        {!sock.isRegistered && !sock.isConnected && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            ⏳ Sunucuya bağlanıldıktan sonra katılabilirsin.
          </div>
        )}
      </div>

      {/* Public rooms grid */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: 18, fontWeight: 700, margin: 0 }}>
            🟢 Açık Masalar
            {sock.publicRooms && sock.publicRooms.length > 0 && (
              <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 600, color: '#6366f1', background: 'rgba(99,102,241,0.1)', borderRadius: 8, padding: '2px 8px' }}>
                {sock.publicRooms.length}
              </span>
            )}
          </h2>
          <button onClick={sock.fetchPublicRooms} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            🔄 Yenile
          </button>
        </div>
        {(!sock.publicRooms || sock.publicRooms.length === 0) ? (
          <div style={{ textAlign: 'center', padding: '24px 16px', background: 'var(--surface)', borderRadius: 12, border: '1px dashed var(--border)', color: 'var(--text-secondary)', fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎮</div>
            <div>Şu an açık masa yok.</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Yukarıdan bir oyun seçerek masa oluşturabilirsin!</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {sock.publicRooms.slice(0, 15).map(function(room) {
              const isFull = room.players >= room.maxPlayers;
              return (
                <div key={room.id} style={{ display: 'flex', flexDirection: 'column', padding: '12px 10px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', gap: 6, opacity: isFull ? 0.6 : 1 }}>
                  <div style={{ fontSize: 20, textAlign: 'center' }}>{gameIcons[room.gameId] || '🎮'}</div>
                  <div style={{ fontWeight: 700, fontSize: 12, textAlign: 'center', lineHeight: 1.2 }}>{room.gameName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>{room.hostName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>
                    <span style={{ color: room.players < room.maxPlayers ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{room.players}</span>/{room.maxPlayers}
                  </div>
                  <button
                    onClick={function() { if (!isFull) handleJoinPublicRoom(room.id); }}
                    disabled={!sock.isRegistered || isFull}
                    style={{ padding: '7px 4px', borderRadius: 8, border: 'none', background: !isFull && sock.isRegistered ? '#6366f1' : '#ccc', color: '#fff', fontWeight: 700, fontSize: 12, cursor: !isFull && sock.isRegistered ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif" }}>
                    {isFull ? 'Dolu' : 'Katıl →'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Privacy Modal */}
      {showPrivacyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div style={{ background: 'var(--bg)', borderRadius: 20, padding: 28, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Sora', sans-serif", marginBottom: 8 }}>
              {gameIcons[selectedMPGame]} {gameNames[selectedMPGame]}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>Masani nasil acmak istersin?</div>
            <button onClick={function() { handleCreateRoom(true); }}
              style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>
              Herkese Acik
              <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>Ana sayfada gorunur, herkes katilabilir</div>
            </button>
            <button onClick={function() { handleCreateRoom(false); }}
              style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #374151, #6B7280)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>
              Gizli (Sadece Davetli)
              <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>Link veya kod ile katilim</div>
            </button>
            <button onClick={function() { setShowPrivacyModal(false); }}
              style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>
              Iptal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
// ============================================================
// GAME: 2048
// ============================================================
const TILE_COLORS = {
  2: { bg: '#EEE4DA', color: '#776E65' },
  4: { bg: '#EDE0C8', color: '#776E65' },
  8: { bg: '#F2B179', color: '#F9F6F2' },
  16: { bg: '#F59563', color: '#F9F6F2' },
  32: { bg: '#F67C5F', color: '#F9F6F2' },
  64: { bg: '#F65E3B', color: '#F9F6F2' },
  128: { bg: '#EDCF72', color: '#F9F6F2' },
  256: { bg: '#EDCC61', color: '#F9F6F2' },
  512: { bg: '#EDC850', color: '#F9F6F2' },
  1024: { bg: '#EDC53F', color: '#F9F6F2' },
  2048: { bg: '#EDC22E', color: '#F9F6F2' },
};

function init2048Grid() {
  const g = Array(16).fill(0);
  return addRandom2048(addRandom2048(g));
}

function addRandom2048(grid) {
  const empty = grid.map((v, i) => v === 0 ? i : -1).filter(i => i >= 0);
  if (!empty.length) return grid;
  const idx = empty[Math.floor(Math.random() * empty.length)];
  const ng = [...grid];
  ng[idx] = Math.random() < 0.9 ? 2 : 4;
  return ng;
}

function slide2048Row(row) {
  const nonZero = row.filter(v => v !== 0);
  const merged = [];
  let score = 0;
  let i = 0;
  while (i < nonZero.length) {
    if (i + 1 < nonZero.length && nonZero[i] === nonZero[i + 1]) {
      merged.push(nonZero[i] * 2);
      score += nonZero[i] * 2;
      i += 2;
    } else {
      merged.push(nonZero[i]);
      i++;
    }
  }
  while (merged.length < 4) merged.push(0);
  return { row: merged, score };
}

function move2048(grid, dir) {
  const flat = [...grid];
  let totalScore = 0;
  let changed = false;

  const getRow = (r) => [flat[r*4], flat[r*4+1], flat[r*4+2], flat[r*4+3]];
  const getCol = (c) => [flat[c], flat[4+c], flat[8+c], flat[12+c]];
  const setRow = (r, row) => { row.forEach((v,i) => { flat[r*4+i] = v; }); };
  const setCol = (c, col) => { col.forEach((v,i) => { flat[i*4+c] = v; }); };

  if (dir === 'left') {
    for (let r = 0; r < 4; r++) {
      const orig = getRow(r).join();
      const { row, score } = slide2048Row(getRow(r));
      if (row.join() !== orig) changed = true;
      setRow(r, row); totalScore += score;
    }
  } else if (dir === 'right') {
    for (let r = 0; r < 4; r++) {
      const orig = getRow(r).join();
      const { row, score } = slide2048Row([...getRow(r)].reverse());
      const result = [...row].reverse();
      if (result.join() !== orig) changed = true;
      setRow(r, result); totalScore += score;
    }
  } else if (dir === 'up') {
    for (let c = 0; c < 4; c++) {
      const orig = getCol(c).join();
      const { row, score } = slide2048Row(getCol(c));
      if (row.join() !== orig) changed = true;
      setCol(c, row); totalScore += score;
    }
  } else if (dir === 'down') {
    for (let c = 0; c < 4; c++) {
      const orig = getCol(c).join();
      const { row, score } = slide2048Row([...getCol(c)].reverse());
      const result = [...row].reverse();
      if (result.join() !== orig) changed = true;
      setCol(c, result); totalScore += score;
    }
  }
  return { grid: flat, score: totalScore, changed };
}

function hasNoMoves2048(grid) {
  if (grid.includes(0)) return false;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const v = grid[r*4+c];
      if (c < 3 && grid[r*4+c+1] === v) return false;
      if (r < 3 && grid[(r+1)*4+c] === v) return false;
    }
  }
  return true;
}

function Game2048({ game, onGameEnd, soundOn }) {
  const [grid, setGrid] = useState(init2048Grid);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => {
    try { return parseInt(localStorage.getItem('oyunclub_2048_best') || '0'); } catch { return 0; }
  });
  const [won, setWon] = useState(false);
  const [over, setOver] = useState(false);
  const [wonDismissed, setWonDismissed] = useState(false);
  const touchStartRef = useRef(null);

  const handleMove = useCallback((dir) => {
    if (over || (won && !wonDismissed)) return;
    setGrid(prev => {
      const { grid: ng, score: s, changed } = move2048(prev, dir);
      if (!changed) return prev;
      if (soundOn) playSound('place');
      const withNew = addRandom2048(ng);
      setScore(sc => {
        const ns = sc + s;
        setBest(b => {
          const nb = Math.max(b, ns);
          try { localStorage.setItem('oyunclub_2048_best', String(nb)); } catch {}
          return nb;
        });
        return ns;
      });
      if (withNew.includes(2048) && !won) {
        setWon(true);
        if (soundOn) playSound('win');
        onGameEnd('win');
      } else if (hasNoMoves2048(withNew)) {
        setOver(true);
        if (soundOn) playSound('lose');
        onGameEnd('loss');
      }
      return withNew;
    });
  }, [over, won, wonDismissed, soundOn, onGameEnd]);

  useEffect(() => {
    const onKey = (e) => {
      const map = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down',
        a:'left', d:'right', w:'up', s:'down', A:'left', D:'right', W:'up', S:'down' };
      if (map[e.key]) { e.preventDefault(); handleMove(map[e.key]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleMove]);

  const handleTouchStart = (e) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const handleTouchEnd = (e) => {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) handleMove(dx > 0 ? 'right' : 'left');
    else handleMove(dy > 0 ? 'down' : 'up');
    touchStartRef.current = null;
  };

  const restart = () => {
    setGrid(init2048Grid());
    setScore(0);
    setWon(false);
    setOver(false);
    setWonDismissed(false);
  };

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '16px 12px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 32, letterSpacing: -2 }}>2048</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['PUAN', score], ['EN İYİ', best]].map(([label, val]) => (
            <div key={label} style={{ background: '#BBADA0', borderRadius: 6, padding: '6px 14px', color: '#F9F6F2', fontWeight: 700, minWidth: 70 }}>
              <div style={{ fontSize: 11, opacity: 0.8 }}>{label}</div>
              <div style={{ fontSize: 18 }}>{val}</div>
            </div>
          ))}
          <Button onClick={restart} style={{ padding: '6px 12px', fontSize: 13 }}>Yeni</Button>
        </div>
      </div>

      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ background: '#BBADA0', borderRadius: 12, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, userSelect: 'none', touchAction: 'none' }}
      >
        {grid.map((v, i) => {
          const tc = TILE_COLORS[v] || { bg: '#3C3A32', color: '#F9F6F2' };
          return (
            <div key={i} style={{
              background: v ? tc.bg : '#CDC1B4',
              color: tc.color,
              borderRadius: 6,
              aspectRatio: '1',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800,
              fontSize: v >= 1024 ? 18 : v >= 128 ? 22 : v >= 16 ? 26 : 30,
              fontFamily: "'Sora',sans-serif",
              transition: 'background 0.1s',
            }}>
              {v || ''}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
        {[['↑','up'],['↓','down'],['←','left'],['→','right']].map(([label, dir]) => (
          <button key={dir} onClick={() => handleMove(dir)} style={{
            width: 48, height: 48, borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', fontSize: 20, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{label}</button>
        ))}
      </div>

      {won && !wonDismissed && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <Card style={{ padding: 32, textAlign: 'center', maxWidth: 280 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
            <h2 style={{ fontFamily: "'Sora',sans-serif", fontSize: 24, fontWeight: 800, marginBottom: 8 }}>2048!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>Tebrikler! Devam edebilirsin.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <Button onClick={restart}>Yeni Oyun</Button>
              <Button variant="secondary" onClick={() => setWonDismissed(true)}>Devam Et</Button>
            </div>
          </Card>
        </div>
      )}
      {over && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <Card style={{ padding: 32, textAlign: 'center', maxWidth: 280 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>😔</div>
            <h2 style={{ fontFamily: "'Sora',sans-serif", fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Oyun Bitti</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>Puan: {score}</p>
            <Button onClick={restart}>Tekrar Oyna</Button>
          </Card>
        </div>
      )}
    </div>
  );
}

// ============================================================
// GAME: WORDLE (Turkish)
// ============================================================
const WORDLE_WORDS = ['ALTIN','ARABA','ASLAN','AYRAN','BADEM','BALIK','BANKA','BEBEK','BEYAZ','BILGI','BORSA','BULUT','CEVAP','DERIN','DEVAM','DILEK','DUMAN','DURUM','EKMEK','ELMAS','ERKEN','FENER','GUNES','HABER','HAFIF','INSAN','KALEM','KANAT','KARAR','KAYAK','KENAR','KILIM','KITAP','KOPEK','KURUL','LAKIN','LIMON','MAKAS','MASAL','MERAK','MISIR','NEDEN','NEFES','NIYET','OKUMA','PAZAR','RESIM','SANAT','SIMIT','TARAF','TABAK','UZMAN','VAKIT','VATAN','YAZAR','YILAN','YOLCU','YORUM','ZAMAN','ZEMIN','ALACA','DAIRE','EKRAN','FIYAT','MOTOR','OLGUN','PANEL','RADAR','TAKIM'];

function WordleGame({ game, onGameEnd, soundOn }) {
  const [target, setTarget] = useState(() => WORDLE_WORDS[Math.floor(Math.random() * WORDLE_WORDS.length)]);
  const [guesses, setGuesses] = useState([]);
  const [current, setCurrent] = useState('');
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState('');
  const [usedKeys, setUsedKeys] = useState({});

  const showMsg = (msg, dur = 2000) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), dur);
  };

  const submitGuess = useCallback(() => {
    if (current.length !== 5) { showMsg('5 harf gir!'); return; }
    if (gameOver) return;
    const newGuess = current.toUpperCase();
    const result = Array(5).fill('absent');
    const targetArr = target.split('');
    const guessArr = newGuess.split('');
    const used = [...targetArr];
    for (let i = 0; i < 5; i++) {
      if (guessArr[i] === targetArr[i]) { result[i] = 'correct'; used[i] = null; }
    }
    for (let i = 0; i < 5; i++) {
      if (result[i] === 'correct') continue;
      const idx = used.indexOf(guessArr[i]);
      if (idx !== -1) { result[i] = 'present'; used[idx] = null; }
    }
    const newUsedKeys = { ...usedKeys };
    const priority = { correct: 3, present: 2, absent: 1 };
    for (let i = 0; i < 5; i++) {
      const k = guessArr[i];
      if (!newUsedKeys[k] || priority[result[i]] > priority[newUsedKeys[k]]) {
        newUsedKeys[k] = result[i];
      }
    }
    setUsedKeys(newUsedKeys);
    const newGuesses = [...guesses, { word: newGuess, result }];
    setGuesses(newGuesses);
    setCurrent('');
    if (newGuess === target) {
      setGameOver(true);
      if (soundOn) playSound('win');
      onGameEnd('win');
      showMsg('Tebrikler! 🎉', 3000);
    } else if (newGuesses.length >= 6) {
      setGameOver(true);
      if (soundOn) playSound('lose');
      onGameEnd('loss');
      showMsg('Kelime: ' + target, 4000);
    }
  }, [current, guesses, gameOver, target, usedKeys, soundOn, onGameEnd]);

  useEffect(() => {
    const onKey = (e) => {
      if (gameOver) return;
      if (e.key === 'Enter') { submitGuess(); return; }
      if (e.key === 'Backspace') { setCurrent(c => c.slice(0, -1)); return; }
      let ch = e.key.toUpperCase();
      if (ch === 'I') ch = 'İ';
      if (/^[A-ZÇĞİÖŞÜ]$/.test(ch) && current.length < 5) setCurrent(c => c + ch);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submitGuess, gameOver, current]);

  const reset = () => {
    setTarget(WORDLE_WORDS[Math.floor(Math.random() * WORDLE_WORDS.length)]);
    setGuesses([]); setCurrent(''); setGameOver(false); setMessage(''); setUsedKeys({});
  };

  const colorMap = { correct: '#538D4E', present: '#B59F3B', absent: '#3A3A3C' };
  const rows = [...guesses];
  while (rows.length < 6) rows.push(null);

  const KB_ROWS = [
    ['E','R','T','Y','U','I','O','P','Ğ','Ü'],
    ['A','S','D','F','G','H','J','K','L','Ş','İ'],
    ['GİR','Z','X','C','V','B','N','M','Ö','Ç','⌫'],
  ];

  const keyColor = (k) => {
    const s = usedKeys[k];
    if (s === 'correct') return '#538D4E';
    if (s === 'present') return '#B59F3B';
    if (s === 'absent') return '#3A3A3C';
    return 'var(--surface)';
  };

  const handleKbKey = (k) => {
    if (gameOver) return;
    if (k === 'GİR') { submitGuess(); return; }
    if (k === '⌫') { setCurrent(c => c.slice(0, -1)); return; }
    if (current.length < 5) setCurrent(c => c + k);
  };

  return (
    <div style={{ maxWidth: 380, margin: '0 auto', padding: '16px 12px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: -1 }}>Wordle TR</h2>
        <Button onClick={reset} style={{ fontSize: 13, padding: '6px 12px' }}>Yeni Kelime</Button>
      </div>

      {message && (
        <div style={{ background: 'var(--text)', color: 'var(--bg)', borderRadius: 8, padding: '8px 16px', marginBottom: 12, fontWeight: 600, animation: 'fadeUp 0.3s ease' }}>
          {message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateRows: 'repeat(6,1fr)', gap: 6, marginBottom: 16 }}>
        {rows.map((row, ri) => {
          const isCurrentRow = !row && ri === guesses.length && !gameOver;
          return (
            <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
              {Array(5).fill(0).map((_, ci) => {
                const letter = row ? row.word[ci] : (isCurrentRow ? current[ci] || '' : '');
                const status = row ? row.result[ci] : null;
                return (
                  <div key={ci} style={{
                    aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `2px solid ${status ? 'transparent' : letter ? '#999' : 'var(--border)'}`,
                    background: status ? colorMap[status] : 'var(--surface)',
                    color: status ? '#FFF' : 'var(--text)',
                    fontWeight: 800, fontSize: 22, borderRadius: 4,
                    fontFamily: "'Sora',sans-serif",
                    transition: 'background 0.3s',
                  }}>
                    {letter}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        {KB_ROWS.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 5 }}>
            {row.map(k => (
              <button key={k} onClick={() => handleKbKey(k)} style={{
                minWidth: k.length > 1 ? 54 : 34, height: 52, borderRadius: 6,
                border: '1px solid var(--border)',
                background: usedKeys[k] ? keyColor(k) : 'var(--surface)',
                color: usedKeys[k] ? '#FFF' : 'var(--text)',
                fontWeight: 700, fontSize: k.length > 1 ? 11 : 14, cursor: 'pointer',
                fontFamily: "'DM Sans',sans-serif",
              }}>
                {k}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// GAME: DAMA (Turkish Checkers vs Bot)
// ============================================================
function initDamaBoard() {
  const board = Array(64).fill(null);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) board[r*8+c] = { color: 'black', king: false };
    }
  }
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) board[r*8+c] = { color: 'white', king: false };
    }
  }
  return board;
}

function getDamaMoves(board, r, c) {
  const piece = board[r*8+c];
  if (!piece) return [];
  const moves = [];
  const dirs = piece.king ? [[-1,-1],[-1,1],[1,-1],[1,1]] :
    piece.color === 'white' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];

  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
    const target = board[nr*8+nc];
    if (!target) {
      moves.push({ from: [r,c], to: [nr,nc], capture: null });
    } else if (target.color !== piece.color) {
      const jr = nr + dr, jc = nc + dc;
      if (jr >= 0 && jr <= 7 && jc >= 0 && jc <= 7 && !board[jr*8+jc]) {
        moves.push({ from: [r,c], to: [jr,jc], capture: [nr,nc] });
      }
    }
  }
  return moves;
}

function getAllDamaMoves(board, color) {
  const moves = [];
  const captures = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r*8+c];
      if (!p || p.color !== color) continue;
      const ms = getDamaMoves(board, r, c);
      for (const m of ms) {
        if (m.capture) captures.push(m);
        else moves.push(m);
      }
    }
  }
  return captures.length > 0 ? captures : moves;
}

function applyDamaMove(board, move) {
  const nb = [...board];
  const piece = { ...nb[move.from[0]*8+move.from[1]] };
  nb[move.from[0]*8+move.from[1]] = null;
  if (move.capture) nb[move.capture[0]*8+move.capture[1]] = null;
  const [tr, tc] = move.to;
  if ((piece.color === 'white' && tr === 0) || (piece.color === 'black' && tr === 7)) piece.king = true;
  nb[tr*8+tc] = piece;
  return nb;
}

function DamaGame({ game, onGameEnd, soundOn }) {
  const [board, setBoard] = useState(initDamaBoard);
  const [selected, setSelected] = useState(null);
  const [turn, setTurn] = useState('white');
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [validMoves, setValidMoves] = useState([]);

  const checkWin = (b, nextTurn) => {
    const blacks = b.filter(p => p?.color === 'black').length;
    const whites = b.filter(p => p?.color === 'white').length;
    if (blacks === 0) return 'white';
    if (whites === 0) return 'black';
    if (getAllDamaMoves(b, nextTurn).length === 0) return nextTurn === 'white' ? 'black' : 'white';
    return null;
  };

  const handleCellClick = (r, c) => {
    if (gameOver || turn !== 'white' || botThinking) return;
    const piece = board[r*8+c];

    if (selected) {
      const move = validMoves.find(m => m.to[0] === r && m.to[1] === c);
      if (move) {
        const nb = applyDamaMove(board, move);
        if (soundOn) playSound('place');
        setBoard(nb);
        setSelected(null);
        setValidMoves([]);
        const winner = checkWin(nb, 'black');
        if (winner) {
          setGameOver(true);
          setWon(winner === 'white');
          onGameEnd(winner === 'white' ? 'win' : 'loss');
          if (soundOn) playSound(winner === 'white' ? 'win' : 'lose');
          return;
        }
        setTurn('black');
        setBotThinking(true);
        setTimeout(() => {
          const botMoves = getAllDamaMoves(nb, 'black');
          if (botMoves.length > 0) {
            const botMove = botMoves[Math.floor(Math.random() * botMoves.length)];
            const nb2 = applyDamaMove(nb, botMove);
            if (soundOn) playSound('place');
            setBoard(nb2);
            const winner2 = checkWin(nb2, 'white');
            if (winner2) {
              setGameOver(true);
              setWon(winner2 === 'white');
              onGameEnd(winner2 === 'white' ? 'win' : 'loss');
              if (soundOn) playSound(winner2 === 'white' ? 'win' : 'lose');
            } else {
              setTurn('white');
            }
          } else {
            setTurn('white');
          }
          setBotThinking(false);
        }, 500);
        return;
      }
      if (piece?.color === 'white') {
        setSelected([r, c]);
        const allMoves = getAllDamaMoves(board, 'white');
        const hasCaptures = allMoves.some(m => m.capture);
        const pieceMoves = getDamaMoves(board, r, c);
        setValidMoves(hasCaptures ? pieceMoves.filter(m => m.capture) : pieceMoves);
        return;
      }
      setSelected(null);
      setValidMoves([]);
      return;
    }

    if (piece?.color === 'white') {
      setSelected([r, c]);
      const allMoves = getAllDamaMoves(board, 'white');
      const hasCaptures = allMoves.some(m => m.capture);
      const pieceMoves = getDamaMoves(board, r, c);
      setValidMoves(hasCaptures ? pieceMoves.filter(m => m.capture) : pieceMoves);
    }
  };

  const restart = () => {
    setBoard(initDamaBoard());
    setSelected(null);
    setTurn('white');
    setGameOver(false);
    setWon(false);
    setBotThinking(false);
    setValidMoves([]);
  };

  const whites = board.filter(p => p?.color === 'white').length;
  const blacks = board.filter(p => p?.color === 'black').length;

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '16px 12px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 24 }}>⚫ Dama</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 14 }}>⚪{whites} ⚫{blacks}</span>
          <Button onClick={restart} style={{ fontSize: 13, padding: '6px 12px' }}>Yeni</Button>
        </div>
      </div>

      <div style={{ marginBottom: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
        {botThinking ? '🤖 Bot düşünüyor...' : turn === 'white' ? '⚪ Senin sıran' : '⚫ Botun sırası'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 0, border: '2px solid var(--border)', borderRadius: 8, overflow: 'hidden', aspectRatio: '1' }}>
        {Array(64).fill(0).map((_, i) => {
          const r = Math.floor(i / 8), c = i % 8;
          const isDark = (r + c) % 2 === 1;
          const piece = board[i];
          const isSel = selected && selected[0] === r && selected[1] === c;
          const isValid = validMoves.some(m => m.to[0] === r && m.to[1] === c);
          return (
            <div
              key={i}
              onClick={() => handleCellClick(r, c)}
              style={{
                background: isDark ? '#8B4513' : '#F4A460',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: isDark ? 'pointer' : 'default',
                position: 'relative',
                outline: isSel ? '3px solid #FFD700' : isValid ? '3px solid #7FFF00' : 'none',
                outlineOffset: -3,
              }}
            >
              {isValid && !piece && <div style={{ width: '30%', height: '30%', borderRadius: '50%', background: 'rgba(127,255,0,0.5)' }} />}
              {piece && (
                <div style={{
                  width: '75%', height: '75%', borderRadius: '50%',
                  background: piece.color === 'white' ? '#F0F0F0' : '#1A1A1A',
                  border: '2px solid ' + (piece.color === 'white' ? '#CCC' : '#444'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: piece.king ? 12 : 0,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                }}>
                  {piece.king ? '♛' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {gameOver && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <Card style={{ padding: 32, textAlign: 'center', maxWidth: 280 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>{won ? '🏆' : '😔'}</div>
            <h2 style={{ fontFamily: "'Sora',sans-serif", fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
              {won ? 'Kazandın!' : 'Kaybettin!'}
            </h2>
            <Button onClick={restart}>Tekrar Oyna</Button>
          </Card>
        </div>
      )}
    </div>
  );
}

// ============================================================
// GAME: SUDOKU
// ============================================================
const SUDOKU_PUZZLES = [
  { puzzle: '530070000600195000098000060800060003400803001700020006060000280000419005000080079', solution: '534678912672195348198342567859761423426853791713924856961537284287419635345286179' },
  { puzzle: '010020300004005060070000008006900070000304000050007200700000030080200100005040020', solution: '619823745284915367375467918436958271521374896857621439768149523943286157195742386' },
  { puzzle: '200070038000006070300040600008020700100000006007030400004080009060700000930060002', solution: '214976538589136274367548619648329751153784926927651483731865492896412357935267142' },
];

function SudokuGame({ game, onGameEnd, soundOn }) {
  const [puzzleIdx, setPuzzleIdx] = useState(() => Math.floor(Math.random() * SUDOKU_PUZZLES.length));
  const { puzzle, solution } = SUDOKU_PUZZLES[puzzleIdx];
  const initial = puzzle.split('').map(Number);
  const sol = solution.split('').map(Number);

  const [values, setValues] = useState(() => [...initial]);
  const [selected, setSelected] = useState(null);
  const [errors, setErrors] = useState(new Set());
  const [won, setWon] = useState(false);
  const [mistakeCount, setMistakeCount] = useState(0);
  const MAX_MISTAKES = 3;

  const getBoxIdx = (r, c) => Math.floor(r/3)*3 + Math.floor(c/3);

  const checkErrors = (vals) => {
    const errs = new Set();
    for (let i = 0; i < 81; i++) {
      if (vals[i] === 0) continue;
      const r = Math.floor(i/9), c = i%9, b = getBoxIdx(r,c);
      for (let j = 0; j < 81; j++) {
        if (j === i || vals[j] !== vals[i]) continue;
        const rj = Math.floor(j/9), cj = j%9, bj = getBoxIdx(rj,cj);
        if (rj === r || cj === c || bj === b) { errs.add(i); errs.add(j); }
      }
    }
    return errs;
  };

  const handleInput = (num) => {
    if (selected === null || won || mistakeCount >= MAX_MISTAKES) return;
    const idx = selected;
    if (initial[idx] !== 0) return;
    const nv = [...values];
    nv[idx] = num;
    if (soundOn) playSound('place');
    setValues(nv);
    const errs = checkErrors(nv);
    setErrors(errs);
    // Count new mistakes: cells that are wrong vs solution
    const wrongCells = nv.filter((v, i) => v !== 0 && v !== sol[i]).length;
    const newMistakes = wrongCells;
    // Track when a new wrong cell is placed
    if (num !== 0 && nv[idx] !== sol[idx]) {
      playHaptic('wrong');
      const nm = mistakeCount + 1;
      setMistakeCount(nm);
      if (nm >= MAX_MISTAKES) {
        if (soundOn) playSound('lose');
        setTimeout(() => onGameEnd('loss'), 800);
      }
    }
    if (nv.every((v, i) => v === sol[i])) {
      setWon(true);
      if (soundOn) playSound('win');
      playHaptic('win');
      onGameEnd('win');
    }
  };

  const restart = () => {
    const ni = (puzzleIdx + 1) % SUDOKU_PUZZLES.length;
    const np = SUDOKU_PUZZLES[ni].puzzle.split('').map(Number);
    setPuzzleIdx(ni);
    setValues([...np]);
    setSelected(null);
    setErrors(new Set());
    setWon(false);
    setMistakeCount(0);
  };

  const selR = selected !== null ? Math.floor(selected/9) : -1;
  const selC = selected !== null ? selected%9 : -1;
  const selB = selected !== null ? getBoxIdx(selR, selC) : -1;

  return (
    <div style={{ maxWidth: 380, margin: '0 auto', padding: '16px 12px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 24 }}>🔲 Sudoku</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[0,1,2].map(function(n) {
              return <div key={n} style={{ width: 12, height: 12, borderRadius: '50%', background: n < mistakeCount ? '#E63946' : 'var(--border)' }} />;
            })}
          </div>
          <span style={{ fontSize: 12, color: mistakeCount >= MAX_MISTAKES ? '#E63946' : 'var(--text-secondary)', fontWeight: 700 }}>
            {mistakeCount}/{MAX_MISTAKES} hata
          </span>
          <Button onClick={restart} style={{ fontSize: 13, padding: '6px 12px' }}>Yeni</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9,1fr)', gap: 1, background: 'var(--border)', border: '2px solid var(--text)', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
        {values.map((v, i) => {
          const r = Math.floor(i/9), c = i%9;
          const isFixed = initial[i] !== 0;
          const isSel = i === selected;
          const isHighlight = r === selR || c === selC || getBoxIdx(r,c) === selB;
          const isErr = errors.has(i);
          return (
            <div
              key={i}
              onClick={() => setSelected(i)}
              style={{
                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isSel ? '#4285F4' : isErr ? '#FFCCCC' : isHighlight ? 'rgba(66,133,244,0.1)' : 'var(--surface)',
                color: isSel ? '#FFF' : isErr ? '#E63946' : isFixed ? 'var(--text)' : '#4285F4',
                fontWeight: isFixed ? 700 : 600,
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: "'DM Sans',sans-serif",
                borderRight: (c+1) % 3 === 0 && c !== 8 ? '2px solid var(--text)' : '1px solid var(--border)',
                borderBottom: (r+1) % 3 === 0 && r !== 8 ? '2px solid var(--text)' : '1px solid var(--border)',
              }}
            >
              {v || ''}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, maxWidth: 260, margin: '0 auto' }}>
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <button key={n} onClick={() => handleInput(n)} style={{
            aspectRatio: '1', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', fontSize: 18, fontWeight: 700,
            cursor: 'pointer', fontFamily: "'Sora',sans-serif",
          }}>{n}</button>
        ))}
        <button onClick={() => handleInput(0)} style={{
          aspectRatio: '1', borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 16, fontWeight: 700,
          cursor: 'pointer',
        }}>✕</button>
      </div>

      {won && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <Card style={{ padding: 32, textAlign: 'center', maxWidth: 280 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
            <h2 style={{ fontFamily: "'Sora',sans-serif", fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Tebrikler!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>Sudoku'yu çözdün!</p>
            <Button onClick={restart}>Yeni Bulmaca</Button>
          </Card>
        </div>
      )}
    </div>
  );
}

// ============================================================
// GAME: CONNECT FOUR (4 Sıra)
// ============================================================
const COLS = 7, ROWS = 6;
function initC4Board() { return Array(ROWS * COLS).fill(null); }
function checkC4Win(board, color) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      if (board[i] !== color) continue;
      if (c + 3 < COLS && board[i+1] === color && board[i+2] === color && board[i+3] === color) return true;
      if (r + 3 < ROWS && board[i+COLS] === color && board[i+2*COLS] === color && board[i+3*COLS] === color) return true;
      if (r + 3 < ROWS && c + 3 < COLS && board[i+COLS+1] === color && board[i+2*COLS+2] === color && board[i+3*COLS+3] === color) return true;
      if (r + 3 < ROWS && c - 3 >= 0 && board[i+COLS-1] === color && board[i+2*COLS-2] === color && board[i+3*COLS-3] === color) return true;
    }
  }
  return false;
}
function dropC4(board, col, color) {
  const nb = [...board];
  for (let r = ROWS - 1; r >= 0; r--) {
    if (!nb[r * COLS + col]) { nb[r * COLS + col] = color; return nb; }
  }
  return null;
}
function c4BotMove(board) {
  const bot = 'yellow', human = 'red';
  for (let c = 0; c < COLS; c++) { const nb = dropC4(board, c, bot); if (nb && checkC4Win(nb, bot)) return c; }
  for (let c = 0; c < COLS; c++) { const nb = dropC4(board, c, human); if (nb && checkC4Win(nb, human)) return c; }
  const center = [3,2,4,1,5,0,6];
  for (const c of center) { const nb = dropC4(board, c, bot); if (nb) return c; }
  return 0;
}

function ConnectFourGame({ game, onGameEnd, soundOn, onlineProps, onGoOnline }) {
  const [board, setBoard] = useState(initC4Board);
  const [turn, setTurn] = useState('red');
  const [winner, setWinner] = useState(null);
  const [isDraw, setIsDraw] = useState(false);
  const [mode, setMode] = useState(onlineProps ? 'online' : null);
  const [botThinking, setBotThinking] = useState(false);
  const [hoverCol, setHoverCol] = useState(null);

  // Online: apply remote moves
  useEffect(function() {
    if (!onlineProps || !onlineProps.remoteMove) return;
    var mv = onlineProps.remoteMove;
    if (mv.type === 'drop' && typeof mv.playerIndex !== 'undefined' && mv.playerIndex !== onlineProps.myIndex) {
      setBoard(function(prev) {
        var nb = dropC4(prev, mv.col, mv.color);
        if (!nb) return prev;
        if (checkC4Win(nb, mv.color)) { setWinner(mv.color); }
        else if (nb.every(Boolean)) { setIsDraw(true); }
        else { setTurn(mv.color === 'red' ? 'yellow' : 'red'); }
        return nb;
      });
    }
  }, [onlineProps && onlineProps.remoteMove && onlineProps.remoteMove._ts]);

  const P1 = { color: 'red', label: '🔴 Sen', labelShort: '🔴' };
  const P2bot = { color: 'yellow', label: '🤖 Bot', labelShort: '🤖' };
  const P2local = { color: 'yellow', label: '🟡 Oyuncu 2', labelShort: '🟡' };
  const P2 = mode === 'bot' ? P2bot : P2local;

  const drop = (col) => {
    if (onlineProps) {
      var myColor = onlineProps.myIndex === 0 ? 'red' : 'yellow';
      if (winner || isDraw || turn !== myColor) return;
      const nb = dropC4(board, col, myColor);
      if (!nb) return;
      if (soundOn) playSound('place');
      if (checkC4Win(nb, myColor)) { setBoard(nb); setWinner(myColor); onGameEnd(myColor === 'red' ? 'win' : 'loss'); if (soundOn) playSound('win'); }
      else if (nb.every(Boolean)) { setBoard(nb); setIsDraw(true); onGameEnd('draw'); }
      else { setBoard(nb); setTurn(myColor === 'red' ? 'yellow' : 'red'); }
      onlineProps.onMove({ type: 'drop', col: col, color: myColor, playerIndex: onlineProps.myIndex, _ts: Date.now() });
      return;
    }
    if (!mode || winner || isDraw || botThinking) return;
    if (mode === 'bot' && turn !== 'red') return;
    const nb = dropC4(board, col, turn);
    if (!nb) return;
    if (soundOn) playSound('place');
    if (checkC4Win(nb, turn)) {
      setBoard(nb);
      setWinner(turn);
      onGameEnd(turn === 'red' ? 'win' : 'loss');
      if (soundOn) playSound(turn === 'red' ? 'win' : 'lose');
      return;
    }
    if (nb.every(Boolean)) { setBoard(nb); setIsDraw(true); onGameEnd('draw'); return; }
    const next = turn === 'red' ? 'yellow' : 'red';
    setBoard(nb);
    setTurn(next);
    if (mode === 'bot' && next === 'yellow') {
      setBotThinking(true);
      setTimeout(() => {
        const bc = c4BotMove(nb);
        const nb2 = dropC4(nb, bc, 'yellow');
        if (soundOn) playSound('place');
        if (checkC4Win(nb2, 'yellow')) {
          setBoard(nb2); setWinner('yellow');
          onGameEnd('loss');
          if (soundOn) playSound('lose');
        } else if (nb2.every(Boolean)) {
          setBoard(nb2); setIsDraw(true); onGameEnd('draw');
        } else {
          setBoard(nb2); setTurn('red');
        }
        setBotThinking(false);
      }, 400);
    }
  };

  const restart = () => {
    setBoard(initC4Board()); setTurn('red'); setWinner(null); setIsDraw(false); setBotThinking(false); setHoverCol(null);
  };

  if (!mode && !onlineProps) return (
    <div style={{ maxWidth: 380, margin: '0 auto', padding: '32px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>🔵🔴</div>
      <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 26, marginBottom: 8 }}>4 Sıra</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 28, fontSize: 15 }}>4 taşı art arda diz, kazan!</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 280, margin: '0 auto' }}>
        {onGoOnline && (
          <button onClick={onGoOnline} style={{ padding: '16px 24px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#FFF', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: "'Sora',sans-serif" }}>
            🌐 Çevrimiçi Oyna
            <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.85, marginTop: 3 }}>Arkadaşını davet et</div>
          </button>
        )}
        <button onClick={() => setMode('bot')} style={{ padding: '16px 24px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#E63946,#F4845F)', color: '#FFF', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: "'Sora',sans-serif" }}>🤖 Bota Karşı</button>
        <button onClick={() => setMode('2p')} style={{ padding: '16px 24px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#059669,#34D399)', color: '#FFF', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: "'Sora',sans-serif" }}>📱 Aynı Cihazda 2 Kişi</button>
      </div>
    </div>
  );

  const CELL_COLOR = { red: '#E63946', yellow: '#F59E0B', null: null };
  const isColFull = (col) => board[col] !== null;

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: '12px 8px', touchAction: 'manipulation' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '0 4px' }}>
        <div>
          <span style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 20 }}>4 Sıra</span>
          <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--text-secondary)' }}>{mode === 'bot' ? 'vs Bot' : '2 Kişi'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!winner && !isDraw && (
            <div style={{ fontSize: 14, fontWeight: 600, color: turn === 'red' ? '#E63946' : '#F59E0B' }}>
              {botThinking ? '🤖 Düşünüyor...' : turn === 'red' ? `${P1.label} sırasında` : `${P2.label} sırasında`}
            </div>
          )}
          <button onClick={() => { restart(); setMode(null); }} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Menü</button>
          <button onClick={restart} style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: '#E63946', color: '#FFF', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Yeni</button>
        </div>
      </div>

      <div style={{ background: '#1D4ED8', borderRadius: 12, padding: 8, userSelect: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS},1fr)`, gap: 4, marginBottom: 6 }}>
          {Array(COLS).fill(0).map((_, c) => (
            <button key={c} onClick={() => drop(c)} disabled={isColFull(c) || !!winner || isDraw || botThinking} style={{ height: 32, borderRadius: 8, border: 'none', background: hoverCol === c && !isColFull(c) ? (turn === 'red' ? 'rgba(229,57,70,0.5)' : 'rgba(245,158,11,0.5)') : 'rgba(255,255,255,0.15)', cursor: isColFull(c) || winner || isDraw || botThinking ? 'default' : 'pointer', transition: 'background 0.15s', color: '#FFF', fontSize: 16 }}
              onMouseEnter={() => setHoverCol(c)} onMouseLeave={() => setHoverCol(null)}>
              {hoverCol === c && !isColFull(c) && !winner && !isDraw && !botThinking ? (turn === 'red' ? '🔴' : '🟡') : '↓'}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS},1fr)`, gridTemplateRows: `repeat(${ROWS},1fr)`, gap: 4 }}>
          {board.map((cell, i) => (
            <div key={i} style={{ aspectRatio: '1', borderRadius: '50%', background: cell ? CELL_COLOR[cell] : 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.1)', transition: 'background 0.15s', boxShadow: cell ? '0 2px 6px rgba(0,0,0,0.3)' : 'none' }} />
          ))}
        </div>
      </div>

      {(winner || isDraw) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 20, padding: '32px 28px', textAlign: 'center', maxWidth: 300, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 52, marginBottom: 8 }}>{isDraw ? '🤝' : winner === 'red' ? '🏆' : mode === 'bot' ? '🤖' : '🟡'}</div>
            <h2 style={{ fontFamily: "'Sora',sans-serif", fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
              {isDraw ? 'Berabere!' : winner === 'red' ? 'Kazandın!' : mode === 'bot' ? 'Bot Kazandı!' : 'Oyuncu 2 Kazandı!'}
            </h2>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
              <button onClick={restart} style={{ padding: '12px 20px', borderRadius: 12, border: 'none', background: '#E63946', color: '#FFF', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Tekrar</button>
              <button onClick={() => { restart(); setMode(null); }} style={{ padding: '12px 20px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Menü</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// GAME: BEŞ TAŞ (Gomoku 5-in-a-row)
// ============================================================
const GT_SIZE = 13;
function checkGomokuWin(board, r, c, color) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr,dc] of dirs) {
    let cnt = 1;
    for (let d=1;d<5;d++){const nr=r+dr*d,nc=c+dc*d;if(nr<0||nr>=GT_SIZE||nc<0||nc>=GT_SIZE||board[nr*GT_SIZE+nc]!==color)break;cnt++;}
    for (let d=1;d<5;d++){const nr=r-dr*d,nc=c-dc*d;if(nr<0||nr>=GT_SIZE||nc<0||nc>=GT_SIZE||board[nr*GT_SIZE+nc]!==color)break;cnt++;}
    if (cnt >= 5) return true;
  }
  return false;
}
function GomokuGame({ onGameEnd, soundOn, onlineProps, onGoOnline }) {
  const [board, setBoard] = useState(() => Array(GT_SIZE*GT_SIZE).fill(null));
  const [turn, setTurn] = useState('black');
  const [winner, setWinner] = useState(null);
  const [mode, setMode] = useState(onlineProps ? 'online' : null);
  const [botThinking, setBotThinking] = useState(false);
  const [lastMove, setLastMove] = useState(null);

  // Online: apply remote moves
  useEffect(function() {
    if (!onlineProps || !onlineProps.remoteMove) return;
    var mv = onlineProps.remoteMove;
    if (mv.type === 'place' && typeof mv.playerIndex !== 'undefined' && mv.playerIndex !== onlineProps.myIndex) {
      setBoard(function(prev) {
        if (prev[mv.idx]) return prev;
        var nb = [...prev]; nb[mv.idx] = mv.color;
        var r = Math.floor(mv.idx/GT_SIZE), c = mv.idx%GT_SIZE;
        if (checkGomokuWin(nb, r, c, mv.color)) { setWinner(mv.color); }
        setTurn(mv.color === 'black' ? 'white' : 'black');
        setLastMove(mv.idx);
        return nb;
      });
    }
  }, [onlineProps && onlineProps.remoteMove && onlineProps.remoteMove._ts]);

  const place = (idx) => {
    var isOnline = !!onlineProps;
    if (isOnline) {
      // In online mode: myIndex 0 = black, myIndex 1 = white
      var myColor = onlineProps.myIndex === 0 ? 'black' : 'white';
      if (board[idx] || winner || turn !== myColor) return;
      const nb = [...board]; nb[idx] = myColor;
      const r = Math.floor(idx/GT_SIZE), c = idx%GT_SIZE;
      if (soundOn) playSound('place');
      if (checkGomokuWin(nb, r, c, myColor)) {
        setBoard(nb); setWinner(myColor); setLastMove(idx);
        onGameEnd(myColor === 'black' ? 'win' : 'loss');
        if (soundOn) playSound('win');
      } else if (nb.every(Boolean)) {
        setBoard(nb); setWinner('draw'); onGameEnd('draw');
      } else {
        setBoard(nb); setTurn(myColor === 'black' ? 'white' : 'black'); setLastMove(idx);
      }
      onlineProps.onMove({ type: 'place', idx: idx, color: myColor, playerIndex: onlineProps.myIndex, _ts: Date.now() });
      return;
    }
    if (!mode || board[idx] || winner || botThinking) return;
    if (mode === 'bot' && turn === 'white') return;
    const nb = [...board]; nb[idx] = turn;
    const r = Math.floor(idx/GT_SIZE), c = idx%GT_SIZE;
    if (soundOn) playSound('place');
    if (checkGomokuWin(nb, r, c, turn)) {
      setBoard(nb); setWinner(turn); setLastMove(idx);
      onGameEnd(turn === 'black' ? 'win' : 'loss');
      if (soundOn) playSound(turn === 'black' ? 'win' : 'lose'); return;
    }
    if (nb.every(Boolean)) { setBoard(nb); setWinner('draw'); onGameEnd('draw'); return; }
    const next = turn === 'black' ? 'white' : 'black';
    setBoard(nb); setTurn(next); setLastMove(idx);
    if (mode === 'bot' && next === 'white') {
      setBotThinking(true);
      setTimeout(() => {
        const empty = nb.map((v,i)=>v?null:i).filter(i=>i!==null);
        const pick = empty[Math.floor(Math.random()*empty.length)];
        const nb2=[...nb]; nb2[pick]='white';
        if (soundOn) playSound('place');
        const pr=Math.floor(pick/GT_SIZE),pc=pick%GT_SIZE;
        if (checkGomokuWin(nb2,pr,pc,'white')) { setBoard(nb2); setWinner('white'); setLastMove(pick); onGameEnd('loss'); if(soundOn)playSound('lose'); }
        else { setBoard(nb2); setTurn('black'); setLastMove(pick); }
        setBotThinking(false);
      }, 350);
    }
  };
  const restart = () => { setBoard(Array(GT_SIZE*GT_SIZE).fill(null)); setTurn('black'); setWinner(null); setBotThinking(false); setLastMove(null); };
  if (!mode && !onlineProps) return (
    <div style={{maxWidth:380,margin:'0 auto',padding:'32px 16px',textAlign:'center'}}>
      <div style={{fontSize:48,marginBottom:8}}>⚫⚪</div>
      <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:24,marginBottom:6}}>Beş Taş</h2>
      <p style={{color:'var(--text-secondary)',marginBottom:24,fontSize:14}}>5 taşı art arda diz, kazan!</p>
      <div style={{display:'flex',flexDirection:'column',gap:12,maxWidth:260,margin:'0 auto'}}>
        {onGoOnline && (
          <button onClick={onGoOnline} style={{padding:'15px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',color:'#FFF',fontSize:15,fontWeight:700,cursor:'pointer'}}>
            🌐 Çevrimiçi Oyna
            <div style={{fontSize:11,fontWeight:400,opacity:0.85,marginTop:3}}>Arkadaşını davet et</div>
          </button>
        )}
        <button onClick={()=>setMode('bot')} style={{padding:'15px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#1A1A2E,#4B5563)',color:'#FFF',fontSize:15,fontWeight:700,cursor:'pointer'}}>🤖 Bota Karşı</button>
        <button onClick={()=>setMode('2p')} style={{padding:'15px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#059669,#34D399)',color:'#FFF',fontSize:15,fontWeight:700,cursor:'pointer'}}>📱 Aynı Cihazda 2 Kişi</button>
      </div>
    </div>
  );
  const cs = Math.floor(Math.min(typeof window!=='undefined'?window.innerWidth-32:360,380)/GT_SIZE);
  return (
    <div style={{maxWidth:420,margin:'0 auto',padding:'10px 8px',touchAction:'manipulation'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:18}}>Beş Taş</div>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          {!winner&&<span style={{fontSize:12,fontWeight:600,color:turn==='black'?'var(--text)':'var(--text-secondary)'}}>{botThinking?'🤖...':turn==='black'?'⚫ Senin sıran':mode==='bot'?'🤖 Bot':'⚪ Oyuncu 2'}</span>}
          <button onClick={()=>{restart();setMode(null);}} style={{padding:'6px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:11,cursor:'pointer'}}>Menü</button>
          <button onClick={restart} style={{padding:'6px 10px',borderRadius:8,border:'none',background:'#1A1A2E',color:'#FFF',fontSize:11,cursor:'pointer'}}>Yeni</button>
        </div>
      </div>
      <div style={{background:'#DCB483',borderRadius:8,padding:4,overflowX:'auto'}}>
        <div style={{display:'grid',gridTemplateColumns:`repeat(${GT_SIZE},${cs}px)`,width:GT_SIZE*cs}}>
          {board.map((cell,i)=>(
            <div key={i} onClick={()=>place(i)} style={{width:cs,height:cs,display:'flex',alignItems:'center',justifyContent:'center',cursor:cell||winner?'default':'pointer',background:i===lastMove?'rgba(255,200,0,0.3)':'transparent',border:'0.5px solid rgba(139,90,43,0.3)',boxSizing:'border-box'}}>
              {cell&&<div style={{width:cs*0.75,height:cs*0.75,borderRadius:'50%',background:cell==='black'?'#1A1A1A':'#F5F5F5',border:`1px solid ${cell==='black'?'#000':'#CCC'}`,boxShadow:'0 1px 3px rgba(0,0,0,0.4)'}}/>}
            </div>
          ))}
        </div>
      </div>
      {winner&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
        <div style={{background:'var(--surface)',borderRadius:20,padding:'28px 24px',textAlign:'center',maxWidth:280}}>
          <div style={{fontSize:48,marginBottom:8}}>{winner==='draw'?'🤝':winner==='black'?'🏆':mode==='bot'?'🤖':'⚪'}</div>
          <h2 style={{fontFamily:"'Sora',sans-serif",fontSize:22,fontWeight:800,marginBottom:16}}>{winner==='draw'?'Berabere!':winner==='black'?'Kazandın!':mode==='bot'?'Bot Kazandı!':'Oyuncu 2 Kazandı!'}</h2>
          <div style={{display:'flex',gap:10,justifyContent:'center'}}>
            <button onClick={restart} style={{padding:'10px 18px',borderRadius:10,border:'none',background:'#1A1A2E',color:'#FFF',fontWeight:700,cursor:'pointer'}}>Tekrar</button>
            <button onClick={()=>{restart();setMode(null);}} style={{padding:'10px 18px',borderRadius:10,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontWeight:700,cursor:'pointer'}}>Menü</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

// ============================================================
// GAME: TEPKİ YARIŞI
// ============================================================
function ReactionGame({ onGameEnd, soundOn, onlineProps, onGoOnline }) {
  const isOnline=!!onlineProps;
  const isHost=isOnline&&onlineProps.myIndex===0;
  const [mode,setMode]=useState(onlineProps?'online':null);
  const [phase,setPhase]=useState('idle');
  const [scores,setScores]=useState([0,0]);
  const [round,setRound]=useState(0);
  const [lastWinner,setLastWinner]=useState(null);
  const [bgColor,setBgColor]=useState('#6B7280');
  const timerRef=useRef(null);
  const roundRef=useRef(0);
  const tapDone=useRef(false);
  const COLORS=['#E63946','#F59E0B','#10B981','#3B82F6','#8B5CF6'];
  const MAX_ROUNDS=7;

  // Remote moves
  useEffect(function(){
    if(!isOnline||!onlineProps.remoteMove)return;
    var mv=onlineProps.remoteMove;
    if(mv.type==='rg_wait'&&!isHost){
      clearTimeout(timerRef.current);tapDone.current=false;
      setPhase('wait');setBgColor('#6B7280');setLastWinner(null);
      roundRef.current=mv.round;
    } else if(mv.type==='rg_flash'&&!isHost){
      setBgColor(mv.color);setPhase('tap');
      if(soundOn)playSound('place');
    } else if(mv.type==='rg_result'&&mv.round===roundRef.current&&!tapDone.current){
      tapDone.current=true;clearTimeout(timerRef.current);
      setScores(mv.scores);setLastWinner(mv.winner);setPhase('result');
      setBgColor(mv.winner===onlineProps.myIndex?'#22C55E':'#EF4444');
      if(soundOn)playSound(mv.winner===onlineProps.myIndex?'place':'lose');
      const nr=mv.round+1;roundRef.current=nr;setRound(nr);
      if(nr>=MAX_ROUNDS){setTimeout(function(){onGameEnd(mv.scores[onlineProps.myIndex]>=mv.scores[1-onlineProps.myIndex]?'win':'loss');},1500);return;}
      setTimeout(function(){if(isHost)startRound();},1600);
    } else if(mv.type==='rg_restart'){
      clearTimeout(timerRef.current);setScores([0,0]);setRound(0);
      roundRef.current=0;tapDone.current=false;
      if(!isHost){setPhase('wait');setBgColor('#6B7280');setLastWinner(null);}
    }
  },[isOnline&&onlineProps.remoteMove&&onlineProps.remoteMove._ts]);

  const startRound=useCallback(function(){
    tapDone.current=false;
    setPhase('wait');setBgColor('#6B7280');setLastWinner(null);
    if(isOnline)onlineProps.onMove({type:'rg_wait',round:roundRef.current,_ts:Date.now()});
    var delay=1500+Math.random()*3000;
    timerRef.current=setTimeout(function(){
      var color=COLORS[Math.floor(Math.random()*COLORS.length)];
      setBgColor(color);setPhase('tap');
      if(isOnline)onlineProps.onMove({type:'rg_flash',color,round:roundRef.current,_ts:Date.now()});
      if(soundOn)playSound('place');
    },delay);
  },[isOnline,soundOn]);

  useEffect(function(){
    if(mode==='online'||mode==='local'){
      if(isHost||!isOnline)startRound();
      else{setPhase('wait');setBgColor('#6B7280');}
    }
    return function(){clearTimeout(timerRef.current);};
  },[mode]);

  const handleTap=function(player){
    if(tapDone.current||phase==='idle'||phase==='result')return;
    tapDone.current=true;
    clearTimeout(timerRef.current);
    var myIdx=isOnline?onlineProps.myIndex:player;
    var currentRound=roundRef.current;
    var ns=[...scores];
    var winner;
    if(phase==='wait'){winner=isOnline?(1-myIdx):(player===0?1:0);setBgColor('#EF4444');}
    else{winner=myIdx;setBgColor('#22C55E');if(soundOn)playSound('place');}
    ns[winner]++;
    setScores(ns);setLastWinner(winner);setPhase('result');
    if(isOnline)onlineProps.onMove({type:'rg_result',winner,scores:ns,round:currentRound,_ts:Date.now()});
    var nr=currentRound+1;roundRef.current=nr;setRound(nr);
    if(nr>=MAX_ROUNDS){setTimeout(function(){onGameEnd(ns[isOnline?onlineProps.myIndex:0]>=ns[isOnline?1-onlineProps.myIndex:1]?'win':'loss');},1500);return;}
    setTimeout(function(){if(isHost||!isOnline)startRound();},1500);
  };

  const restart=function(){
    clearTimeout(timerRef.current);setScores([0,0]);setRound(0);setLastWinner(null);
    roundRef.current=0;tapDone.current=false;
    if(isOnline)onlineProps.onMove({type:'rg_restart',_ts:Date.now()});
    startRound();
  };

  if(!mode&&!onlineProps)return(
    <div style={{maxWidth:360,margin:'0 auto',padding:'32px 16px',textAlign:'center'}}>
      <div style={{fontSize:48,marginBottom:8}}>⚡</div>
      <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:24,marginBottom:6}}>Tepki Yarışı</h2>
      <p style={{color:'var(--text-secondary)',marginBottom:24,fontSize:14}}>Ekrana kim daha hızlı basar?</p>
      <div style={{display:'flex',flexDirection:'column',gap:12,maxWidth:260,margin:'0 auto'}}>
        {onGoOnline&&<button onClick={onGoOnline} style={{padding:'15px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',color:'#FFF',fontSize:15,fontWeight:700,cursor:'pointer'}}>🌐 Çevrimiçi Oyna<div style={{fontSize:11,fontWeight:400,opacity:0.85,marginTop:3}}>Arkadaşını davet et</div></button>}
        <button onClick={()=>setMode('local')} style={{padding:'15px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#D97706,#FCD34D)',color:'#FFF',fontSize:15,fontWeight:700,cursor:'pointer'}}>📱 Aynı Cihazda 2 Kişi</button>
      </div>
    </div>
  );

  const myScore=isOnline?scores[onlineProps.myIndex]:scores[0];
  const oppScore=isOnline?scores[1-onlineProps.myIndex]:scores[1];
  const oppName=isOnline?onlineProps.opponentName:'Oyuncu 2';
  const myResult=lastWinner===null?null:(lastWinner===(isOnline?onlineProps.myIndex:0));

  if(isOnline)return(
    <div style={{height:'88vh',display:'flex',flexDirection:'column',userSelect:'none',touchAction:'manipulation'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 16px',background:'var(--surface)',borderBottom:'1px solid var(--border)'}}>
        <span style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:16}}>⚡ Tepki Yarışı</span>
        <span style={{fontSize:13,fontWeight:600}}>{myScore} — {oppScore}</span>
        <span style={{fontSize:12,color:'var(--text-secondary)'}}>Tur {round}/{MAX_ROUNDS}</span>
      </div>
      {/* Opponent area (top, smaller) */}
      <div style={{flex:0.6,background:'#374151',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',borderBottom:'2px solid #1F2937'}}>
        <div style={{fontSize:14,fontWeight:700,color:'#9CA3AF',marginBottom:4}}>👤 {oppName}</div>
        <div style={{fontSize:36,fontWeight:900,color:'#FFF'}}>{oppScore}</div>
        <div style={{fontSize:12,color:'#6B7280',marginTop:4}}>
          {phase==='tap'?'⚡ Tepki veriyor...':phase==='result'?(lastWinner!==(onlineProps.myIndex)?'✓ Hızlıydı!':'✗ Yavaş'):'⏳ Bekliyor...'}
        </div>
      </div>
      {/* My tap area (bottom, larger) */}
      <div onPointerDown={function(e){e.preventDefault();handleTap(onlineProps.myIndex);}}
        style={{flex:1,background:phase==='tap'?bgColor:phase==='result'&&myResult?'#22C55E':phase==='result'?'#EF4444':'#6B7280',
          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'background 0.15s',WebkitUserSelect:'none'}}>
        <div style={{fontSize:18,fontWeight:800,color:'#FFF',marginBottom:8}}>Sen · {myScore}p</div>
        <div style={{fontSize:52,fontWeight:900,color:'#FFF',marginBottom:8}}>
          {phase==='wait'?'⏳':phase==='tap'?'👆':myResult?'🏆':'😔'}
        </div>
        <div style={{fontSize:16,fontWeight:700,color:'rgba(255,255,255,0.9)'}}>
          {phase==='wait'?'Bekle... Renk değişince bas!':phase==='tap'?'DOKUNDUR! 👆':myResult?'Kazandın bu turu!':'Kaybettin bu turu'}
        </div>
      </div>
      {round>=MAX_ROUNDS&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
        <div style={{background:'var(--surface)',borderRadius:20,padding:'28px 24px',textAlign:'center',maxWidth:280}}>
          <div style={{fontSize:48,marginBottom:8}}>{myScore>oppScore?'🏆':myScore<oppScore?'😔':'🤝'}</div>
          <h2 style={{fontFamily:"'Sora',sans-serif",fontSize:22,fontWeight:800,marginBottom:8}}>{myScore>oppScore?'Kazandın!':myScore<oppScore?`${oppName} Kazandı!`:'Berabere!'}</h2>
          <p style={{color:'var(--text-secondary)',marginBottom:16}}>{myScore} - {oppScore}</p>
          <button onClick={restart} style={{padding:'12px 24px',borderRadius:12,border:'none',background:'#E63946',color:'#FFF',fontWeight:700,fontSize:15,cursor:'pointer'}}>Tekrar</button>
        </div>
      </div>}
    </div>
  );

  return(
    <div style={{height:'88vh',display:'flex',flexDirection:'column',userSelect:'none',touchAction:'manipulation'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 16px',background:'var(--surface)',borderBottom:'1px solid var(--border)'}}>
        <span style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:16}}>⚡ Tepki Yarışı</span>
        <span style={{fontSize:13,color:'var(--text-secondary)'}}>Tur {round}/{MAX_ROUNDS}</span>
        <button onClick={restart} style={{padding:'6px 12px',borderRadius:8,border:'none',background:'#E63946',color:'#FFF',fontSize:12,fontWeight:600,cursor:'pointer'}}>Yeni</button>
      </div>
      <div style={{flex:1,display:'flex',flexDirection:'column',gap:3,padding:'8px'}}>
        {[1,0].map(function(p){return(
          <div key={p} onPointerDown={function(e){e.preventDefault();handleTap(p);}}
            style={{flex:1,borderRadius:16,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',cursor:'pointer',
              background:phase==='tap'?bgColor:phase==='result'&&lastWinner===p?'#22C55E':phase==='result'?'#EF4444':'#6B7280',
              transform:p===1?'rotate(180deg)':'none',transition:'background 0.15s',WebkitUserSelect:'none'}}>
            <div style={{fontSize:16,fontWeight:800,color:'#FFF',marginBottom:4}}>⬆ Oyuncu {p+1}</div>
            <div style={{fontSize:40,fontWeight:900,color:'#FFF'}}>{scores[p]}</div>
            <div style={{fontSize:14,color:'rgba(255,255,255,0.8)',marginTop:4}}>
              {phase==='wait'?'Bekle...':phase==='tap'?'TAP! 👆':lastWinner===p?'+1 ✓':'Yavaş kaldın'}
            </div>
          </div>
        );})}
      </div>
      {round>=MAX_ROUNDS&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
        <div style={{background:'var(--surface)',borderRadius:20,padding:'28px 24px',textAlign:'center',maxWidth:280}}>
          <div style={{fontSize:48,marginBottom:8}}>{scores[0]>scores[1]?'🏆':scores[1]>scores[0]?'🥇':'🤝'}</div>
          <h2 style={{fontFamily:"'Sora',sans-serif",fontSize:22,fontWeight:800,marginBottom:8}}>{scores[0]>scores[1]?'Oyuncu 1 Kazandı!':scores[1]>scores[0]?'Oyuncu 2 Kazandı!':'Berabere!'}</h2>
          <p style={{color:'var(--text-secondary)',marginBottom:16}}>{scores[0]} - {scores[1]}</p>
          <button onClick={restart} style={{padding:'12px 24px',borderRadius:12,border:'none',background:'#E63946',color:'#FFF',fontWeight:700,fontSize:15,cursor:'pointer'}}>Tekrar</button>
        </div>
      </div>}
    </div>
  );
}

// ============================================================
// GAME: MATEMATİK DÜELLOSU
// ============================================================
function genMathQ() {
  const ops=['+','-','×'];
  const op=ops[Math.floor(Math.random()*ops.length)];
  let a,b,ans;
  if(op==='+'){a=Math.floor(Math.random()*50)+1;b=Math.floor(Math.random()*50)+1;ans=a+b;}
  else if(op==='-'){a=Math.floor(Math.random()*50)+10;b=Math.floor(Math.random()*a)+1;ans=a-b;}
  else{a=Math.floor(Math.random()*12)+2;b=Math.floor(Math.random()*12)+2;ans=a*b;}
  const wrongs=new Set();
  while(wrongs.size<2){const d=(Math.floor(Math.random()*9)+1)*(Math.random()<0.5?1:-1);const w=ans+d;if(w!==ans&&w>0)wrongs.add(w);}
  const opts=[ans,...wrongs].sort(()=>Math.random()-0.5);
  return {q:`${a} ${op} ${b} = ?`,ans,opts};
}
function MathDuelGame({ onGameEnd, soundOn, onlineProps, onGoOnline }) {
  const isOnline=!!onlineProps;
  const isHost=isOnline&&onlineProps.myIndex===0;
  const [mode,setMode]=useState(onlineProps?'online':null);
  const [scores,setScores]=useState([0,0]);
  const [round,setRound]=useState(0);
  const [q,setQ]=useState(()=>!isOnline||isHost?genMathQ():null);
  const [answered,setAnswered]=useState(false);
  const [lastW,setLastW]=useState(null);
  const roundDone=useRef(false);
  const sentQ=useRef(false);
  const MAX=10;

  // Host sends question to guest
  useEffect(function(){
    if(!isHost||!q||sentQ.current)return;
    sentQ.current=true;
    setTimeout(function(){ onlineProps.onMove({type:'md_q',q,round,_ts:Date.now()}); },300);
  },[isHost&&!!q&&round]);

  // Remote moves
  useEffect(function(){
    if(!isOnline||!onlineProps.remoteMove)return;
    var mv=onlineProps.remoteMove;
    if(mv.type==='md_q'&&!isHost&&mv.round===round){
      setQ(mv.q);setAnswered(false);setLastW(null);roundDone.current=false;
    } else if(mv.type==='md_result'&&!roundDone.current){
      roundDone.current=true;
      setLastW(mv.winner);setScores(mv.scores);setAnswered(true);
      if(soundOn)playSound(mv.winner===onlineProps.myIndex?'place':'lose');
      const nr=mv.round+1;
      setTimeout(function(){
        if(nr>=MAX){setRound(nr);onGameEnd(mv.scores[onlineProps.myIndex]>=mv.scores[1-onlineProps.myIndex]?'win':'loss');return;}
        setRound(nr);setAnswered(false);setLastW(null);roundDone.current=false;
        if(isHost){const nq=genMathQ();setQ(nq);sentQ.current=false;}
        else setQ(null);
      },1200);
    } else if(mv.type==='md_restart'){
      setScores([0,0]);setRound(0);setAnswered(false);setLastW(null);roundDone.current=false;sentQ.current=false;
      if(!isHost)setQ(null);
    }
  },[isOnline&&onlineProps.remoteMove&&onlineProps.remoteMove._ts]);

  const answer=function(player,val){
    if(answered||roundDone.current||!q)return;
    const ok=val===q.ans;
    if(isOnline){
      if(!ok)return; // only correct answers trigger in online
      roundDone.current=true;
      setAnswered(true);
      const winner=onlineProps.myIndex;
      const ns=[...scores];ns[winner]++;
      setScores(ns);setLastW(winner);
      if(soundOn)playSound('place');
      onlineProps.onMove({type:'md_result',winner,scores:ns,round,_ts:Date.now()});
      const nr=round+1;
      setTimeout(function(){
        if(nr>=MAX){setRound(nr);onGameEnd(ns[onlineProps.myIndex]>=ns[1-onlineProps.myIndex]?'win':'loss');return;}
        setRound(nr);setAnswered(false);setLastW(null);roundDone.current=false;
        if(isHost){const nq=genMathQ();setQ(nq);sentQ.current=false;}
        else setQ(null);
      },1200);
      return;
    }
    // local 2-player
    setAnswered(true);
    const ns=[...scores];if(ok)ns[player]++;
    setScores(ns);setLastW(ok?player:null);
    if(soundOn)playSound(ok?'place':'lose');
    const nr=round+1;
    setTimeout(function(){
      if(nr>=MAX){setRound(nr);onGameEnd(ns[0]>=ns[1]?'win':'loss');if(soundOn)playSound(ns[0]>=ns[1]?'win':'lose');return;}
      setRound(nr);setQ(genMathQ());setAnswered(false);setLastW(null);
    },1200);
  };
  const restart=function(){
    setScores([0,0]);setRound(0);setAnswered(false);setLastW(null);roundDone.current=false;
    if(isOnline){
      sentQ.current=false;
      if(isHost){const nq=genMathQ();setQ(nq);}
      else setQ(null);
      onlineProps.onMove({type:'md_restart',_ts:Date.now()});
    } else {setQ(genMathQ());}
  };

  if(!mode&&!onlineProps)return(
    <div style={{maxWidth:360,margin:'0 auto',padding:'32px 16px',textAlign:'center'}}>
      <div style={{fontSize:48,marginBottom:8}}>🧮</div>
      <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:24,marginBottom:6}}>Matematik Düellosu</h2>
      <p style={{color:'var(--text-secondary)',marginBottom:24,fontSize:14}}>Soruları kim önce çözer?</p>
      <div style={{display:'flex',flexDirection:'column',gap:12,maxWidth:260,margin:'0 auto'}}>
        {onGoOnline&&<button onClick={onGoOnline} style={{padding:'15px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',color:'#FFF',fontSize:15,fontWeight:700,cursor:'pointer'}}>🌐 Çevrimiçi Oyna<div style={{fontSize:11,fontWeight:400,opacity:0.85,marginTop:3}}>Arkadaşını davet et</div></button>}
        <button onClick={()=>setMode('local')} style={{padding:'15px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#0369A1,#38BDF8)',color:'#FFF',fontSize:15,fontWeight:700,cursor:'pointer'}}>📱 Aynı Cihazda 2 Kişi</button>
      </div>
    </div>
  );

  const myScore=isOnline?scores[onlineProps.myIndex]:scores[0];
  const oppScore=isOnline?scores[1-onlineProps.myIndex]:scores[1];
  const oppName=isOnline?onlineProps.opponentName:'Oyuncu 2';

  if(isOnline)return(
    <div style={{maxWidth:440,margin:'0 auto',padding:'16px 12px',touchAction:'manipulation'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,padding:'0 4px'}}>
        <span style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:18}}>🧮 Matematik Düellosu</span>
        <span style={{fontSize:12,color:'var(--text-secondary)'}}>Tur {round}/{MAX}</span>
      </div>
      <div style={{display:'flex',gap:10,marginBottom:16}}>
        <div style={{flex:1,textAlign:'center',padding:'10px',background:'rgba(99,102,241,0.1)',borderRadius:12,border:'2px solid #6366f1'}}>
          <div style={{fontSize:12,color:'var(--text-secondary)'}}>Sen</div>
          <div style={{fontSize:26,fontWeight:900,color:'#6366f1'}}>{myScore}</div>
        </div>
        <div style={{flex:1,textAlign:'center',padding:'10px',background:'rgba(239,68,68,0.08)',borderRadius:12,border:'1px solid var(--border)'}}>
          <div style={{fontSize:12,color:'var(--text-secondary)'}}>{oppName}</div>
          <div style={{fontSize:26,fontWeight:900,color:'#ef4444'}}>{oppScore}</div>
        </div>
      </div>
      {!q?(
        <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text-secondary)',fontSize:15}}>Soru yükleniyor...</div>
      ):(
        <>
          <div style={{textAlign:'center',padding:'24px 16px',background:'var(--surface)',borderRadius:16,border:'1px solid var(--border)',marginBottom:16}}>
            <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:8}}>Kim önce doğru cevabı bulur?</div>
            <div style={{fontSize:32,fontWeight:900,fontFamily:"'Sora',sans-serif",color:'var(--text)'}}>{q.q}</div>
          </div>
          {!answered?(
            <div style={{display:'flex',gap:10,flexWrap:'wrap',justifyContent:'center'}}>
              {q.opts.map(function(opt){return(
                <button key={opt} onClick={()=>answer(onlineProps.myIndex,opt)}
                  style={{padding:'16px 24px',borderRadius:14,border:'2px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:22,fontWeight:700,cursor:'pointer',minWidth:90,transition:'all 0.1s'}}>
                  {opt}
                </button>
              );})}
            </div>
          ):(
            <div style={{textAlign:'center',padding:'20px',fontSize:18,fontWeight:700,color:lastW===onlineProps.myIndex?'#22C55E':'var(--text-secondary)'}}>
              {lastW===onlineProps.myIndex?'🎉 Sen kazandın bu turu!':lastW!==null?`${oppName} önce buldu!`:'⏳ Sonuç bekleniyor...'}
            </div>
          )}
        </>
      )}
      {round>=MAX&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
        <div style={{background:'var(--surface)',borderRadius:20,padding:'28px 24px',textAlign:'center',maxWidth:280}}>
          <div style={{fontSize:48,marginBottom:8}}>{myScore>oppScore?'🏆':myScore<oppScore?'😔':'🤝'}</div>
          <h2 style={{fontFamily:"'Sora',sans-serif",fontSize:22,fontWeight:800,marginBottom:8}}>{myScore>oppScore?'Kazandın!':myScore<oppScore?`${oppName} Kazandı!`:'Berabere!'}</h2>
          <p style={{color:'var(--text-secondary)',marginBottom:16}}>{myScore} - {oppScore}</p>
          <button onClick={restart} style={{padding:'12px 24px',borderRadius:12,border:'none',background:'#3B82F6',color:'#FFF',fontWeight:700,fontSize:15,cursor:'pointer'}}>Tekrar</button>
        </div>
      </div>}
    </div>
  );

  return(
    <div style={{height:'90vh',display:'flex',flexDirection:'column',touchAction:'manipulation',userSelect:'none'}}>
      <div style={{textAlign:'center',padding:'8px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:16}}>🧮 Matematik Düellosu</span>
        <span style={{fontSize:13,color:'var(--text-secondary)'}}>Tur {round}/{MAX} · O1:{scores[0]} O2:{scores[1]}</span>
        <button onClick={restart} style={{padding:'6px 12px',borderRadius:8,border:'none',background:'#3B82F6',color:'#FFF',fontSize:12,fontWeight:600,cursor:'pointer'}}>Yeni</button>
      </div>
      <div style={{textAlign:'center',padding:'20px 16px',background:'var(--surface)',borderBottom:'1px solid var(--border)'}}>
        <div style={{fontSize:30,fontWeight:900,fontFamily:"'Sora',sans-serif"}}>{q&&q.q}</div>
      </div>
      <div style={{flex:1,display:'flex',flexDirection:'column'}}>
        {[1,0].map(p=>(
          <div key={p} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:16,transform:p===1?'rotate(180deg)':'none',borderBottom:p===1?'2px solid var(--border)':'none'}}>
            <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:8}}>Oyuncu {p+1} — {scores[p]} puan</div>
            {!answered?(
              <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center'}}>
                {q&&q.opts.map(opt=>(
                  <button key={opt} onClick={()=>answer(p,opt)} style={{padding:'12px 20px',borderRadius:12,border:'2px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:20,fontWeight:700,cursor:'pointer',minWidth:70}}>{opt}</button>
                ))}
              </div>
            ):(
              <div style={{fontSize:18,fontWeight:700,color:lastW===p?'#22C55E':'#EF4444'}}>{lastW===p?'✓ Doğru!':answered?'✗ Yanlış':'⏳'}</div>
            )}
          </div>
        ))}
      </div>
      {round>=MAX&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
        <div style={{background:'var(--surface)',borderRadius:20,padding:'28px 24px',textAlign:'center',maxWidth:280}}>
          <div style={{fontSize:48,marginBottom:8}}>{scores[0]>scores[1]?'🏆':scores[1]>scores[0]?'🥇':'🤝'}</div>
          <h2 style={{fontFamily:"'Sora',sans-serif",fontSize:22,fontWeight:800,marginBottom:8}}>{scores[0]>scores[1]?'Oyuncu 1 Kazandı!':scores[1]>scores[0]?'Oyuncu 2 Kazandı!':'Berabere!'}</h2>
          <p style={{color:'var(--text-secondary)',marginBottom:16}}>{scores[0]} - {scores[1]}</p>
          <button onClick={restart} style={{padding:'12px 24px',borderRadius:12,border:'none',background:'#3B82F6',color:'#FFF',fontWeight:700,fontSize:15,cursor:'pointer'}}>Tekrar</button>
        </div>
      </div>}
    </div>
  );
}

// ============================================================
// GAME: KART SAVAŞI
// ============================================================
function mkDeck(){
  const s=['♠','♥','♦','♣'],r=['2','3','4','5','6','7','8','9','10','J','Q','K','A'],v={'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};
  const d=[];for(const suit of s)for(const rank of r)d.push({label:rank+suit,value:v[rank],suit});
  for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}
  return d;
}
function CardBattleGame({ onGameEnd, soundOn, onlineProps, onGoOnline }) {
  const isOnline = !!onlineProps;
  const isHost = isOnline && onlineProps.myIndex === 0;
  const [mode,setMode]=useState(onlineProps?'online':null);
  const [deck,setDeck]=useState(()=>!isOnline||isHost?mkDeck():null);
  const [idx,setIdx]=useState(0);
  const [scores,setScores]=useState([0,0]);
  const [rev,setRev]=useState(false);
  const [rw,setRw]=useState(null);
  const sentInitRef=useRef(false);
  const TOTAL=13;

  // Host sends deck to guest on mount
  useEffect(function(){
    if(!isHost||!deck||sentInitRef.current)return;
    sentInitRef.current=true;
    setTimeout(function(){ onlineProps.onMove({type:'cb_init',deck:deck,_ts:Date.now()}); },400);
  },[isHost&&!!deck]);

  // Receive remote moves
  useEffect(function(){
    if(!isOnline||!onlineProps.remoteMove)return;
    var mv=onlineProps.remoteMove;
    if(mv.type==='cb_init'&&mv.deck&&!deck){
      setDeck(mv.deck);
    } else if(mv.type==='cb_reveal'&&!rev&&deck){
      setRev(true);if(soundOn)playSound('place');
      const d=deck;
      const c1=d[mv.idx*2],c2=d[mv.idx*2+1];
      const w=c1&&c2?(c1.value>c2.value?0:c2.value>c1.value?1:-1):-1;
      setRw(w);setScores(mv.scores);
      if(mv.idx+1>=TOTAL){setTimeout(()=>{const ms=mv.scores[onlineProps.myIndex],os=mv.scores[1-onlineProps.myIndex];onGameEnd(ms>os?'win':ms<os?'loss':'draw');if(soundOn)playSound('win');},1500);}
    } else if(mv.type==='cb_next'){
      setIdx(mv.idx);setRev(false);setRw(null);
    } else if(mv.type==='cb_restart'&&mv.deck){
      setDeck(mv.deck);setIdx(0);setScores([0,0]);setRev(false);setRw(null);
    }
  },[isOnline&&onlineProps.remoteMove&&onlineProps.remoteMove._ts]);

  if(!mode&&!onlineProps)return(
    <div style={{maxWidth:360,margin:'0 auto',padding:'32px 16px',textAlign:'center'}}>
      <div style={{fontSize:48,marginBottom:8}}>🃏</div>
      <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:24,marginBottom:6}}>Kart Savaşı</h2>
      <p style={{color:'var(--text-secondary)',marginBottom:24,fontSize:14}}>Yüksek kart kazanır!</p>
      <div style={{display:'flex',flexDirection:'column',gap:12,maxWidth:260,margin:'0 auto'}}>
        {onGoOnline&&<button onClick={onGoOnline} style={{padding:'15px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',color:'#FFF',fontSize:15,fontWeight:700,cursor:'pointer'}}>🌐 Çevrimiçi Oyna<div style={{fontSize:11,fontWeight:400,opacity:0.85,marginTop:3}}>Arkadaşını davet et</div></button>}
        <button onClick={()=>setMode('local')} style={{padding:'15px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#7C3AED,#C084FC)',color:'#FFF',fontSize:15,fontWeight:700,cursor:'pointer'}}>📱 Aynı Cihazda 2 Kişi</button>
      </div>
    </div>
  );

  if(isOnline&&!deck)return(
    <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text-secondary)'}}>
      <div style={{fontSize:36,marginBottom:12}}>🃏</div>
      <div style={{fontSize:15}}>Kart destesi hazırlanıyor...</div>
    </div>
  );

  const c1=deck&&deck[idx*2],c2=deck&&deck[idx*2+1];
  const isRed=c=>c&&(c.suit==='♥'||c.suit==='♦');

  // In online mode: player 0 = c1, player 1 = c2
  const myCard=isOnline?(onlineProps.myIndex===0?c1:c2):c1;
  const oppCard=isOnline?(onlineProps.myIndex===0?c2:c1):c2;
  const myScore=isOnline?scores[onlineProps.myIndex]:scores[0];
  const oppScore=isOnline?scores[1-onlineProps.myIndex]:scores[1];
  const myName=isOnline?'Sen':' Oyuncu 1';
  const oppName=isOnline?onlineProps.opponentName:'Oyuncu 2';

  const reveal=()=>{
    if(rev||!c1||!c2)return;
    setRev(true);if(soundOn)playSound('place');
    const w=c1.value>c2.value?0:c2.value>c1.value?1:-1;
    setRw(w);
    const ns=[...scores];if(w===0)ns[0]++;else if(w===1)ns[1]++;
    setScores(ns);
    if(isOnline)onlineProps.onMove({type:'cb_reveal',idx,scores:ns,_ts:Date.now()});
    if(idx+1>=TOTAL){setTimeout(()=>{const mi=isOnline?onlineProps.myIndex:0,oi=isOnline?1-onlineProps.myIndex:1;onGameEnd(ns[mi]>ns[oi]?'win':ns[mi]<ns[oi]?'loss':'draw');if(soundOn)playSound('win');},1500);}
  };
  const next=()=>{
    const ni=idx+1;setIdx(ni);setRev(false);setRw(null);
    if(isOnline)onlineProps.onMove({type:'cb_next',idx:ni,_ts:Date.now()});
  };
  const restart=()=>{
    const nd=mkDeck();setDeck(nd);setIdx(0);setScores([0,0]);setRev(false);setRw(null);
    if(isOnline)onlineProps.onMove({type:'cb_restart',deck:nd,_ts:Date.now()});
  };

  // Who won this round: 0=player0, 1=player1, -1=draw
  const myWon=isOnline?(rw===onlineProps.myIndex):(rw===0);
  const roundLabel=rw===-1?'Berabere!':myWon?'Sen kazandın! 🏆':`${oppName} kazandı!`;
  const gameWon=isOnline?(scores[onlineProps.myIndex]>scores[1-onlineProps.myIndex]):(scores[0]>scores[1]);

  return (
    <div style={{maxWidth:400,margin:'0 auto',padding:'16px 12px',textAlign:'center',touchAction:'manipulation'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:20}}>🃏 Kart Savaşı</div>
        <div style={{fontSize:13,color:'var(--text-secondary)'}}>Tur {Math.min(idx+1,TOTAL)}/{TOTAL}</div>
        {!isOnline&&<button onClick={restart} style={{padding:'6px 12px',borderRadius:8,border:'none',background:'#DC2626',color:'#FFF',fontSize:12,fontWeight:600,cursor:'pointer'}}>Yeni</button>}
      </div>
      <div style={{display:'flex',gap:12,justifyContent:'center',marginBottom:20}}>
        {/* My card (face-up) */}
        <div style={{flex:1,maxWidth:150}}>
          <div style={{fontSize:12,fontWeight:600,color:'var(--text-secondary)',marginBottom:6}}>{myName} · {myScore}p</div>
          <div style={{aspectRatio:'2/3',borderRadius:16,border:`3px solid ${isOnline?(rev&&rw===onlineProps.myIndex?'#22C55E':rev&&rw!==-1?'#E63946':'var(--border)'):(rev&&rw===0?'#22C55E':'var(--border)')}`,background:'var(--surface)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,fontWeight:800,color:myCard?(isRed(myCard)?'#E63946':'var(--text)'):'var(--text-secondary)'}}>
            {myCard?myCard.label:'🂠'}
          </div>
        </div>
        {/* Opponent card (face-down until reveal) */}
        <div style={{flex:1,maxWidth:150}}>
          <div style={{fontSize:12,fontWeight:600,color:'var(--text-secondary)',marginBottom:6}}>{oppName} · {oppScore}p</div>
          <div style={{aspectRatio:'2/3',borderRadius:16,border:`3px solid ${isOnline?(rev&&rw===(1-onlineProps.myIndex)?'#22C55E':rev&&rw!==-1?'#E63946':'var(--border)'):(rev&&rw===1?'#22C55E':'var(--border)')}`,background:'var(--surface)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:rev?28:36,fontWeight:800,color:rev?(oppCard&&isRed(oppCard)?'#E63946':'var(--text)'):'var(--text-secondary)'}}>
            {rev&&oppCard?oppCard.label:'🂠'}
          </div>
        </div>
      </div>
      {!rev&&idx<TOTAL&&<button onClick={reveal} style={{width:'100%',padding:'16px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#E63946,#F4845F)',color:'#FFF',fontSize:18,fontWeight:700,cursor:'pointer'}}>Kartı Aç 🃏</button>}
      {rev&&rw!==null&&<div style={{marginBottom:12}}>
        <div style={{fontSize:18,fontWeight:700,marginBottom:10,color:rw===-1?'var(--text-secondary)':'#22C55E'}}>{roundLabel}</div>
        {idx+1<TOTAL&&<button onClick={next} style={{padding:'12px 28px',borderRadius:12,border:'none',background:'#1D4ED8',color:'#FFF',fontSize:16,fontWeight:700,cursor:'pointer'}}>Sonraki →</button>}
      </div>}
      {idx+1>=TOTAL&&rev&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
        <div style={{background:'var(--surface)',borderRadius:20,padding:'28px 24px',textAlign:'center',maxWidth:280}}>
          <div style={{fontSize:48,marginBottom:8}}>{myScore>oppScore?'🏆':myScore<oppScore?'😔':'🤝'}</div>
          <h2 style={{fontFamily:"'Sora',sans-serif",fontSize:22,fontWeight:800,marginBottom:8}}>{myScore>oppScore?'Kazandın!':myScore<oppScore?`${oppName} Kazandı!`:'Berabere!'}</h2>
          <p style={{color:'var(--text-secondary)',marginBottom:16}}>{myScore} - {oppScore}</p>
          <button onClick={restart} style={{padding:'12px 24px',borderRadius:12,border:'none',background:'#DC2626',color:'#FFF',fontWeight:700,fontSize:15,cursor:'pointer'}}>Tekrar</button>
        </div>
      </div>}
    </div>
  );
}

// ============================================================
// GAME: HAFIZA SAVAŞI (2-Player Memory)
// ============================================================
function MemoryBattleGame({ onGameEnd, soundOn, onlineProps, onGoOnline }) {
  const isOnline=!!onlineProps;
  const isHost=isOnline&&onlineProps.myIndex===0;
  const EMOJIS=['🍎','🍊','🍋','🍇','🍓','🍒','🍑','🥝','🍕','🌮','🎮','⚽'];
  const [mode,setMode]=useState(onlineProps?'online':null);
  const makeCards=useCallback(()=>{
    const pairs=[...EMOJIS,...EMOJIS].map((e,i)=>({id:i,emoji:e,flipped:false,matched:false}));
    for(let i=pairs.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pairs[i],pairs[j]]=[pairs[j],pairs[i]];}
    return pairs;
  },[]);
  const [cs,setCs]=useState(()=>!isOnline||isHost?makeCards():null);
  const [flipped,setFlipped]=useState([]);
  const [scores,setScores]=useState([0,0]);
  const [turn,setTurn]=useState(0);
  const [locked,setLocked]=useState(false);
  const sentInitRef=useRef(false);

  // Host sends card layout to guest
  useEffect(function(){
    if(!isHost||!cs||sentInitRef.current)return;
    sentInitRef.current=true;
    setTimeout(function(){ onlineProps.onMove({type:'mb_init',cards:cs,_ts:Date.now()}); },400);
  },[isHost&&!!cs]);

  // Receive remote moves
  useEffect(function(){
    if(!isOnline||!onlineProps.remoteMove)return;
    var mv=onlineProps.remoteMove;
    if(mv.type==='mb_init'&&mv.cards&&!cs){
      setCs(mv.cards.map(c=>({...c,flipped:false,matched:c.matched||false})));
    } else if(mv.type==='mb_flip'&&cs){
      applyFlip(mv.cardIdx,mv.turn,true);
    } else if(mv.type==='mb_restart'&&mv.cards){
      setCs(mv.cards);setFlipped([]);setScores([0,0]);setTurn(0);setLocked(false);
    }
  },[isOnline&&onlineProps.remoteMove&&onlineProps.remoteMove._ts]);

  const applyFlip=useCallback((i,flippingTurn,isRemote)=>{
    setCs(prev=>{
      if(!prev||prev[i].flipped||prev[i].matched)return prev;
      const ns=prev.map((c,ci)=>ci===i?{...c,flipped:true}:c);
      setFlipped(nf=>{
        const newFlipped=[...nf,i];
        if(newFlipped.length===2){
          setLocked(true);
          const[a,b]=newFlipped;
          if(ns[a].emoji===ns[b].emoji){
            setTimeout(()=>{
              setCs(c=>c.map((card,ci)=>ci===a||ci===b?{...card,matched:true,flipped:true}:card));
              setScores(sc=>{const nsc=[...sc];nsc[flippingTurn]++;
                if(nsc.reduce((s,v)=>s+v,0)===12){const mi=onlineProps?.myIndex??0,oi=1-mi;const r=nsc[mi]>nsc[oi]?'win':nsc[mi]<nsc[oi]?'loss':'draw';onGameEnd(r);if(soundOn)playSound('win');}
                return nsc;});
              setFlipped([]);setLocked(false);
            },500);
          } else {
            setTimeout(()=>{
              setCs(c=>c.map((card,ci)=>ci===a||ci===b?{...card,flipped:false}:card));
              setFlipped([]);setLocked(false);setTurn(t=>t===0?1:0);
            },900);
          }
        }
        return newFlipped;
      });
      return ns;
    });
  },[onGameEnd,soundOn]);

  if(!mode&&!onlineProps)return(
    <div style={{maxWidth:360,margin:'0 auto',padding:'32px 16px',textAlign:'center'}}>
      <div style={{fontSize:48,marginBottom:8}}>🧠</div>
      <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:24,marginBottom:6}}>Hafıza Savaşı</h2>
      <p style={{color:'var(--text-secondary)',marginBottom:24,fontSize:14}}>Eşleri bul, skoru kap!</p>
      <div style={{display:'flex',flexDirection:'column',gap:12,maxWidth:260,margin:'0 auto'}}>
        {onGoOnline&&<button onClick={onGoOnline} style={{padding:'15px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',color:'#FFF',fontSize:15,fontWeight:700,cursor:'pointer'}}>🌐 Çevrimiçi Oyna<div style={{fontSize:11,fontWeight:400,opacity:0.85,marginTop:3}}>Arkadaşını davet et</div></button>}
        <button onClick={()=>setMode('local')} style={{padding:'15px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#BE185D,#F472B6)',color:'#FFF',fontSize:15,fontWeight:700,cursor:'pointer'}}>📱 Aynı Cihazda 2 Kişi</button>
      </div>
    </div>
  );

  if(isOnline&&!cs)return(
    <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text-secondary)'}}>
      <div style={{fontSize:36,marginBottom:12}}>🧠</div>
      <div style={{fontSize:15}}>Kartlar hazırlanıyor...</div>
    </div>
  );

  const myTurn=!isOnline||turn===onlineProps.myIndex;
  const myName=isOnline?'Sen':'Oyuncu 1';
  const oppName=isOnline?onlineProps.opponentName:'Oyuncu 2';
  const myScore=isOnline?scores[onlineProps.myIndex]:scores[0];
  const oppScore=isOnline?scores[1-onlineProps.myIndex]:scores[1];

  const flip=(i)=>{
    if(locked||!cs||cs[i].flipped||cs[i].matched||flipped.length>=2)return;
    if(isOnline&&!myTurn)return;
    if(soundOn)playSound('place');
    if(isOnline)onlineProps.onMove({type:'mb_flip',cardIdx:i,turn,_ts:Date.now()});
    applyFlip(i,turn,false);
  };

  const allMatched=cs&&cs.every(c=>c.matched);

  const restart=()=>{
    const nc=makeCards();setCs(nc);setFlipped([]);setScores([0,0]);setTurn(0);setLocked(false);
    if(isOnline)onlineProps.onMove({type:'mb_restart',cards:nc,_ts:Date.now()});
  };

  return (
    <div style={{maxWidth:420,margin:'0 auto',padding:'10px 8px',touchAction:'manipulation'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:18}}>🧠 Hafıza Savaşı</div>
        <div style={{display:'flex',gap:12,fontSize:14}}>
          <span style={{fontWeight:700,color:turn===0?'#E63946':'var(--text-secondary)'}}>{myName}:{myScore}</span>
          <span style={{fontWeight:700,color:turn===1?'#3B82F6':'var(--text-secondary)'}}>{oppName}:{oppScore}</span>
        </div>
      </div>
      <div style={{marginBottom:8,fontSize:13,textAlign:'center',fontWeight:600,color:myTurn?'#22C55E':'#3B82F6'}}>
        {!allMatched&&(myTurn?'🟢 Senin sıran':'🔵 '+oppName+' sırasında')}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:6}}>
        {cs&&cs.map((card,i)=>(
          <div key={i} onClick={()=>flip(i)} style={{aspectRatio:'1',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,cursor:card.flipped||card.matched||!myTurn?'default':'pointer',background:card.matched?'#22C55E':card.flipped?'var(--surface)':turn===0?'#E63946':'#3B82F6',border:'2px solid var(--border)',transition:'background 0.2s',userSelect:'none',opacity:!myTurn&&!card.flipped&&!card.matched?0.85:1}}>
            {(card.flipped||card.matched)?card.emoji:''}
          </div>
        ))}
      </div>
      {allMatched&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
        <div style={{background:'var(--surface)',borderRadius:20,padding:'28px 24px',textAlign:'center',maxWidth:280}}>
          <div style={{fontSize:48,marginBottom:8}}>{myScore>oppScore?'🏆':myScore<oppScore?'😔':'🤝'}</div>
          <h2 style={{fontFamily:"'Sora',sans-serif",fontSize:22,fontWeight:800,marginBottom:8}}>{myScore>oppScore?'Kazandın!':myScore<oppScore?`${oppName} Kazandı!`:'Berabere!'}</h2>
          <p style={{color:'var(--text-secondary)',marginBottom:16}}>{myScore} - {oppScore}</p>
          <button onClick={restart} style={{padding:'12px 24px',borderRadius:12,border:'none',background:'#7C3AED',color:'#FFF',fontWeight:700,fontSize:15,cursor:'pointer'}}>Tekrar</button>
        </div>
      </div>}
    </div>
  );
}

// ============================================================
// GAME: KELİME YARIŞI (Anagram Race)
// ============================================================
const RACE_WORDS=[
  {word:'ARABA',clue:'Dört tekerlekli araç'},{word:'KALEM',clue:'Yazı yazmak için'},
  {word:'KITAP',clue:'Okuruz bunu'},{word:'ELMAS',clue:'Değerli taş'},
  {word:'BULUT',clue:'Gökyüzünde'},{word:'FENER',clue:'Işık verir'},
  {word:'LIMON',clue:'Ekşi sarı meyve'},{word:'MAKAS',clue:'Kesmek için'},
  {word:'PAZAR',clue:'Alışveriş yeri'},{word:'ZAMAN',clue:'Geçip gider'},
  {word:'KANAT',clue:'Uçmak için'},{word:'DUMAN',clue:'Ateşten çıkar'},
];
function scrmbl(w){const a=[...w];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a.join('');}

function WordRaceGame({ onGameEnd, soundOn, onlineProps, onGoOnline }) {
  const isOnline=!!onlineProps;
  const isHost=isOnline&&onlineProps.myIndex===0;
  const [mode,setMode]=useState(onlineProps?'online':null);
  const [ri,setRi]=useState(0);
  const [scr,setScr]=useState(()=>!isOnline||isHost?scrmbl(RACE_WORDS[0].word):null);
  const [scores,setScores]=useState([0,0]);
  const [myInput,setMyInput]=useState('');
  const [revealed,setRevealed]=useState(false);
  const [roundResult,setRoundResult]=useState(null); // { winner: 0|1 | null }
  const [inputs,setInputs]=useState(['','']);
  const [answered,setAnswered]=useState([false,false]);
  const roundDone=useRef(false);
  const sentWord=useRef(false);

  // Host sends word to guest
  useEffect(function(){
    if(!isHost||!scr||sentWord.current)return;
    sentWord.current=true;
    setTimeout(function(){ onlineProps.onMove({type:'wr_word',ri,scr,_ts:Date.now()}); },300);
  },[isHost&&!!scr&&ri]);

  // Remote moves
  useEffect(function(){
    if(!isOnline||!onlineProps.remoteMove)return;
    var mv=onlineProps.remoteMove;
    if(mv.type==='wr_word'&&!isHost){
      setRi(mv.ri);setScr(mv.scr);setMyInput('');setRevealed(false);setRoundResult(null);roundDone.current=false;
    } else if(mv.type==='wr_result'&&!roundDone.current){
      roundDone.current=true;
      setScores(mv.scores);setRevealed(true);
      setRoundResult({winner:mv.winner});
      if(soundOn)playSound(mv.winner===onlineProps.myIndex?'place':'lose');
      const nr=mv.ri+1;
      if(nr>=RACE_WORDS.length){setTimeout(function(){onGameEnd(mv.scores[onlineProps.myIndex]>=mv.scores[1-onlineProps.myIndex]?'win':'loss');},1800);return;}
      setTimeout(function(){
        setMyInput('');setRevealed(false);setRoundResult(null);roundDone.current=false;
        if(isHost){const ni=RACE_WORDS[nr];const ns2=scrmbl(ni.word);setRi(nr);setScr(ns2);sentWord.current=false;}
      },1800);
    } else if(mv.type==='wr_restart'){
      setScores([0,0]);setRi(0);setMyInput('');setRevealed(false);setRoundResult(null);roundDone.current=false;sentWord.current=false;
      if(!isHost)setScr(null);
    }
  },[isOnline&&onlineProps.remoteMove&&onlineProps.remoteMove._ts]);

  if(!mode&&!onlineProps)return(
    <div style={{maxWidth:360,margin:'0 auto',padding:'32px 16px',textAlign:'center'}}>
      <div style={{fontSize:48,marginBottom:8}}>🔤</div>
      <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:24,marginBottom:6}}>Kelime Yarışı</h2>
      <p style={{color:'var(--text-secondary)',marginBottom:24,fontSize:14}}>Anagramı kim önce çözer?</p>
      <div style={{display:'flex',flexDirection:'column',gap:12,maxWidth:260,margin:'0 auto'}}>
        {onGoOnline&&<button onClick={onGoOnline} style={{padding:'15px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',color:'#FFF',fontSize:15,fontWeight:700,cursor:'pointer'}}>🌐 Çevrimiçi Oyna<div style={{fontSize:11,fontWeight:400,opacity:0.85,marginTop:3}}>Arkadaşını davet et</div></button>}
        <button onClick={()=>setMode('local')} style={{padding:'15px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#065F46,#34D399)',color:'#FFF',fontSize:15,fontWeight:700,cursor:'pointer'}}>📱 Aynı Cihazda 2 Kişi</button>
      </div>
    </div>
  );

  const item=RACE_WORDS[ri%RACE_WORDS.length];
  const myScore=isOnline?scores[onlineProps.myIndex]:scores[0];
  const oppScore=isOnline?scores[1-onlineProps.myIndex]:scores[1];
  const oppName=isOnline?onlineProps.opponentName:'Oyuncu 2';

  const onlineSubmit=function(){
    if(roundDone.current||revealed||!myInput.trim())return;
    const ok=myInput.toUpperCase().trim()===item.word;
    if(!ok){setMyInput('');return;}
    roundDone.current=true;
    const winner=onlineProps.myIndex;
    const ns=[...scores];ns[winner]++;
    setScores(ns);setRevealed(true);setRoundResult({winner});
    if(soundOn)playSound('place');
    onlineProps.onMove({type:'wr_result',winner,scores:ns,ri,_ts:Date.now()});
    const nr=ri+1;
    if(nr>=RACE_WORDS.length){setTimeout(function(){onGameEnd(ns[onlineProps.myIndex]>=ns[1-onlineProps.myIndex]?'win':'loss');},1800);return;}
    setTimeout(function(){
      setMyInput('');setRevealed(false);setRoundResult(null);roundDone.current=false;
      if(isHost){const ni2=RACE_WORDS[nr];const ns3=scrmbl(ni2.word);setRi(nr);setScr(ns3);sentWord.current=false;}
    },1800);
  };

  // Local submit (non-online)
  const submit=(player)=>{
    if(answered[player]||revealed)return;
    const ok=inputs[player].toUpperCase().trim()===item.word;
    const na=[...answered];na[player]=true;setAnswered(na);
    const ns=[...scores];if(ok){ns[player]++;setScores(ns);if(soundOn)playSound('place');}
    if(ok||na.every(Boolean)){
      setRevealed(true);
      const nr=ri+1;
      if(nr>=RACE_WORDS.length){setTimeout(()=>{onGameEnd(ns[0]>=ns[1]?'win':'loss');},1500);return;}
      setTimeout(()=>{setRi(nr);setInputs(['','']);setAnswered([false,false]);setRevealed(false);},1800);
    }
  };

  const localScr=useMemo(()=>isOnline?scr:scrmbl(item.word),[ri,isOnline,scr]);

  if(isOnline)return(
    <div style={{maxWidth:440,margin:'0 auto',padding:'16px 12px',touchAction:'manipulation'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <span style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:18}}>🔤 Kelime Yarışı</span>
        <span style={{fontSize:12,color:'var(--text-secondary)'}}>Tur {ri+1}/{RACE_WORDS.length}</span>
      </div>
      <div style={{display:'flex',gap:10,marginBottom:16}}>
        <div style={{flex:1,textAlign:'center',padding:'10px',background:'rgba(99,102,241,0.1)',borderRadius:12,border:'2px solid #6366f1'}}>
          <div style={{fontSize:12,color:'var(--text-secondary)'}}>Sen</div>
          <div style={{fontSize:26,fontWeight:900,color:'#6366f1'}}>{myScore}</div>
        </div>
        <div style={{flex:1,textAlign:'center',padding:'10px',background:'rgba(239,68,68,0.08)',borderRadius:12,border:'1px solid var(--border)'}}>
          <div style={{fontSize:12,color:'var(--text-secondary)'}}>{oppName}</div>
          <div style={{fontSize:26,fontWeight:900,color:'#ef4444'}}>{oppScore}</div>
        </div>
      </div>
      {!scr?(
        <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text-secondary)',fontSize:15}}>Kelime yükleniyor...</div>
      ):(
        <div style={{background:'var(--surface)',borderRadius:16,border:'1px solid var(--border)',padding:'20px 16px',marginBottom:16,textAlign:'center'}}>
          <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:6}}>{item.clue}</div>
          <div style={{fontSize:32,fontWeight:900,letterSpacing:8,fontFamily:"'Sora',sans-serif"}}>{scr}</div>
          {revealed&&<div style={{fontSize:16,color:'#22C55E',fontWeight:700,marginTop:8}}>→ {item.word}</div>}
          {roundResult&&<div style={{fontSize:15,fontWeight:700,marginTop:8,color:roundResult.winner===onlineProps.myIndex?'#22C55E':'#EF4444'}}>
            {roundResult.winner===onlineProps.myIndex?'🎉 Önce sen buldun!':roundResult.winner!==null?`${oppName} önce buldu!`:'Süre doldu'}
          </div>}
        </div>
      )}
      {scr&&!revealed&&(
        <div style={{display:'flex',gap:10}}>
          <input value={myInput} onChange={e=>setMyInput(e.target.value.toUpperCase())}
            onKeyDown={e=>e.key==='Enter'&&onlineSubmit()}
            placeholder="Cevabı yaz ve gönder..."
            style={{flex:1,padding:'12px 14px',borderRadius:12,border:'2px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:16,fontWeight:700,outline:'none',letterSpacing:2}}/>
          <button onClick={onlineSubmit} style={{padding:'12px 16px',borderRadius:12,border:'none',background:'#22C55E',color:'#FFF',fontWeight:700,fontSize:18,cursor:'pointer'}}>✓</button>
        </div>
      )}
      {ri+1>=RACE_WORDS.length&&revealed&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
        <div style={{background:'var(--surface)',borderRadius:20,padding:'28px 24px',textAlign:'center',maxWidth:280}}>
          <div style={{fontSize:48,marginBottom:8}}>{myScore>oppScore?'🏆':myScore<oppScore?'😔':'🤝'}</div>
          <h2 style={{fontFamily:"'Sora',sans-serif",fontSize:22,fontWeight:800,marginBottom:8}}>{myScore>oppScore?'Kazandın!':myScore<oppScore?`${oppName} Kazandı!`:'Berabere!'}</h2>
          <p style={{color:'var(--text-secondary)',marginBottom:16}}>{myScore} - {oppScore}</p>
          <button onClick={function(){setScores([0,0]);setRi(0);setMyInput('');setRevealed(false);setRoundResult(null);roundDone.current=false;sentWord.current=false;if(!isHost)setScr(null);onlineProps.onMove({type:'wr_restart',_ts:Date.now()});}} style={{padding:'12px 24px',borderRadius:12,border:'none',background:'#065F46',color:'#FFF',fontWeight:700,fontSize:15,cursor:'pointer'}}>Tekrar</button>
        </div>
      </div>}
    </div>
  );

  // LOCAL MODE (same device)
  return (
    <div style={{height:'90vh',display:'flex',flexDirection:'column',touchAction:'manipulation'}}>
      <div style={{textAlign:'center',padding:'8px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:16}}>🔤 Kelime Yarışı</span>
        <span style={{fontSize:13,color:'var(--text-secondary)'}}>Tur {ri+1}/{RACE_WORDS.length} · O1:{scores[0]} O2:{scores[1]}</span>
      </div>
      <div style={{textAlign:'center',padding:'16px',background:'var(--surface)',borderBottom:'1px solid var(--border)'}}>
        <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:4}}>{item.clue}</div>
        <div style={{fontSize:28,fontWeight:900,letterSpacing:6,fontFamily:"'Sora',sans-serif"}}>{localScr}</div>
        {revealed&&<div style={{fontSize:16,color:'#22C55E',fontWeight:700,marginTop:4}}>→ {item.word}</div>}
      </div>
      <div style={{flex:1,display:'flex',flexDirection:'column'}}>
        {[1,0].map(p=>(
          <div key={p} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:16,transform:p===1?'rotate(180deg)':'none',borderBottom:p===1?'2px solid var(--border)':'none'}}>
            <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:8}}>Oyuncu {p+1} · {scores[p]}p</div>
            {!answered[p]&&!revealed?(
              <div style={{display:'flex',gap:8,width:'100%',maxWidth:300}}>
                <input value={inputs[p]} onChange={e=>{const ni=[...inputs];ni[p]=e.target.value;setInputs(ni);}} onKeyDown={e=>e.key==='Enter'&&submit(p)}
                  placeholder="Kelimeyi yaz..."
                  style={{flex:1,padding:'10px 12px',borderRadius:10,border:'2px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:16,fontWeight:700,outline:'none'}}/>
                <button onClick={()=>submit(p)} style={{padding:'10px 14px',borderRadius:10,border:'none',background:'#22C55E',color:'#FFF',fontWeight:700,cursor:'pointer',fontSize:16}}>✓</button>
              </div>
            ):(
              <div style={{fontSize:16,fontWeight:700,color:inputs[p].toUpperCase().trim()===item.word?'#22C55E':'#EF4444'}}>
                {answered[p]?(inputs[p].toUpperCase().trim()===item.word?'✓ Doğru!':'✗ Yanlış'):'⏳'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// GAME: MANGALA (Traditional Turkish Board Game)
// ============================================================
function MangalaGame({ onGameEnd, soundOn }) {
  // pits[0..5] = player 0 bottom row (left to right), pits[6..11] = player 1 top row (right to left)
  // hazne[0] = player 0 store, hazne[1] = player 1 store
  const initState = () => ({ pits: Array(12).fill(3), hazne: [0, 0] });
  const [state, setState] = useState(initState);
  const [turn, setTurn] = useState(0); // 0 or 1
  const [lastCapture, setLastCapture] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);

  const endGame = (pits, hazne) => {
    const total = [...hazne];
    for (let i = 0; i < 6; i++) total[0] += pits[i];
    for (let i = 6; i < 12; i++) total[1] += pits[i];
    setGameOver(true);
    const w = total[0] > total[1] ? 0 : total[0] < total[1] ? 1 : 2;
    setWinner(w);
    onGameEnd(w === 0 ? 'win' : w === 1 ? 'loss' : 'draw');
  };

  const handlePit = (pitIdx) => {
    if (gameOver) return;
    const { pits, hazne } = state;
    const np = [...pits]; const nh = [...hazne];
    // pitIdx 0-5 = player 0, 6-11 = player 1
    const owner = pitIdx < 6 ? 0 : 1;
    if (owner !== turn || np[pitIdx] === 0) return;
    let stones = np[pitIdx]; np[pitIdx] = 0;
    let cur = pitIdx;
    let extraTurn = false;
    while (stones > 0) {
      cur = (cur + 1) % 14;
      if (cur === 12 + (1 - turn)) { cur = (cur + 1) % 14; } // skip opponent's hazne (12=p0 hazne, 13=p1 hazne)
      if (cur === 12 + turn) { nh[turn]++; } // own hazne
      else { np[cur % 12]++; }
      stones--;
    }
    // extra turn if last stone in own hazne
    if (cur === 12 + turn) extraTurn = true;
    // capture: last stone in own empty pit → capture mirror
    if (!extraTurn && cur < 12 && owner === turn) {
      const isOwnPit = (turn === 0 && cur < 6) || (turn === 1 && cur >= 6);
      if (isOwnPit && np[cur] === 1) {
        const mirror = 11 - cur;
        if (np[mirror] > 0) {
          nh[turn] += np[mirror] + 1; np[cur] = 0; np[mirror] = 0;
          setLastCapture(cur);
          setTimeout(() => setLastCapture(null), 600);
        }
      }
    }
    if (soundOn) playSound('place');
    // check end: either row empty
    const p0empty = np.slice(0, 6).every(v => v === 0);
    const p1empty = np.slice(6, 12).every(v => v === 0);
    if (p0empty || p1empty) { setState({ pits: np, hazne: nh }); endGame(np, nh); return; }
    setState({ pits: np, hazne: nh });
    if (!extraTurn) setTurn(1 - turn);
  };

  const restart = () => { setState(initState()); setTurn(0); setGameOver(false); setWinner(null); };

  const { pits, hazne } = state;
  const cellStyle = (pitIdx, disabled) => ({
    width: 48, height: 48, borderRadius: '50%', border: '2px solid',
    borderColor: disabled ? 'var(--border)' : turn === (pitIdx < 6 ? 0 : 1) ? '#F59E0B' : 'var(--border)',
    background: disabled ? 'var(--surface)' : 'linear-gradient(135deg,#92400E,#F59E0B)',
    color: '#fff', fontSize: 16, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2,
    outline: lastCapture === pitIdx ? '3px solid #ef4444' : 'none',
  });

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '16px 12px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 22 }}>🪨 Mangala</h2>
        <Button onClick={restart} style={{ fontSize: 13, padding: '6px 12px' }}>Yeni</Button>
      </div>
      <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
        {gameOver ? (winner === 2 ? 'Berabere!' : `Oyuncu ${winner + 1} kazandı!`) : `Sıra: Oyuncu ${turn + 1}`}
      </div>
      {/* Board */}
      <div style={{ background: '#78350F', borderRadius: 16, padding: 12, userSelect: 'none' }}>
        {/* Player 1 row (top, reversed) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, justifyContent: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: 8, background: '#1A1A2E', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, border: '2px solid #F59E0B' }}>{hazne[1]}</div>
          {[11, 10, 9, 8, 7, 6].map(i => (
            <div key={i} onClick={() => handlePit(i)} style={cellStyle(i, gameOver || turn !== 1 || pits[i] === 0)}>
              <span style={{ fontSize: 11, lineHeight: 1 }}>🪨</span>
              <span>{pits[i]}</span>
            </div>
          ))}
          <div style={{ width: 52, height: 52, borderRadius: 8, background: '#1A1A2E', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, border: '2px solid #F59E0B' }}>{hazne[0]}</div>
        </div>
        {/* Player 0 row (bottom) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
          <div style={{ width: 52 }} />
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} onClick={() => handlePit(i)} style={cellStyle(i, gameOver || turn !== 0 || pits[i] === 0)}>
              <span>{pits[i]}</span>
              <span style={{ fontSize: 11, lineHeight: 1 }}>🪨</span>
            </div>
          ))}
          <div style={{ width: 52 }} />
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
        Oyuncu 1: {hazne[0]} taş &nbsp;|&nbsp; Oyuncu 2: {hazne[1]} taş
      </div>
      {gameOver && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <Card style={{ padding: 32, textAlign: 'center', maxWidth: 280 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>{winner === 0 ? '🏆' : winner === 1 ? '😔' : '🤝'}</div>
            <h2 style={{ fontFamily: "'Sora',sans-serif", fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
              {winner === 2 ? 'Berabere!' : `Oyuncu ${winner + 1} Kazandı!`}
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>{hazne[0]} - {hazne[1]}</p>
            <Button onClick={restart}>Tekrar Oyna</Button>
          </Card>
        </div>
      )}
    </div>
  );
}

// ============================================================
// GAME: SIMON (Color Sequence Memory)
// ============================================================
const SIMON_COLORS = [
  { id: 0, name: 'Kırmızı', bg: '#DC2626', active: '#F87171', freq: 262 },
  { id: 1, name: 'Mavi', bg: '#1D4ED8', active: '#60A5FA', freq: 330 },
  { id: 2, name: 'Sarı', bg: '#D97706', active: '#FDE68A', freq: 392 },
  { id: 3, name: 'Yeşil', bg: '#059669', active: '#34D399', freq: 523 },
];
function SimonGame({ onGameEnd, soundOn }) {
  const [seq, setSeq] = useState([]);
  const [playerIdx, setPlayerIdx] = useState(0);
  const [phase, setPhase] = useState('idle'); // idle|showing|input|over
  const [activeColor, setActiveColor] = useState(null);
  const [level, setLevel] = useState(0);

  const playTone = (freq) => {
    if (!soundOn) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0.4, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.start(); o.stop(ctx.currentTime + 0.4);
    } catch(e) {}
  };

  const showSeq = (sequence) => {
    setPhase('showing');
    let i = 0;
    const step = () => {
      if (i >= sequence.length) { setActiveColor(null); setPhase('input'); return; }
      const c = sequence[i];
      setActiveColor(c);
      playTone(SIMON_COLORS[c].freq);
      setTimeout(() => { setActiveColor(null); setTimeout(() => { i++; step(); }, 200); }, 500);
    };
    setTimeout(step, 500);
  };

  const start = () => {
    const first = [Math.floor(Math.random() * 4)];
    setSeq(first); setPlayerIdx(0); setLevel(1);
    showSeq(first);
  };

  const handleTap = (colorId) => {
    if (phase !== 'input') return;
    playTone(SIMON_COLORS[colorId].freq);
    setActiveColor(colorId);
    setTimeout(() => setActiveColor(null), 200);
    if (colorId !== seq[playerIdx]) {
      if (soundOn) playSound('lose');
      setPhase('over');
      onGameEnd('loss');
      return;
    }
    const next = playerIdx + 1;
    if (next === seq.length) {
      if (soundOn) playSound('match');
      const newSeq = [...seq, Math.floor(Math.random() * 4)];
      setSeq(newSeq); setPlayerIdx(0); setLevel(newSeq.length);
      setTimeout(() => showSeq(newSeq), 800);
    } else {
      setPlayerIdx(next);
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: '0 auto', padding: '16px 12px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 22 }}>🔴 Simon</h2>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-secondary)' }}>Seviye {level}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 300, margin: '0 auto 20px' }}>
        {SIMON_COLORS.map(c => (
          <button key={c.id} onClick={() => handleTap(c.id)}
            disabled={phase !== 'input'}
            style={{ height: 120, borderRadius: 16, border: 'none', cursor: phase === 'input' ? 'pointer' : 'default',
              background: activeColor === c.id ? c.active : c.bg,
              transform: activeColor === c.id ? 'scale(0.95)' : 'scale(1)',
              transition: 'all 0.1s', boxShadow: activeColor === c.id ? '0 0 24px rgba(255,255,255,0.4)' : 'none',
              fontSize: 28, color: 'rgba(255,255,255,0.9)' }}>
            {c.name}
          </button>
        ))}
      </div>
      {phase === 'idle' && (
        <Button onClick={start} style={{ width: '100%', maxWidth: 200, padding: '14px' }}>Başla</Button>
      )}
      {phase === 'showing' && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Diziyi izle...</div>
      )}
      {phase === 'input' && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Şimdi sıra sende! ({playerIdx + 1}/{seq.length})</div>
      )}
      {phase === 'over' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <Card style={{ padding: 32, textAlign: 'center', maxWidth: 280 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>💥</div>
            <h2 style={{ fontFamily: "'Sora',sans-serif", fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Yanlış!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>Seviye {level}'e ulaştın</p>
            <Button onClick={start}>Tekrar Oyna</Button>
          </Card>
        </div>
      )}
    </div>
  );
}

// ============================================================
// GAME: LIGHTS OUT (Işığı Söndür)
// ============================================================
function LightsOutGame({ onGameEnd, soundOn }) {
  const DIFFICULTIES = [
    { label: 'Kolay', moves: 8 },
    { label: 'Normal', moves: 14 },
    { label: 'Zor', moves: 20 },
  ];
  const genPuzzle = (n) => {
    const g = Array(25).fill(false);
    const toggle = (idx) => {
      const r = Math.floor(idx / 5), c = idx % 5;
      [[0,0],[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc]) => {
        const nr = r+dr, nc = c+dc;
        if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) g[nr*5+nc] = !g[nr*5+nc];
      });
    };
    for (let i = 0; i < n; i++) toggle(Math.floor(Math.random() * 25));
    return [...g];
  };
  const [diff, setDiff] = useState(null);
  const [grid, setGrid] = useState(null);
  const [moves, setMoves] = useState(0);
  const [won, setWon] = useState(false);

  const startGame = (d) => {
    setDiff(d); setGrid(genPuzzle(d.moves)); setMoves(0); setWon(false);
  };

  const handleClick = (idx) => {
    if (!grid || won) return;
    const r = Math.floor(idx / 5), c = idx % 5;
    const ng = [...grid];
    [[0,0],[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc]) => {
      const nr = r+dr, nc = c+dc;
      if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) ng[nr*5+nc] = !ng[nr*5+nc];
    });
    if (soundOn) playSound('click');
    setGrid(ng); setMoves(m => m + 1);
    if (ng.every(v => !v)) { setWon(true); if (soundOn) playSound('win'); onGameEnd('win'); }
  };

  if (!diff) return (
    <div style={{ maxWidth: 360, margin: '0 auto', padding: '32px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>💡</div>
      <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 24, marginBottom: 8 }}>Işığı Söndür</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14 }}>Tüm lambaları kapatmak için bir lamba seçince çevresi de değişir!</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 240, margin: '0 auto' }}>
        {DIFFICULTIES.map(d => (
          <button key={d.label} onClick={() => startGame(d)}
            style={{ padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#D97706,#FDE68A)', color: '#1A1A2E', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 340, margin: '0 auto', padding: '16px 12px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 20 }}>💡 {diff.label}</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{moves} hamle</span>
          <Button onClick={() => setDiff(null)} style={{ fontSize: 12, padding: '4px 10px' }}>Menü</Button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, maxWidth: 300, margin: '0 auto' }}>
        {grid.map((on, i) => (
          <button key={i} onClick={() => handleClick(i)}
            style={{ aspectRatio: '1', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: on ? '#FDE68A' : '#374151',
              boxShadow: on ? '0 0 12px rgba(253,230,138,0.6)' : 'none',
              transition: 'all 0.15s', fontSize: on ? 20 : 12 }}>
            {on ? '💡' : ''}
          </button>
        ))}
      </div>
      {won && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <Card style={{ padding: 32, textAlign: 'center', maxWidth: 280 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
            <h2 style={{ fontFamily: "'Sora',sans-serif", fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Tebrikler!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>{moves} hamlede tamamladın</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <Button onClick={() => startGame(diff)}>Tekrar</Button>
              <Button variant="secondary" onClick={() => setDiff(null)}>Menü</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ============================================================
// GAME: NIM (Çubuk Oyunu)
// ============================================================
function NimGame({ onGameEnd, soundOn }) {
  const INIT = [3, 5, 7];
  const [rows, setRows] = useState([...INIT]);
  const [turn, setTurn] = useState(0);
  const [selectedRow, setSelectedRow] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [mode, setMode] = useState(null);
  const [removing, setRemoving] = useState(0);

  const nimValue = (r) => r.reduce((xor, v) => xor ^ v, 0);

  const applyMove = (r, rowIdx, count) => {
    const nr = [...r];
    nr[rowIdx] = Math.max(0, nr[rowIdx] - count);
    // last stick taken = loser
    if (nr.every(v => v === 0)) return { rows: nr, loser: turn };
    return { rows: nr, loser: null };
  };

  const botMove = (r) => {
    const nv = nimValue(r);
    // optimal: find a move that sets xor to 0
    for (let i = 0; i < r.length; i++) {
      const target = r[i] ^ nv;
      if (target < r[i]) return { row: i, count: r[i] - target };
    }
    // no winning move: remove 1 from largest row
    const maxRow = r.indexOf(Math.max(...r));
    return { row: maxRow, count: 1 };
  };

  const confirm = () => {
    if (removing === 0 || selectedRow === null) return;
    const { rows: nr, loser } = applyMove(rows, selectedRow, removing);
    if (soundOn) playSound('place');
    setRows(nr); setSelectedRow(null); setRemoving(0);
    if (loser !== null) {
      setGameOver(true); setWinner(1 - loser);
      onGameEnd(loser === 0 ? 'loss' : 'win'); return;
    }
    const next = 1 - turn; setTurn(next);
    if (mode === 'bot' && next === 1) {
      setTimeout(() => {
        const { row, count } = botMove(nr);
        const { rows: nr2, loser: l2 } = applyMove(nr, row, count);
        if (soundOn) playSound('place');
        setRows(nr2); setTurn(0);
        if (l2 !== null) { setGameOver(true); setWinner(0); onGameEnd('win'); }
      }, 700);
    }
  };

  const restart = () => { setRows([...INIT]); setTurn(0); setSelectedRow(null); setRemoving(0); setGameOver(false); setWinner(null); };

  if (!mode) return (
    <div style={{ maxWidth: 360, margin: '0 auto', padding: '32px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>🪵</div>
      <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 24, marginBottom: 8 }}>Çubuk Oyunu (Nim)</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 6, fontSize: 14 }}>Son çubuğu alan <strong>kaybeder</strong>. Her sırada istediğin kadar al.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 260, margin: '0 auto 0' }}>
        <button onClick={() => setMode('bot')} style={{ padding: '15px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#065F46,#34D399)', color: '#FFF', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>🤖 Bota Karşı</button>
        <button onClick={() => setMode('2p')} style={{ padding: '15px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#0369A1,#38BDF8)', color: '#FFF', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>📱 2 Kişi</button>
      </div>
    </div>
  );

  const isMyTurn = !gameOver && (mode === '2p' || turn === 0);

  return (
    <div style={{ maxWidth: 380, margin: '0 auto', padding: '16px 12px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 22 }}>🪵 Çubuk Oyunu</h2>
        <Button onClick={() => { restart(); setMode(null); }} style={{ fontSize: 12, padding: '6px 10px' }}>Menü</Button>
      </div>
      <div style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
        {gameOver ? `Oyuncu ${winner + 1} kazandı!` : mode === 'bot' && turn === 1 ? '🤖 Bot düşünüyor...' : `Sıra: Oyuncu ${turn + 1}`}
      </div>
      {INIT.map((_, ri) => (
        <div key={ri} onClick={() => isMyTurn && rows[ri] > 0 && setSelectedRow(ri === selectedRow ? null : ri)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '10px 12px', background: selectedRow === ri ? 'rgba(6,95,70,0.15)' : 'var(--surface)', borderRadius: 12, border: '2px solid ' + (selectedRow === ri ? '#34D399' : 'var(--border)'), cursor: isMyTurn && rows[ri] > 0 ? 'pointer' : 'default' }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', minWidth: 20 }}>S{ri + 1}</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
            {Array(INIT[ri]).fill(0).map((_, si) => (
              <span key={si} style={{ fontSize: 20, opacity: si < rows[ri] ? 1 : 0.12 }}>🪵</span>
            ))}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{rows[ri]}</span>
        </div>
      ))}
      {selectedRow !== null && isMyTurn && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Kaç tane al? (Sıra {selectedRow + 1}, max {rows[selectedRow]})</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            {Array(rows[selectedRow]).fill(0).map((_, n) => (
              <button key={n} onClick={() => setRemoving(n + 1)}
                style={{ width: 44, height: 44, borderRadius: 8, border: removing === n + 1 ? '2px solid #34D399' : '1px solid var(--border)', background: removing === n + 1 ? 'rgba(52,211,153,0.15)' : 'var(--surface)', fontWeight: 700, cursor: 'pointer', fontSize: 16 }}>
                {n + 1}
              </button>
            ))}
          </div>
          {removing > 0 && <Button onClick={confirm} style={{ background: '#065F46', padding: '10px 24px' }}>{removing} tane al ✓</Button>}
        </div>
      )}
      {gameOver && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <Card style={{ padding: 32, textAlign: 'center', maxWidth: 280 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>{winner === 0 ? '🏆' : '😔'}</div>
            <h2 style={{ fontFamily: "'Sora',sans-serif", fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
              {mode === 'bot' ? (winner === 0 ? 'Kazandın!' : 'Bot Kazandı!') : `Oyuncu ${winner + 1} Kazandı!`}
            </h2>
            <Button onClick={restart}>Tekrar Oyna</Button>
          </Card>
        </div>
      )}
    </div>
  );
}

// ============================================================
// GAME: BRICK BREAKER (Top Patlatma)
// ============================================================
const BB_COLS = 8, BB_ROWS = 5, PADDLE_W = 80, BALL_R = 8;
function BrickBreakerGame({ onGameEnd, soundOn }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const rafRef = useRef(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [phase, setPhase] = useState('idle'); // idle|playing|over|won
  const [level, setLevel] = useState(1);

  const canvasSize = Math.min(380, typeof window !== 'undefined' ? window.innerWidth - 32 : 380);
  const CH = Math.round(canvasSize * 0.7);

  const initState = (lv) => {
    const bh = 18, bgap = 4, btop = 40;
    const bw = (canvasSize - (BB_COLS + 1) * bgap) / BB_COLS;
    const bricks = [];
    for (let r = 0; r < BB_ROWS; r++) {
      for (let c = 0; c < BB_COLS; c++) {
        bricks.push({ x: bgap + c*(bw+bgap), y: btop + r*(bh+bgap), w: bw, h: bh, alive: true,
          color: ['#E63946','#E76F51','#F4A261','#2A9D8F','#457B9D'][r] });
      }
    }
    return {
      paddle: { x: canvasSize/2 - PADDLE_W/2, y: CH - 28, w: PADDLE_W, h: 12 },
      ball: { x: canvasSize/2, y: CH - 60, vx: 3 + lv*0.5, vy: -(3 + lv*0.5) },
      bricks, scoreInc: 0, launched: false, lives: 3,
    };
  };

  const drawFrame = (ctx, s) => {
    ctx.clearRect(0, 0, canvasSize, CH);
    ctx.fillStyle = '#0F0F17';
    ctx.fillRect(0, 0, canvasSize, CH);
    // bricks
    s.bricks.forEach(b => {
      if (!b.alive) return;
      ctx.fillStyle = b.color; ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 4); ctx.fill();
    });
    // paddle
    ctx.fillStyle = '#E8E8ED'; ctx.beginPath();
    ctx.roundRect(s.paddle.x, s.paddle.y, s.paddle.w, s.paddle.h, 6); ctx.fill();
    // ball
    ctx.fillStyle = '#FCD34D'; ctx.beginPath();
    ctx.arc(s.ball.x, s.ball.y, BALL_R, 0, Math.PI*2); ctx.fill();
  };

  const loop = () => {
    const s = stateRef.current;
    if (!s || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!s.launched) { drawFrame(ctx, s); rafRef.current = requestAnimationFrame(loop); return; }
    const b = s.ball; const p = s.paddle;
    b.x += b.vx; b.y += b.vy;
    // wall bounce
    if (b.x - BALL_R < 0) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
    if (b.x + BALL_R > canvasSize) { b.x = canvasSize - BALL_R; b.vx = -Math.abs(b.vx); }
    if (b.y - BALL_R < 0) { b.y = BALL_R; b.vy = Math.abs(b.vy); }
    // paddle bounce
    if (b.vy > 0 && b.y + BALL_R >= p.y && b.y - BALL_R <= p.y + p.h && b.x >= p.x && b.x <= p.x + p.w) {
      const hit = (b.x - (p.x + p.w/2)) / (p.w/2);
      b.vy = -Math.abs(b.vy); b.vx = hit * 5;
      const speed = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
      const cap = 8 + level; b.vx = b.vx/speed*Math.min(speed, cap); b.vy = b.vy/speed*Math.min(speed, cap);
    }
    // brick collision
    let brokeBrick = false;
    for (const br of s.bricks) {
      if (!br.alive) continue;
      if (b.x + BALL_R > br.x && b.x - BALL_R < br.x+br.w && b.y + BALL_R > br.y && b.y - BALL_R < br.y+br.h) {
        br.alive = false; brokeBrick = true;
        const overlapL = b.x+BALL_R - br.x, overlapR = br.x+br.w - (b.x-BALL_R);
        const overlapT = b.y+BALL_R - br.y, overlapB = br.y+br.h - (b.y-BALL_R);
        if (Math.min(overlapL,overlapR) < Math.min(overlapT,overlapB)) b.vx = -b.vx;
        else b.vy = -b.vy;
        s.scoreInc += 10; setScore(sc => sc + 10);
        break;
      }
    }
    // ball lost
    if (b.y - BALL_R > CH) {
      s.lives--; setLives(s.lives);
      if (s.lives <= 0) { cancelAnimationFrame(rafRef.current); setPhase('over'); onGameEnd('loss'); return; }
      b.x = canvasSize/2; b.y = p.y - 20; b.vx = 3+level*0.5; b.vy = -(3+level*0.5); s.launched = false;
    }
    // level won
    if (s.bricks.every(br => !br.alive)) { cancelAnimationFrame(rafRef.current); setPhase('won'); onGameEnd('win'); return; }
    drawFrame(ctx, s);
    rafRef.current = requestAnimationFrame(loop);
  };

  const start = () => {
    stateRef.current = initState(level);
    setScore(0); setLives(3); setPhase('playing');
    rafRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    if (phase !== 'playing') return;
    const handleTouch = (e) => {
      const s = stateRef.current; if (!s) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const tx = e.touches[0].clientX - rect.left;
      s.paddle.x = Math.max(0, Math.min(canvasSize - PADDLE_W, tx - PADDLE_W/2));
      if (!s.launched) { s.launched = true; }
    };
    const handleKey = (e) => {
      const s = stateRef.current; if (!s) return;
      if (e.key === ' ' || e.key === 'Enter') { s.launched = true; return; }
      if (e.key === 'ArrowLeft') s.paddle.x = Math.max(0, s.paddle.x - 20);
      if (e.key === 'ArrowRight') s.paddle.x = Math.min(canvasSize - PADDLE_W, s.paddle.x + 20);
    };
    const handleMouseMove = (e) => {
      const s = stateRef.current; if (!s) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      s.paddle.x = Math.max(0, Math.min(canvasSize - PADDLE_W, e.clientX - rect.left - PADDLE_W/2));
    };
    const handleClick = () => { const s = stateRef.current; if (s && !s.launched) s.launched = true; };
    window.addEventListener('keydown', handleKey);
    canvasRef.current?.addEventListener('touchmove', handleTouch, { passive: true });
    canvasRef.current?.addEventListener('touchstart', handleTouch, { passive: true });
    canvasRef.current?.addEventListener('mousemove', handleMouseMove);
    canvasRef.current?.addEventListener('click', handleClick);
    return () => {
      window.removeEventListener('keydown', handleKey);
      canvasRef.current?.removeEventListener('touchmove', handleTouch);
      canvasRef.current?.removeEventListener('touchstart', handleTouch);
      canvasRef.current?.removeEventListener('mousemove', handleMouseMove);
      canvasRef.current?.removeEventListener('click', handleClick);
      cancelAnimationFrame(rafRef.current);
    };
  }, [phase, level]);

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '12px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>🧱 {score}</div>
        <div style={{ fontWeight: 700 }}>{'❤️'.repeat(lives)}</div>
        <div style={{ fontWeight: 700 }}>Lvl {level}</div>
      </div>
      <canvas ref={canvasRef} width={canvasSize} height={CH}
        style={{ borderRadius: 12, border: '2px solid var(--border)', display: 'block', margin: '0 auto', touchAction: 'none' }} />
      {phase === 'idle' && (
        <Button onClick={start} style={{ marginTop: 16, padding: '12px 28px' }}>Başla</Button>
      )}
      {(phase === 'playing' && stateRef.current && !stateRef.current?.launched) && (
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>Tıkla veya dokun → başla</div>
      )}
      {(phase === 'over' || phase === 'won') && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <Card style={{ padding: 32, textAlign: 'center', maxWidth: 280 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>{phase === 'won' ? '🎉' : '💥'}</div>
            <h2 style={{ fontFamily: "'Sora',sans-serif", fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{phase === 'won' ? 'Tebrikler!' : 'Oyun Bitti'}</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>Skor: {score}</p>
            <Button onClick={() => { setPhase('idle'); cancelAnimationFrame(rafRef.current); }}>Tekrar</Button>
          </Card>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CONSTANTS & HELPERS
// ============================================================
// genre: 'strateji' | 'hız' | 'hafıza' | 'kelime' | 'bulmaca' | 'klasik'
const GAMES = [
  {
    id: 'xox',
    name: 'XOX',
    desc: 'Klasik Tic-Tac-Toe',
    icon: '✕○',
    players: 2,
    genre: 'strateji',
    popular: true,
    color: '#E63946',
    bg: 'linear-gradient(135deg, #E63946 0%, #F4845F 100%)',
  },
  {
    id: 'connectfour',
    name: '4 Sıra',
    desc: '4 taşı diz, kazanmak için yarış',
    icon: '🔵',
    players: 2,
    local: true,
    genre: 'strateji',
    popular: true,
    color: '#1D4ED8',
    bg: 'linear-gradient(135deg, #1D4ED8 0%, #60A5FA 100%)',
  },
  {
    id: 'gomoku',
    name: 'Beş Taş',
    desc: '5 taşı diz, rakibini geç',
    icon: '⚫',
    players: 2,
    local: true,
    genre: 'strateji',
    color: '#1F2937',
    bg: 'linear-gradient(135deg, #1F2937 0%, #4B5563 100%)',
  },
  {
    id: 'rps',
    name: 'Taş Kağıt Makas',
    desc: 'En iyi 3 kazanır',
    icon: '✊✋✌',
    players: 2,
    genre: 'hız',
    popular: true,
    color: '#2A9D8F',
    bg: 'linear-gradient(135deg, #2A9D8F 0%, #76C893 100%)',
  },
  {
    id: 'reaction',
    name: 'Tepki Yarışı',
    desc: 'Ekrana en hızlı kim basar?',
    icon: '⚡',
    players: 2,
    local: true,
    genre: 'hız',
    color: '#D97706',
    bg: 'linear-gradient(135deg, #D97706 0%, #FCD34D 100%)',
  },
  {
    id: 'mathduel',
    name: 'Matematik Düellosu',
    desc: 'Soruları en hızlı sen çöz',
    icon: '🧮',
    players: 2,
    local: true,
    genre: 'hız',
    popular: true,
    color: '#0369A1',
    bg: 'linear-gradient(135deg, #0369A1 0%, #38BDF8 100%)',
  },
  {
    id: 'cardbattle',
    name: 'Kart Savaşı',
    desc: 'Yüksek kart kazanır',
    icon: '🃏',
    players: 2,
    local: true,
    genre: 'hafıza',
    color: '#7C3AED',
    bg: 'linear-gradient(135deg, #7C3AED 0%, #C084FC 100%)',
  },
  {
    id: 'memorybattle',
    name: 'Hafıza Savaşı',
    desc: 'Eşleri bul, skoru kap',
    icon: '🧠',
    players: 2,
    local: true,
    genre: 'hafıza',
    color: '#BE185D',
    bg: 'linear-gradient(135deg, #BE185D 0%, #F472B6 100%)',
  },
  {
    id: 'wordrace',
    name: 'Kelime Yarışı',
    desc: 'Anagramı kim önce çözer?',
    icon: '🔤',
    players: 2,
    local: true,
    genre: 'kelime',
    color: '#065F46',
    bg: 'linear-gradient(135deg, #065F46 0%, #34D399 100%)',
  },
  {
    id: 'minesweeper',
    name: 'Mayın Tarlası',
    desc: 'Mayınları bulmadan alanı temizle',
    icon: '💣',
    players: 1,
    genre: 'bulmaca',
    popular: true,
    color: '#457B9D',
    bg: 'linear-gradient(135deg, #457B9D 0%, #48CAE4 100%)',
  },
  {
    id: 'sudoku',
    name: 'Sudoku',
    desc: 'Rakamları yerleştir, 3 hata hakkın var',
    icon: '🔲',
    players: 1,
    genre: 'bulmaca',
    popular: true,
    color: '#7C3AED',
    bg: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',
  },
  {
    id: 'dama',
    name: 'Dama',
    desc: 'Türk Dama — bota karşı oyna',
    icon: '⚫',
    players: 1,
    genre: 'klasik',
    color: '#457B9D',
    bg: 'linear-gradient(135deg, #457B9D 0%, #1D3557 100%)',
  },
  {
    id: 'snake',
    name: 'Yılan Oyunu',
    desc: 'Klasik Snake',
    icon: '🐍',
    players: 1,
    genre: 'hız',
    popular: true,
    color: '#059669',
    bg: 'linear-gradient(135deg, #059669 0%, #34D399 100%)',
  },
  {
    id: '2048',
    name: '2048',
    desc: "Sayıları birleştir, 2048'e ulaş",
    icon: '🔢',
    players: 1,
    genre: 'bulmaca',
    popular: true,
    color: '#F59563',
    bg: 'linear-gradient(135deg, #BBADA0 0%, #F59563 100%)',
  },
  {
    id: 'memory',
    name: 'Hafıza Kartları',
    desc: 'Eşleri bul, hafızanı test et',
    icon: '🃏',
    players: 1,
    genre: 'hafıza',
    popular: true,
    color: '#7C3AED',
    bg: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',
  },
  {
    id: 'wordle',
    name: 'Wordle TR',
    desc: 'Türkçe kelime tahmin oyunu',
    icon: '🔤',
    players: 1,
    genre: 'kelime',
    popular: true,
    color: '#538D4E',
    bg: 'linear-gradient(135deg, #538D4E 0%, #6AAF5E 100%)',
  },
  {
    id: 'mangala',
    name: 'Mangala',
    desc: 'Türklerin geleneksel taş oyunu — 2 kişilik',
    icon: '🪨',
    players: 2,
    local: true,
    genre: 'klasik',
    color: '#92400E',
    bg: 'linear-gradient(135deg, #92400E 0%, #F59E0B 100%)',
  },
  {
    id: 'simon',
    name: 'Simon Söylüyor',
    desc: 'Renk dizisini hafızanda tut ve tekrar et',
    icon: '🔴',
    players: 1,
    genre: 'hafıza',
    color: '#BE185D',
    bg: 'linear-gradient(135deg, #BE185D 0%, #F472B6 100%)',
  },
  {
    id: 'lightsout',
    name: 'Işığı Söndür',
    desc: 'Tüm lambaları kapatmak için ızgaraya dokun',
    icon: '💡',
    players: 1,
    genre: 'bulmaca',
    color: '#D97706',
    bg: 'linear-gradient(135deg, #D97706 0%, #FDE68A 100%)',
  },
  {
    id: 'brickbreaker',
    name: 'Top Patlatma',
    desc: 'Topu paddledan sektirerek tuğlaları kır',
    icon: '🧱',
    players: 1,
    genre: 'hız',
    color: '#0369A1',
    bg: 'linear-gradient(135deg, #0369A1 0%, #38BDF8 100%)',
  },
  {
    id: 'nim',
    name: 'Çubuk Oyunu',
    desc: 'Son çubuğu alan kaybeder — klasik strateji',
    icon: '🪵',
    players: 2,
    local: true,
    genre: 'klasik',
    color: '#065F46',
    bg: 'linear-gradient(135deg, #065F46 0%, #6EE7B7 100%)',
  },
  {
    id: 'hizcarpim',
    name: 'Hız Çarpım',
    desc: '60 saniyede çarpım sorularını çöz',
    icon: '🚀',
    players: 1,
    genre: 'hız',
    color: '#0EA5E9',
    bg: 'linear-gradient(135deg, #0EA5E9 0%, #38BDF8 100%)',
  },
  {
    id: 'tarihefsan',
    name: 'Tarih mi Efsane mi?',
    desc: 'Türk tarihi ve kültürü hakkında doğru/yanlış',
    icon: '📚',
    players: 1,
    genre: 'strateji',
    color: '#7C3AED',
    bg: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',
  },
  {
    id: 'kelimeav',
    name: 'Kelime Avcısı',
    desc: '12 harften kelime bul, puan topla',
    icon: '🔍',
    players: 1,
    genre: 'kelime',
    isNew: true,
    color: '#0F766E',
    bg: 'linear-gradient(135deg, #0F766E 0%, #2DD4BF 100%)',
  },
  {
    id: 'emojimuz',
    name: 'Emoji Müzayedesi',
    desc: 'Emoji dizisinin anlamını bul',
    icon: '🎭',
    players: 1,
    genre: 'kelime',
    isNew: true,
    color: '#BE185D',
    bg: 'linear-gradient(135deg, #BE185D 0%, #FB7185 100%)',
  },
  {
    id: 'tavla',
    name: 'Tavla',
    desc: 'Klasik Türk tavlası — bota karşı oyna',
    icon: '🎲',
    players: 1,
    genre: 'klasik',
    isNew: true,
    color: '#92400E',
    bg: 'linear-gradient(135deg, #92400E 0%, #D97706 100%)',
  },
  {
    id: 'kelimezinciri',
    name: 'Kelime Zinciri',
    desc: 'Son harften kelime üret, zinciri uzat',
    icon: '🔗',
    players: 1,
    genre: 'kelime',
    isNew: true,
    color: '#0F766E',
    bg: 'linear-gradient(135deg, #0F766E 0%, #2DD4BF 100%)',
  },
  {
    id: 'deyimtamamla',
    name: 'Deyim Tamamla',
    desc: 'Türk atasözü ve deyimlerini tamamla',
    icon: '📖',
    players: 1,
    genre: 'kelime',
    isNew: true,
    color: '#7C3AED',
    bg: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',
  },
  {
    id: 'sorugecesi',
    name: 'Soru Gecesi',
    desc: '2-4 kişilik bilgi yarışması — sırayla oynayın',
    icon: '🧠',
    players: 4,
    minPlayers: 2,
    local: true,
    genre: 'strateji',
    isNew: true,
    color: '#6366F1',
    bg: 'linear-gradient(135deg, #6366F1 0%, #A78BFA 100%)',
  },
  {
    id: 'adamasmaca',
    name: 'Adam Asmaca',
    desc: 'Türkçe kelimeyi 6 denemede bul',
    icon: '🪢',
    players: 1,
    genre: 'kelime',
    isNew: true,
    color: '#6366F1',
    bg: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
  },
  {
    id: 'stroop',
    name: 'Stroop Testi',
    desc: 'Kelimenin rengini seç — zihin oyunu',
    icon: '🎨',
    players: 1,
    genre: 'hız',
    isNew: true,
    popular: true,
    color: '#BE185D',
    bg: 'linear-gradient(135deg, #BE185D 0%, #F472B6 100%)',
  },
];

const getDailyGameId = () => {
  var d = new Date();
  var dayNum = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  var popularGames = GAMES.filter(function(g){ return g.players === 1 || !g.local; });
  return popularGames[dayNum % popularGames.length].id;
};

const generateRoomId = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

// ============================================================
// SOUND SYSTEM (Web Audio API)
// ============================================================
const audioCtxRef = { current: null };
const getAudioCtx = () => {
  if (!audioCtxRef.current) {
    try {
      audioCtxRef.current = new (window.AudioContext ||
        window.webkitAudioContext)();
    } catch (e) {}
  }
  if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
  return audioCtxRef.current;
};

const playSound = (type) => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  const t = ctx.currentTime;

  switch (type) {
    case 'click':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, t);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.start(t);
      osc.stop(t + 0.08);
      break;
    case 'place':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.exponentialRampToValueAtTime(680, t + 0.06);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.start(t);
      osc.stop(t + 0.1);
      break;
    case 'match':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523, t);
      osc.frequency.setValueAtTime(659, t + 0.1);
      osc.frequency.setValueAtTime(784, t + 0.2);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
      break;
    case 'win':
      osc.type = 'square';
      [523, 659, 784, 1047].forEach((f, i) => {
        osc.frequency.setValueAtTime(f, t + i * 0.12);
      });
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.start(t);
      osc.stop(t + 0.55);
      break;
    case 'lose':
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.35);
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.4);
      break;
    case 'flip':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, t);
      osc.frequency.exponentialRampToValueAtTime(600, t + 0.05);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.start(t);
      osc.stop(t + 0.06);
      break;
    case 'eat':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(900, t + 0.08);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.start(t);
      osc.stop(t + 0.12);
      break;
    case 'explode':
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.3);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
      break;
    case 'countdown':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, t);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.start(t);
      osc.stop(t + 0.1);
      break;
    default:
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t);
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.start(t);
      osc.stop(t + 0.1);
  }
};

function playHaptic(type) {
  try {
    if (!navigator.vibrate) return;
    if (type === 'correct') navigator.vibrate(35);
    else if (type === 'wrong') navigator.vibrate([60,20,60]);
    else if (type === 'win') navigator.vibrate([50,30,80,30,120]);
    else if (type === 'tap') navigator.vibrate(12);
  } catch(e) {}
}

function FloatingXP({ xp, onDone }) {
  React.useEffect(function() {
    var t = setTimeout(onDone, 1200);
    return function() { clearTimeout(t); };
  }, [onDone]);
  return (
    <div style={{ position:'fixed', top:'40%', left:'50%', transform:'translateX(-50%)', zIndex:9999, pointerEvents:'none', animation:'floatXP 1.2s ease forwards', fontFamily:"'Sora',sans-serif", fontWeight:800, fontSize:22, color:'#a855f7', textShadow:'0 2px 8px rgba(134,59,255,0.5)', whiteSpace:'nowrap' }}>
      +{xp} XP ⚡
    </div>
  );
}

const AVATAR_COLORS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
];

// ============================================================
// GLOBAL STYLES
// ============================================================
const GlobalStyle = ({ dark }) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700&family=Sora:wght@300;400;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: ${dark ? '#0F0F17' : '#FAFAFA'};
      --surface: ${dark ? '#1A1A2E' : '#FFFFFF'};
      --surface-hover: ${dark ? '#252540' : '#F5F5F5'};
      --text: ${dark ? '#E8E8ED' : '#1A1A2E'};
      --text-secondary: ${dark ? '#8B8BA3' : '#6B7280'};
      --border: ${dark ? '#2A2A45' : '#E5E7EB'};
      --accent: ${dark ? '#E8E8ED' : '#1A1A2E'};
      --radius: 16px; --radius-sm: 10px;
      --shadow: ${
        dark
          ? '0 1px 3px rgba(0,0,0,0.2), 0 6px 24px rgba(0,0,0,0.3)'
          : '0 1px 3px rgba(0,0,0,0.04), 0 6px 24px rgba(0,0,0,0.06)'
      };
      --shadow-lg: ${
        dark
          ? '0 4px 12px rgba(0,0,0,0.3), 0 20px 48px rgba(0,0,0,0.4)'
          : '0 4px 12px rgba(0,0,0,0.06), 0 20px 48px rgba(0,0,0,0.1)'
      };
      --transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      --header-bg: ${dark ? 'rgba(15,15,23,0.85)' : 'rgba(255,255,255,0.85)'};
    }
    html { -webkit-text-size-adjust: 100%; }
    body { font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; transition: background 0.3s ease, color 0.3s ease; overscroll-behavior: none; }
    button { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
    input, select, textarea { touch-action: manipulation; font-size: 16px !important; }
    * { -webkit-tap-highlight-color: transparent; }
    @media (max-width: 480px) {
      body { font-size: 15px; }
    }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fadeInDown { from { opacity: 0; transform: translate(-50%, -12px); } to { opacity: 1; transform: translate(-50%, 0); } }
    @keyframes scaleIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
    @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
    @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    @keyframes countUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes popIn { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
    @keyframes confettiBurst { 0% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; } 100% { transform: translateY(-80px) rotate(360deg) scale(0); opacity: 0; } }
    @keyframes slideInRight { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes bounceIn { 0% { transform: scale(0.3); opacity: 0; } 50% { transform: scale(1.05); } 70% { transform: scale(0.95); } 100% { transform: scale(1); opacity: 1; } }
    @keyframes glow { 0%, 100% { box-shadow: 0 0 8px rgba(230,57,70,0.3); } 50% { box-shadow: 0 0 20px rgba(230,57,70,0.6); } }
    @keyframes ripple { 0% { transform: scale(0); opacity: 0.5; } 100% { transform: scale(4); opacity: 0; } }
    @keyframes livePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.4)} }
    @keyframes floatXP { 0% { transform: translateX(-50%) translateY(0); opacity: 1; } 80% { opacity: 1; } 100% { transform: translateX(-50%) translateY(-80px); opacity: 0; } }
    .header-nav-desktop { display: flex; align-items: center; gap: 2px; }
    .bottom-nav { display: none !important; }
    @media (max-width: 768px) {
      .header-nav-desktop { display: none !important; }
      .bottom-nav {
        display: flex !important;
        position: fixed; bottom: 0; left: 0; right: 0;
        background: var(--header-bg); backdrop-filter: blur(20px);
        border-top: 1px solid var(--border); z-index: 100;
        padding-bottom: env(safe-area-inset-bottom, 6px);
      }
      .bnav-tab {
        flex: 1; display: flex; flex-direction: column; align-items: center;
        padding: 8px 4px 6px; background: none; border: none; cursor: pointer;
        font-family: 'DM Sans', sans-serif; gap: 3px; -webkit-tap-highlight-color: transparent;
      }
      .bnav-icon { font-size: 20px; line-height: 1; }
      .bnav-label { font-size: 10px; font-weight: 600; color: var(--text-secondary); }
      .bnav-tab.bnav-active .bnav-label { color: #6366f1; }
      .bnav-dot { display: none; }
      .bnav-tab.bnav-active .bnav-dot { display: block; width: 4px; height: 4px; border-radius: 50%; background: #6366f1; margin-top: 1px; }
      .main-content { padding-bottom: 72px; }
      .sound-toggle-float { display: none !important; }
    }
  `}</style>
);

// ============================================================
// REUSABLE COMPONENTS
// ============================================================
const Button = ({
  children,
  onClick,
  variant = 'primary',
  style = {},
  disabled = false,
}) => {
  const variants = {
    primary: { background: 'var(--accent)', color: '#fff' },
    secondary: {
      background: 'var(--surface)',
      color: 'var(--text)',
      border: '1px solid var(--border)',
    },
    ghost: { background: 'transparent', color: 'var(--text-secondary)' },
    danger: { background: '#FEE2E2', color: '#DC2626' },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 15,
        fontWeight: 600,
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'var(--transition)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: disabled ? 0.5 : 1,
        padding: '12px 24px',
        ...variants[variant],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.target.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.target.style.transform = 'translateY(0)';
      }}
    >
      {children}
    </button>
  );
};

const Card = ({ children, style = {}, onClick, hoverable }) => (
  <div
    onClick={onClick}
    style={{
      background: 'var(--surface)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)',
      border: '1px solid var(--border)',
      padding: 24,
      transition: 'var(--transition)',
      cursor: onClick ? 'pointer' : 'default',
      ...style,
    }}
    onMouseEnter={(e) => {
      if (hoverable || onClick) {
        e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }
    }}
    onMouseLeave={(e) => {
      if (hoverable || onClick) {
        e.currentTarget.style.boxShadow = 'var(--shadow)';
        e.currentTarget.style.transform = 'translateY(0)';
      }
    }}
  >
    {children}
  </div>
);

const Toast = ({ message, visible }) => (
  <div
    style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: `translateX(-50%) translateY(${visible ? 0 : 20}px)`,
      background: 'var(--accent)',
      color: '#fff',
      padding: '12px 24px',
      borderRadius: 50,
      fontSize: 14,
      fontWeight: 500,
      opacity: visible ? 1 : 0,
      transition: 'all 0.3s ease',
      zIndex: 1000,
      fontFamily: "'DM Sans', sans-serif",
      pointerEvents: 'none',
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    }}
  >
    {message}
  </div>
);

const Confetti = ({ active, color = '#E63946' }) => {
  if (!active) return null;
  const particles = Array.from({ length: 20 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    dur: 0.8 + Math.random() * 0.6,
    size: 6 + Math.random() * 8,
    color: [color, '#FFD700', '#4FC3F7', '#81C784', '#BA68C8', '#FF8A65'][
      i % 6
    ],
    rotation: Math.random() * 360,
    xDrift: (Math.random() - 0.5) * 60,
  }));
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 999,
        overflow: 'hidden',
      }}
    >
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: '40%',
            width: p.size,
            height: p.size,
            borderRadius: p.size > 10 ? 2 : '50%',
            background: p.color,
            animation: `confettiBurst ${p.dur}s ease-out ${p.delay}s both`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
};

const SoundToggle = ({ soundOn, onToggle }) => (
  <button
    className="sound-toggle-float"
    onClick={onToggle}
    title={soundOn ? 'Sesi Kapat' : 'Sesi Aç'}
    style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      width: 44,
      height: 44,
      borderRadius: '50%',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow)',
      cursor: 'pointer',
      fontSize: 18,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      transition: 'var(--transition)',
    }}
    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
  >
    {soundOn ? '🔊' : '🔇'}
  </button>
);

const AVATAR_EMOJIS = ['🎮','🏆','🦁','🐯','🦊','🐧','🚀','🌟','🎯','🎸','🔥','💎','🦄','🐉','🎪','⚡','🌈','🎭','🤖','👾','🎲','🏄','🦅','🐺','🌙'];
const Avatar = ({ name, size = 36, gradient, style = {}, emoji }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      flexShrink: 0,
      background: emoji ? 'var(--surface-hover)' :
        gradient ||
        AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length],
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontWeight: 700,
      fontSize: emoji ? size * 0.55 : size * 0.38,
      fontFamily: "'Sora', sans-serif",
      border: emoji ? '2px solid var(--border)' : 'none',
      ...style,
    }}
  >
    {emoji || name?.charAt(0).toUpperCase()}
  </div>
);

const StatBox = ({ label, value, color, delay = 0 }) => (
  <div
    style={{
      textAlign: 'center',
      padding: '16px 12px',
      background: 'var(--surface)',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border)',
      animation: 'countUp 0.4s ease',
      animationDelay: `${delay}s`,
      animationFillMode: 'both',
    }}
  >
    <div
      style={{
        fontFamily: "'Sora', sans-serif",
        fontSize: 28,
        fontWeight: 800,
        color: color || 'var(--text)',
      }}
    >
      {value}
    </div>
    <div
      style={{
        fontSize: 12,
        color: 'var(--text-secondary)',
        marginTop: 4,
        fontWeight: 500,
      }}
    >
      {label}
    </div>
  </div>
);

// ============================================================
// HEADER
// ============================================================
const Header = ({
  user,
  onBack,
  showBack,
  onProfile,
  onLeaderboard,
  onMultiplayer,
  onHome,
  dark,
  onToggleDark,
  onProfileTab,
}) => {
  const [showDrop, setShowDrop] = React.useState(false);
  return (
  <header
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      background: 'var(--header-bg)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      transition: 'background 0.3s ease',
      minWidth: 0,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
      {showBack && (
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 20,
            display: 'flex',
            alignItems: 'center',
            padding: '4px 6px',
            color: 'var(--text)',
            flexShrink: 0,
          }}
        >
          ←
        </button>
      )}
      <span
        onClick={onHome}
        style={{
          fontFamily: "'Sora', sans-serif",
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: '-0.5px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        oyun<span style={{ color: '#E63946' }}>.</span>club
      </span>
    </div>
    {user && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <button
          onClick={onToggleDark}
          title={dark ? 'Açık Mod' : 'Karanlık Mod'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 17, padding: '6px 8px', borderRadius: 8,
            transition: 'var(--transition)', color: 'var(--text)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          {dark ? '☀️' : '🌙'}
        </button>
        <span className="header-nav-desktop">
          <button
            onClick={onMultiplayer}
            title="Çok Oyunculu"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 17, padding: '6px 8px', borderRadius: 8,
              transition: 'var(--transition)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            🎮
          </button>
          <button
            onClick={onLeaderboard}
            title="Skor Tablosu"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 17, padding: '6px 8px', borderRadius: 8,
              transition: 'var(--transition)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            🏆
          </button>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowDrop(d => !d)}
              title={user.name}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center',
                padding: '4px 6px', borderRadius: 50,
                transition: 'var(--transition)',
              }}
            >
              <Avatar name={user.name} size={30} />
            </button>
            {showDrop && (
              <>
                <div onClick={() => setShowDrop(false)} style={{ position:'fixed',inset:0,zIndex:200 }} />
                <div style={{ position:'absolute', right:0, top:'calc(100% + 6px)', zIndex:300, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, boxShadow:'var(--shadow-lg)', padding:6, minWidth:180, animation:'scaleIn 0.15s ease' }}>
                  <div style={{ padding:'8px 12px 6px', fontSize:12, fontWeight:700, color:'var(--text-secondary)', borderBottom:'1px solid var(--border)', marginBottom:4 }}>
                    {user.name}
                  </div>
                  {[
                    { icon:'👤', label:'Profil', tab:'profil' },
                    { icon:'📊', label:'İstatistikler', tab:'istatistik' },
                    { icon:'🏅', label:'Rozetlerim', tab:'rozetler' },
                    { icon:'⚙️', label:'Ayarlar', tab:'ayarlar' },
                  ].map(function(item) {
                    return (
                      <button key={item.tab}
                        onClick={function(){ setShowDrop(false); if(onProfileTab) onProfileTab(item.tab); else if(onProfile) onProfile(); }}
                        style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'9px 12px', borderRadius:10, border:'none', background:'none', color:'var(--text)', fontSize:14, fontWeight:500, cursor:'pointer', textAlign:'left' }}
                        onMouseEnter={function(e){ e.currentTarget.style.background='var(--surface-hover)'; }}
                        onMouseLeave={function(e){ e.currentTarget.style.background='none'; }}
                      >
                        <span>{item.icon}</span> {item.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </span>
      </div>
    )}
  </header>
  );
};

// ============================================================
// LOGIN PAGE
// ============================================================
const LoginPage = ({ onLogin, dark, onToggleDark }) => {
  const [nickname, setNickname] = useState('');
  const googleBtnRef = useRef(null);

  useEffect(() => {
    const scriptId = 'gsi-script';
    const initGoogle = () => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: '954115826954-fro3u7nt424dm73bgh3mg6g68600s633.apps.googleusercontent.com',
        callback: (response) => {
          try {
            const b64 = response.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(decodeURIComponent(atob(b64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
            onLogin({ name: payload.name, email: payload.email, picture: payload.picture });
          } catch (e) {
            console.error('Google login error', e);
          }
        },
      });
      if (googleBtnRef.current) {
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          width: 356,
          text: 'signin_with',
          locale: 'tr',
        });
      }
    };
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initGoogle;
      document.head.appendChild(script);
    } else if (window.google) {
      initGoogle();
    }
  }, [dark, onLogin]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: 24,
        transition: 'background 0.3s ease',
        position: 'relative',
      }}
    >
      {onToggleDark && (
        <button
          onClick={onToggleDark}
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 50,
            width: 44,
            height: 44,
            cursor: 'pointer',
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow)',
            transition: 'var(--transition)',
          }}
        >
          {dark ? '☀️' : '🌙'}
        </button>
      )}
      <div
        style={{ maxWidth: 420, width: '100%', animation: 'fadeUp 0.6s ease' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div
            style={{
              fontFamily: "'Sora', sans-serif",
              fontWeight: 800,
              fontSize: 48,
              letterSpacing: '-2px',
              marginBottom: 8,
              lineHeight: 1,
            }}
          >
            oyun<span style={{ color: '#E63946' }}>.</span>club
          </div>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: 16,
              fontWeight: 300,
            }}
          >
            Arkadaşlarınla oyna, eğlen
          </p>
        </div>
        <Card style={{ padding: 32 }}>
          <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              margin: '24px 0',
              color: 'var(--text-secondary)',
              fontSize: 13,
            }}
          >
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span>veya</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Takma ad gir..."
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' &&
                nickname.trim() &&
                onLogin({ name: nickname.trim() })
              }
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                fontSize: 15,
                outline: 'none',
                fontFamily: "'DM Sans', sans-serif",
                background: 'var(--surface)',
                color: 'var(--text)',
              }}
            />
            <Button
              onClick={() =>
                nickname.trim() && onLogin({ name: nickname.trim() })
              }
              disabled={!nickname.trim()}
            >
              Giriş
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ============================================================
// PROFILE PAGE
// ============================================================
// ============================================================
// FRIEND PANEL
// ============================================================
function FriendPanel({ sock, myUserId }) {
  const [tab, setTab] = useState('friends'); // 'friends' | 'requests' | 'search'
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchMsg, setSearchMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (sock && myUserId) sock.getFriends(); }, [myUserId]);

  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  const doSearch = () => {
    if (!searchQ.trim() || searchQ.trim().length < 2) return setSearchMsg('En az 2 karakter gir');
    setLoading(true); setSearchMsg(''); setNotFound(false);
    sock.searchUser(searchQ.trim(), (res) => {
      setLoading(false);
      if (res?.error) { setSearchMsg('❌ ' + res.error); return; }
      const found = (res?.users || res?.results || []).filter(u => u.userId !== myUserId);
      setSearchResults(found);
      if (!found.length) { setSearchMsg(''); setNotFound(true); }
      else setSearchMsg('');
    });
  };

  const shareInvite = () => {
    const url = window.location.origin;
    if (navigator.share) {
      navigator.share({ title: 'oyun.club', text: 'Seninle oyun oynamak istiyorum! oyun.club\'a gel:', url });
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }).catch(() => {});
    }
  };

  const sendReq = (toUserId, name) => {
    sock.sendFriendRequest(toUserId, (res) => {
      if (res?.success) setSearchMsg('✅ ' + name + ' için istek gönderildi');
      else setSearchMsg('❌ ' + (res?.error || 'Hata'));
    });
  };

  const friends = sock?.friendList || [];
  const requests = sock?.friendRequests || [];
  const onlineFriends = friends.filter(f => f.online);

  return (
    <div style={{marginTop:20}}>
      <div style={{display:'flex',gap:6,marginBottom:14}}>
        {[['friends','👥 Arkadaşlar',friends.length],['requests','🤝 İstekler',requests.length],['search','🔍 Ara',0]].map(([t,label,count])=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:'8px 4px',borderRadius:10,border:'none',background:tab===t?'linear-gradient(135deg,#863bff,#5b21b6)':'var(--surface-hover)',color:tab===t?'#fff':'var(--text)',fontWeight:700,fontSize:12,cursor:'pointer',position:'relative'}}>
            {label}{count>0&&<span style={{marginLeft:4,background:'#ef4444',color:'#fff',borderRadius:10,padding:'1px 5px',fontSize:10}}>{count}</span>}
          </button>
        ))}
      </div>

      {tab === 'friends' && (
        <div>
          {onlineFriends.length > 0 && (
            <div style={{marginBottom:10,fontSize:12,color:'#22c55e',fontWeight:600}}>🟢 {onlineFriends.length} arkadaş online</div>
          )}
          {friends.length === 0 ? (
            <div style={{textAlign:'center',padding:'24px',color:'var(--text-secondary)',fontSize:13}}>
              <div style={{fontSize:32,marginBottom:8}}>👤</div>
              Henüz arkadaşın yok. "Ara" sekmesinden arkadaş ekle!
            </div>
          ) : friends.map(f => (
            <div key={f.userId} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'var(--surface-hover)',borderRadius:12,marginBottom:8}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,#863bff,#5b21b6)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:14,flexShrink:0,position:'relative'}}>
                {f.name.charAt(0).toUpperCase()}
                <div style={{position:'absolute',bottom:0,right:0,width:10,height:10,borderRadius:'50%',background:f.online?'#22c55e':'#6b7280',border:'2px solid var(--surface-hover)'}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:14}}>{f.name}</div>
                <div style={{fontSize:11,color:f.online?'#22c55e':'var(--text-secondary)'}}>{f.online?'Online':'Çevrimdışı'}</div>
              </div>
              <button onClick={()=>sock.removeFriend(f.userId)} style={{padding:'4px 10px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--text-secondary)',fontSize:11,cursor:'pointer'}}>Çıkar</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'requests' && (
        <div>
          {requests.length === 0 ? (
            <div style={{textAlign:'center',padding:'24px',color:'var(--text-secondary)',fontSize:13}}>
              <div style={{fontSize:32,marginBottom:8}}>📭</div>
              Bekleyen istek yok
            </div>
          ) : requests.map(r => (
            <div key={r.fromId} style={{display:'flex',alignItems:'center',gap:10,padding:'12px',background:'var(--surface-hover)',borderRadius:12,marginBottom:8}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,#f59e0b,#d97706)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:14,flexShrink:0}}>
                {r.fromName.charAt(0).toUpperCase()}
              </div>
              <div style={{flex:1,fontSize:14,fontWeight:600}}>{r.fromName}</div>
              <button onClick={()=>sock.acceptFriend(r.fromId)} style={{padding:'6px 12px',borderRadius:8,border:'none',background:'#22c55e',color:'#fff',fontWeight:700,fontSize:12,cursor:'pointer'}}>✓ Kabul</button>
              <button onClick={()=>sock.rejectFriend(r.fromId)} style={{padding:'6px 10px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--text-secondary)',fontSize:12,cursor:'pointer'}}>✕</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'search' && (
        <div>
          <div style={{display:'flex',gap:8,marginBottom:12}}>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doSearch()} placeholder="Kullanıcı adı ara..."
              style={{flex:1,padding:'10px 12px',borderRadius:10,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:14,outline:'none'}}/>
            <button onClick={doSearch} disabled={loading} style={{padding:'10px 16px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#863bff,#5b21b6)',color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}}>
              {loading?'...':'Ara'}
            </button>
          </div>
          {searchMsg && <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:8,textAlign:'center'}}>{searchMsg}</div>}
          {notFound && (
            <div style={{textAlign:'center',padding:'20px 12px',background:'var(--surface-hover)',borderRadius:14,marginBottom:12}}>
              <div style={{fontSize:28,marginBottom:6}}>🔍</div>
              <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>"{searchQ}" bulunamadı</div>
              <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:14,lineHeight:1.5}}>
                Arkadaşın uygulamayı henüz açmamış olabilir.<br/>Ona bir link gönder, siteye girsin!
              </div>
              <button onClick={shareInvite} style={{padding:'10px 20px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#863bff,#5b21b6)',color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                {copied ? '✅ Link kopyalandı!' : '📤 Davet linki gönder'}
              </button>
            </div>
          )}
          {searchResults.map(u => {
            const already = friends.some(f=>f.userId===u.userId);
            return (
              <div key={u.userId} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'var(--surface-hover)',borderRadius:12,marginBottom:8}}>
                <div style={{width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:14,flexShrink:0}}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14}}>{u.name}</div>
                  <div style={{fontSize:11,color:u.online?'#22c55e':'var(--text-secondary)'}}>{u.online?'Online':'Çevrimdışı'}</div>
                </div>
                {already ? <span style={{fontSize:11,color:'#22c55e',fontWeight:600}}>✓ Arkadaş</span>
                  : <button onClick={()=>sendReq(u.userId,u.name)} style={{padding:'6px 12px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#863bff,#5b21b6)',color:'#fff',fontWeight:700,fontSize:12,cursor:'pointer'}}>+ Ekle</button>}
              </div>
            );
          })}
          {!notFound && searchResults.length === 0 && !loading && !searchMsg && (
            <div style={{textAlign:'center',padding:'16px',color:'var(--text-secondary)',fontSize:12,marginTop:8}}>
              <div style={{marginBottom:8}}>Arkadaşın kayıtlı değilse linki paylaşarak davet et</div>
              <button onClick={shareInvite} style={{padding:'8px 16px',borderRadius:10,border:'1px solid var(--border)',background:'transparent',color:'var(--text)',fontSize:12,cursor:'pointer'}}>
                {copied ? '✅ Link kopyalandı!' : '📤 Davet linki paylaş'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const RANKS = [
  { min:0,   max:4,   icon:'🌱', label:'Acemi',        color:'#6B7280', bg:'#F3F4F6' },
  { min:5,   max:24,  icon:'⚡', label:'Oyuncu',        color:'#2563EB', bg:'#DBEAFE' },
  { min:25,  max:59,  icon:'🔥', label:'Usta',          color:'#D97706', bg:'#FEF3C7' },
  { min:60,  max:99,  icon:'💎', label:'Profesyonel',   color:'#7C3AED', bg:'#EDE9FE' },
  { min:100, max:Infinity, icon:'👑', label:'Doktor',   color:'#B45309', bg:'#FEF3C7' },
];
function getRank(wins) { return RANKS.find(r => wins >= r.min && wins <= r.max) || RANKS[0]; }

const ProfilePage = ({ user, stats, onLogout, userAvatar, onAvatarChange, sock, soundOn, onToggleSound, dark, onToggleDark, onRenameUser, onResetStats, initialTab }) => {
  const [activeTab, setActiveTab] = useState(initialTab || 'profil');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [newName, setNewName] = useState(user.name);
  const [nameSaved, setNameSaved] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const totalGames = Object.values(stats.games).reduce(
    (a, g) => a + g.played,
    0
  );
  const totalWins = Object.values(stats.games).reduce((a, g) => a + g.wins, 0);
  const winRate =
    totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;
  const rank = getRank(totalWins);

  const TABS = [
    { id: 'profil', label: '👤 Profil' },
    { id: 'istatistik', label: '📊 İstatistik' },
    { id: 'rozetler', label: '🏅 Rozetler' },
    { id: 'arkadaşlar', label: '👥 Arkadaşlar' },
    { id: 'ayarlar', label: '⚙️ Ayarlar' },
  ];

  return (
    <div
      style={{
        maxWidth: 520,
        margin: '0 auto',
        padding: '16px 20px 32px',
        animation: 'fadeUp 0.4s ease',
      }}
    >
      {/* Tab bar */}
      <div style={{ display:'flex', gap:4, marginBottom:20, background:'var(--surface-hover)', borderRadius:14, padding:4 }}>
        {TABS.map(function(tab) {
          var active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={function(){ setActiveTab(tab.id); }}
              style={{ flex:1, padding:'9px 4px', borderRadius:10, border:'none', background: active ? 'var(--surface)' : 'transparent', color: active ? 'var(--text)' : 'var(--text-secondary)', fontWeight: active ? 700 : 500, fontSize:12, cursor:'pointer', transition:'all 0.2s', boxShadow: active ? 'var(--shadow)' : 'none', whiteSpace:'nowrap' }}>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* PROFIL TAB */}
      {activeTab === 'profil' && <Card
        style={{ textAlign: 'center', padding: '36px 24px', marginBottom: 20 }}
      >
        <div style={{position:'relative',width:80,margin:'0 auto 16px',cursor:'pointer'}} onClick={()=>setShowAvatarPicker(true)}>
          <Avatar name={user.name} size={80} emoji={userAvatar||undefined} />
          <div style={{position:'absolute',bottom:0,right:0,width:24,height:24,borderRadius:'50%',background:'#863bff',color:'#fff',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',border:'2px solid var(--surface)'}}>✏️</div>
        </div>
        {showAvatarPicker && (
          <div style={{background:'var(--surface-hover)',borderRadius:16,padding:'16px',marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:600,marginBottom:10,color:'var(--text-secondary)'}}>Avatar seç:</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8}}>
              <button onClick={()=>{onAvatarChange('');setShowAvatarPicker(false);}} style={{fontSize:24,padding:6,borderRadius:10,border:'2px solid var(--border)',background:'var(--surface)',cursor:'pointer'}}>🔤</button>
              {AVATAR_EMOJIS.map(e=>(
                <button key={e} onClick={()=>{onAvatarChange(e);setShowAvatarPicker(false);}} style={{fontSize:24,padding:6,borderRadius:10,border:`2px solid ${userAvatar===e?'#863bff':'var(--border)'}`,background:userAvatar===e?'rgba(134,59,255,0.1)':'var(--surface)',cursor:'pointer'}}>{e}</button>
              ))}
            </div>
          </div>
        )}
        <h2
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 24,
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          {user.name}
        </h2>
        {user.email && (
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {user.email}
          </p>
        )}
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginTop:12,flexWrap:'wrap'}}>
          <span style={{padding:'4px 14px',borderRadius:20,fontSize:13,fontWeight:700,background:rank.bg,color:rank.color}}>
            {rank.icon} {rank.label}
          </span>
          <span style={{padding:'4px 12px',borderRadius:20,fontSize:12,fontWeight:600,background:'#F3F4F6',color:'#6B7280'}}>
            {totalWins} galibiyet
          </span>
        </div>
        <div style={{marginTop:12,padding:'8px 16px',borderRadius:12,background:'var(--surface-hover)',display:'inline-flex',gap:16,fontSize:12,color:'var(--text-secondary)'}}>
          {RANKS.map((r,i)=>(
            <span key={i} style={{opacity:totalWins>=r.min?1:0.35,fontWeight:totalWins>=r.min&&totalWins<=r.max?700:400}}>{r.icon}</span>
          ))}
        </div>
        <XPBar xp={stats.xp || 0} streakCount={stats.streak?.count || 0} />
        {/* Season info */}
        {stats.season && stats.season.month && (
          <div style={{marginTop:10,padding:'10px 14px',background:'rgba(134,59,255,0.07)',borderRadius:12,border:'1px solid rgba(134,59,255,0.15)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontWeight:700,fontSize:13}}>📅 Sezon {stats.season.num || 1}</div>
            <div style={{fontSize:13,color:'var(--text-secondary)'}}>Bu ay: <strong style={{color:'#a855f7'}}>{stats.season.xp || 0} XP</strong></div>
          </div>
        )}
        {/* Streak freeze */}
        <div style={{marginTop:8,padding:'8px 14px',background:'rgba(251,191,36,0.07)',borderRadius:12,border:'1px solid rgba(251,191,36,0.2)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontWeight:700,fontSize:13}}>🛡️ Seri Kalkanı</div>
          <div style={{fontSize:13,color:(stats.streakFreeze?.count||0)>0?'#F59E0B':'var(--text-secondary)'}}>
            {(stats.streakFreeze?.count||0)>0 ? '1 adet mevcut' : 'Bu hafta kullanıldı'}
          </div>
        </div>
      </Card>}

      {/* ROZETLER TAB */}
      {activeTab === 'rozetler' && <Card style={{ padding: 20, marginBottom: 20 }}>
        <BadgeGrid badges={stats.badges} />
      </Card>}

      {/* İSTATİSTİK TAB */}
      {activeTab === 'istatistik' && <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginBottom: 20,
        }}
      >
        <StatBox
          label="Toplam Oyun"
          value={totalGames}
          color="#457B9D"
          delay={0.05}
        />
        <StatBox
          label="Galibiyet"
          value={totalWins}
          color="#2A9D8F"
          delay={0.1}
        />
        <StatBox
          label="Kazanma %"
          value={`${winRate}%`}
          color="#E63946"
          delay={0.15}
        />
      </div>

      <Card style={{ padding: 20, marginBottom: 20 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 16,
          }}
        >
          Oyun Detayları
        </div>
        {GAMES.map((game, i) => {
          const gs = stats.games[game.id] || { played: 0, wins: 0, losses: 0 };
          const rate =
            gs.played > 0 ? Math.round((gs.wins / gs.played) * 100) : 0;
          return (
            <div
              key={game.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 0',
                borderBottom:
                  i < GAMES.length - 1 ? '1px solid var(--border)' : 'none',
                animation: 'fadeUp 0.3s ease',
                animationDelay: `${i * 0.08}s`,
                animationFillMode: 'both',
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: game.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  flexShrink: 0,
                }}
              >
                {game.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{game.name}</div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    marginTop: 2,
                  }}
                >
                  {gs.played} oyun • {gs.wins}G / {gs.losses}M
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontFamily: "'Sora', sans-serif",
                    fontWeight: 700,
                    fontSize: 18,
                    color: game.color,
                  }}
                >
                  {rate}%
                </div>
                <div
                  style={{
                    width: 48,
                    height: 4,
                    borderRadius: 2,
                    background: 'var(--border)',
                    marginTop: 4,
                  }}
                >
                  <div
                    style={{
                      width: `${rate}%`,
                      height: '100%',
                      borderRadius: 2,
                      background: game.bg,
                      transition: 'width 0.6s ease',
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </Card>

      {stats.history.length > 0 && (
        <Card style={{ padding: 20, marginBottom: 20 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 16,
            }}
          >
            Son Oyunlar
          </div>
          {stats.history
            .slice(-8)
            .reverse()
            .map((h, i) => {
              const g = GAMES.find((gm) => gm.id === h.gameId);
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 0',
                    borderBottom:
                      i < Math.min(stats.history.length, 8) - 1
                        ? '1px solid var(--border)'
                        : 'none',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: g?.bg || '#eee',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                    }}
                  >
                    {g?.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>
                      {g?.name}
                    </span>
                  </div>
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600,
                      background:
                        h.result === 'win'
                          ? '#DCFCE7'
                          : h.result === 'loss'
                          ? '#FEE2E2'
                          : '#F3F4F6',
                      color:
                        h.result === 'win'
                          ? '#16A34A'
                          : h.result === 'loss'
                          ? '#DC2626'
                          : '#6B7280',
                    }}
                  >
                    {h.result === 'win'
                      ? 'Kazandı'
                      : h.result === 'loss'
                      ? 'Kaybetti'
                      : 'Berabere'}
                  </span>
                </div>
              );
            })}
        </Card>
      )}
      </div>}

      {/* ARKADAŞLAR TAB */}
      {activeTab === 'arkadaşlar' && (
        <div>
          {sock && sock.isConnected ? (
            <Card style={{ padding: 20 }}>
              <FriendPanel sock={sock} myUserId={sock.myUserId} />
            </Card>
          ) : (
            <Card style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Bağlanıyor...</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Sunucuya bağlanılıyor...</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#863bff', display: 'inline-block', animation: 'livePulse 0.6s ease-in-out infinite' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#863bff', display: 'inline-block', animation: 'livePulse 0.6s ease-in-out 0.2s infinite' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#863bff', display: 'inline-block', animation: 'livePulse 0.6s ease-in-out 0.4s infinite' }} />
              </div>
            </Card>
          )}
        </div>
      )}

      {/* AYARLAR TAB */}
      {activeTab === 'ayarlar' && <div>

      {/* Settings */}
      <Card style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
          ⚙️ Ayarlar
        </div>

        {/* Username */}
        <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '0.03em' }}>Kullanıcı Adı</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={newName}
              onChange={function(e) { setNewName(e.target.value); setNameSaved(false); }}
              maxLength={24}
              style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 15, fontWeight: 600, background: 'var(--surface-hover)', color: 'var(--text)', fontFamily: "'DM Sans',sans-serif", outline: 'none' }}
            />
            {newName.trim() && newName.trim() !== user.name && (
              <button
                onClick={function() {
                  if (newName.trim() && onRenameUser) { onRenameUser(newName.trim()); setNameSaved(true); }
                }}
                style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", flexShrink: 0 }}>
                Kaydet
              </button>
            )}
            {nameSaved && <span style={{ fontSize: 18 }}>✅</span>}
          </div>
        </div>

        {/* Email */}
        {user.email && (
          <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '0.03em' }}>E-posta</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{user.email}</div>
              <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(34,197,94,0.15)', color: '#22c55e', padding: '2px 8px', borderRadius: 20, flexShrink: 0 }}>Google</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Şifre Google hesabınız üzerinden yönetilir.</div>
          </div>
        )}

        {/* Sound toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Ses Efektleri</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Oyun içi ses efektleri</div>
          </div>
          <button onClick={onToggleSound} style={{ width: 48, height: 28, borderRadius: 14, border: 'none', background: soundOn ? '#6366f1' : 'var(--surface-hover)', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
            <span style={{ position: 'absolute', top: 3, left: soundOn ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.25)', transition: 'left .2s', display: 'block' }} />
          </button>
        </div>

        {/* Dark mode toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Karanlık Mod</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Koyu tema kullan</div>
          </div>
          <button onClick={onToggleDark} style={{ width: 48, height: 28, borderRadius: 14, border: 'none', background: dark ? '#6366f1' : 'var(--surface-hover)', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
            <span style={{ position: 'absolute', top: 3, left: dark ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.25)', transition: 'left .2s', display: 'block' }} />
          </button>
        </div>

        {/* Reset stats */}
        {!showResetConfirm ? (
          <button onClick={function() { setShowResetConfirm(true); }}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: "'DM Sans',sans-serif", width: '100%' }}>
            🗑️ İstatistikleri Sıfırla
          </button>
        ) : (
          <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: 12, padding: '14px', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#DC2626', marginBottom: 8 }}>Emin misin?</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Tüm oyun geçmişin ve istatistiklerin silinecek.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={function() { if (onResetStats) onResetStats(); setShowResetConfirm(false); }}
                style={{ flex: 1, background: '#DC2626', color: '#fff', border: 'none', borderRadius: 9, padding: '9px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                Evet, Sıfırla
              </button>
              <button onClick={function() { setShowResetConfirm(false); }}
                style={{ flex: 1, background: 'var(--surface-hover)', color: 'var(--text)', border: 'none', borderRadius: 9, padding: '9px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                İptal
              </button>
            </div>
          </div>
        )}
      </Card>

      <Button variant="danger" onClick={onLogout} style={{ width: '100%' }}>
        Çıkış Yap
      </Button>
      </div>}
    </div>
  );
};

// ============================================================
// LEADERBOARD PAGE (per-game)
// ============================================================
const FAKE_LB = {
  xox:         [ { name: 'Ahmet K.',   played: 52, wins: 38, avatar: 0 }, { name: 'Zeynep A.',  played: 41, wins: 31, avatar: 1 }, { name: 'Emre Y.',    played: 47, wins: 27, avatar: 3 }, { name: 'Elif S.',    played: 33, wins: 24, avatar: 4 }, { name: 'Murat D.',   played: 30, wins: 18, avatar: 2 } ],
  wordle:      [ { name: 'Selin T.',   played: 30, wins: 24, avatar: 1 }, { name: 'Can M.',     played: 28, wins: 20, avatar: 0 }, { name: 'Ayşe B.',    played: 25, wins: 18, avatar: 5 }, { name: 'Kerem A.',   played: 22, wins: 15, avatar: 2 }, { name: 'Deniz K.',   played: 20, wins: 12, avatar: 3 } ],
  sudoku:      [ { name: 'Cem Y.',     played: 45, wins: 40, avatar: 3 }, { name: 'Büşra K.',   played: 38, wins: 33, avatar: 4 }, { name: 'Tarık S.',   played: 32, wins: 28, avatar: 0 }, { name: 'Meltem A.',  played: 29, wins: 24, avatar: 1 }, { name: 'Ozan D.',    played: 25, wins: 19, avatar: 2 } ],
  minesweeper: [ { name: 'Furkan E.',  played: 60, wins: 45, avatar: 2 }, { name: 'Nihan T.',   played: 50, wins: 38, avatar: 5 }, { name: 'Berk A.',    played: 44, wins: 32, avatar: 0 }, { name: 'Gizem Y.',   played: 38, wins: 27, avatar: 1 }, { name: 'Tolga M.',   played: 34, wins: 23, avatar: 3 } ],
  rps:         [ { name: 'Merve K.',   played: 80, wins: 55, avatar: 4 }, { name: 'Alp D.',     played: 72, wins: 48, avatar: 0 }, { name: 'Ceren S.',   played: 65, wins: 42, avatar: 1 }, { name: 'Yusuf A.',   played: 60, wins: 38, avatar: 2 }, { name: 'Ecem B.',    played: 55, wins: 34, avatar: 5 } ],
  connectfour: [ { name: 'Serkan Y.',  played: 40, wins: 30, avatar: 3 }, { name: 'Hande K.',   played: 35, wins: 26, avatar: 1 }, { name: 'İlker T.',   played: 30, wins: 22, avatar: 2 }, { name: 'Pınar A.',   played: 28, wins: 19, avatar: 4 }, { name: 'Onur M.',    played: 25, wins: 15, avatar: 0 } ],
  snake:       [ { name: 'Kaan B.',    played: 35, wins: 20, avatar: 2 }, { name: 'İpek Y.',    played: 30, wins: 17, avatar: 5 }, { name: 'Mert A.',    played: 28, wins: 15, avatar: 0 }, { name: 'Seda T.',    played: 25, wins: 12, avatar: 1 }, { name: 'Koray D.',   played: 22, wins: 10, avatar: 3 } ],
  memory:      [ { name: 'Arzu K.',    played: 28, wins: 22, avatar: 1 }, { name: 'Batu A.',    played: 25, wins: 19, avatar: 3 }, { name: 'Ceyda M.',   played: 22, wins: 16, avatar: 0 }, { name: 'Doruk Y.',   played: 20, wins: 14, avatar: 4 }, { name: 'Ela S.',     played: 18, wins: 11, avatar: 2 } ],
  '2048':      [ { name: 'Fırat T.',   played: 40, wins: 18, avatar: 0 }, { name: 'Gamze K.',   played: 35, wins: 15, avatar: 5 }, { name: 'Hakan A.',   played: 30, wins: 13, avatar: 3 }, { name: 'Irmak Y.',   played: 27, wins: 11, avatar: 2 }, { name: 'Jale M.',    played: 24, wins: 9,  avatar: 1 } ],
  mathduel:    [ { name: 'Kadir B.',   played: 55, wins: 42, avatar: 2 }, { name: 'Leyla D.',   played: 48, wins: 36, avatar: 4 }, { name: 'Mina S.',    played: 43, wins: 31, avatar: 1 }, { name: 'Nihat A.',   played: 38, wins: 27, avatar: 0 }, { name: 'Orhan T.',   played: 34, wins: 22, avatar: 3 } ],
  dama:        [ { name: 'Pelin Y.',   played: 32, wins: 25, avatar: 5 }, { name: 'Rıza K.',    played: 28, wins: 21, avatar: 2 }, { name: 'Selma A.',   played: 25, wins: 18, avatar: 1 }, { name: 'Taner M.',   played: 22, wins: 15, avatar: 3 }, { name: 'Ufuk D.',    played: 19, wins: 12, avatar: 0 } ],
  tavla:       [ { name: 'Veli T.',    played: 30, wins: 22, avatar: 3 }, { name: 'Yıldız K.',  played: 27, wins: 19, avatar: 1 }, { name: 'Zafer A.',   played: 24, wins: 17, avatar: 0 }, { name: 'Alper M.',   played: 21, wins: 14, avatar: 4 }, { name: 'Belma S.',   played: 18, wins: 11, avatar: 2 } ],
  gomoku:      [ { name: 'Cem B.',     played: 36, wins: 28, avatar: 0 }, { name: 'Duygu A.',   played: 32, wins: 24, avatar: 2 }, { name: 'Ercan Y.',   played: 28, wins: 20, avatar: 4 }, { name: 'Fatma K.',   played: 24, wins: 17, avatar: 1 }, { name: 'Güner T.',   played: 21, wins: 14, avatar: 3 } ],
  adamasmaca: [ { name: 'Zeynep K.',  played: 45, wins: 38, avatar: 1 }, { name: 'Berk A.',   played: 40, wins: 32, avatar: 0 }, { name: 'Seda T.',   played: 35, wins: 27, avatar: 3 }, { name: 'Mert Y.',   played: 30, wins: 22, avatar: 2 }, { name: 'Gül M.',    played: 25, wins: 17, avatar: 4 } ],
  stroop:     [ { name: 'Ali K.',     played: 38, wins: 30, avatar: 2 }, { name: 'Ayşe T.',   played: 32, wins: 25, avatar: 5 }, { name: 'Can D.',    played: 28, wins: 21, avatar: 0 }, { name: 'Deniz Y.',  played: 25, wins: 18, avatar: 1 }, { name: 'Elif M.',   played: 22, wins: 15, avatar: 3 } ],
};

const LeaderboardPage = ({ user, stats }) => {
  const [activeTab, setActiveTab] = useState(GAMES[0].id);
  const activeGame = GAMES.find((g) => g.id === activeTab);
  const medals = ['🥇', '🥈', '🥉'];

  const userGameStats = stats.games[activeTab] || {
    played: 0,
    wins: 0,
    losses: 0,
  };
  const fakePlayers = FAKE_LB[activeTab] || [];
  const allPlayers = [
    ...fakePlayers,
    ...(userGameStats.played > 0 ? [{ name: user.name, played: userGameStats.played, wins: userGameStats.wins, avatar: 2 }] : []),
  ].sort((a, b) => b.wins - a.wins);
  const userRank = userGameStats.played > 0 ? (allPlayers.findIndex((p) => p.name === user.name) + 1) : null;

  return (
    <div
      style={{
        maxWidth: 520,
        margin: '0 auto',
        padding: '32px 20px',
        animation: 'fadeUp 0.4s ease',
      }}
    >
      <h2
        style={{
          fontFamily: "'Sora', sans-serif",
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: '-0.5px',
          marginBottom: 20,
        }}
      >
        🏆 Skor Tablosu
      </h2>

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 24,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
        }}
      >
        {GAMES.map((game) => {
          const isActive = activeTab === game.id;
          return (
            <button
              key={game.id}
              onClick={() => setActiveTab(game.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: 50,
                border: '2px solid',
                borderColor: isActive ? activeGame?.color : 'var(--border)',
                background: isActive ? activeGame?.bg : 'var(--surface)',
                color: isActive ? '#fff' : 'var(--text)',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                transition: 'all 0.25s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 16 }}>{game.icon}</span>
              {game.name}
            </button>
          );
        })}
      </div>

      <Card
        style={{
          padding: '16px 20px',
          marginBottom: 20,
          background: activeGame?.bg,
          color: '#fff',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={user.name} size={40} gradient="rgba(255,255,255,0.2)" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{user.name}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              {userGameStats.played > 0 ? `${userGameStats.played} oyun • ${userGameStats.wins}G / ${userGameStats.losses}M` : 'Henüz oynamadı'}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            {userRank ? `#${userRank}` : '—'}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>{userRank ? 'sıralama' : 'henüz yok'}</div>
        </div>
      </Card>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          gap: 12,
          marginBottom: 24,
        }}
      >
        {[1, 0, 2].map((rank) => {
          const p = allPlayers[rank];
          if (!p) return null;
          const isCenter = rank === 0;
          return (
            <div
              key={rank}
              style={{
                textAlign: 'center',
                animation: 'fadeUp 0.5s ease',
                animationDelay: `${rank * 0.1}s`,
                animationFillMode: 'both',
              }}
            >
              <div style={{ fontSize: isCenter ? 36 : 28, marginBottom: 8 }}>
                {medals[rank]}
              </div>
              <Avatar
                name={p.name}
                size={isCenter ? 56 : 44}
                gradient={
                  p.name === user.name
                    ? activeGame?.bg
                    : AVATAR_COLORS[p.avatar]
                }
                style={{
                  margin: '0 auto 8px',
                  border: p.name === user.name ? '3px solid #fff' : 'none',
                  boxShadow:
                    p.name === user.name
                      ? '0 0 0 2px ' + activeGame?.color
                      : 'none',
                }}
              />
              <div
                style={{
                  fontWeight: 600,
                  fontSize: isCenter ? 15 : 13,
                  maxWidth: 80,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.name === user.name ? 'Sen' : p.name}
              </div>
              <div
                style={{
                  fontFamily: "'Sora', sans-serif",
                  fontWeight: 800,
                  fontSize: isCenter ? 20 : 16,
                  color: activeGame?.color,
                }}
              >
                {p.wins}
              </div>
            </div>
          );
        })}
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {allPlayers.map((p, i) => {
          const winRate =
            p.played > 0 ? Math.round((p.wins / p.played) * 100) : 0;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 20px',
                borderBottom:
                  i < allPlayers.length - 1
                    ? '1px solid var(--border)'
                    : 'none',
                background:
                  p.name === user.name
                    ? activeGame?.color + '10'
                    : 'transparent',
                animation: 'fadeUp 0.3s ease',
                animationDelay: `${i * 0.04}s`,
                animationFillMode: 'both',
              }}
            >
              <span
                style={{
                  fontFamily: "'Sora', sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  color: i < 3 ? activeGame?.color : 'var(--text-secondary)',
                  width: 28,
                  textAlign: 'center',
                }}
              >
                {i < 3 ? medals[i] : `#${i + 1}`}
              </span>
              <Avatar
                name={p.name}
                size={36}
                gradient={
                  p.name === user.name
                    ? activeGame?.bg
                    : AVATAR_COLORS[p.avatar || 0]
                }
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: p.name === user.name ? 700 : 500,
                    fontSize: 15,
                  }}
                >
                  {p.name}
                  {p.name === user.name ? ' (Sen)' : ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {p.played} oyun • %{winRate} kazanma
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontFamily: "'Sora', sans-serif",
                    fontWeight: 700,
                    fontSize: 16,
                    color: activeGame?.color,
                  }}
                >
                  {p.wins}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  galibiyet
                </div>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
};

// ============================================================
// BOTTOM NAV (mobile only — CSS hides on desktop)
// ============================================================
function BottomNav({ page, onLobby, onMultiplayer, onLeaderboard, onProfile, onFriends, friendRequestCount }) {
  return (
    <nav className="bottom-nav">
      <button className={`bnav-tab${page === 'lobby' ? ' bnav-active' : ''}`} onClick={onLobby}>
        <span className="bnav-icon">🎮</span>
        <span className="bnav-label">Oyunlar</span>
        <span className="bnav-dot"></span>
      </button>
      <button className={`bnav-tab${page === 'multiplayer' ? ' bnav-active' : ''}`} onClick={onMultiplayer}>
        <span className="bnav-icon">🕹️</span>
        <span className="bnav-label">Çok Oyunculu</span>
        <span className="bnav-dot"></span>
      </button>
      <button className={`bnav-tab${page === 'leaderboard' ? ' bnav-active' : ''}`} onClick={onLeaderboard}>
        <span className="bnav-icon">🏆</span>
        <span className="bnav-label">Sıralama</span>
        <span className="bnav-dot"></span>
      </button>
      <button className={`bnav-tab${page === 'profile' ? ' bnav-active' : ''}`} onClick={friendRequestCount > 0 ? onFriends : onProfile} style={{position:'relative'}}>
        <span className="bnav-icon">🧑</span>
        <span className="bnav-label">Profil</span>
        <span className="bnav-dot"></span>
        {friendRequestCount > 0 && (
          <span style={{position:'absolute',top:6,right:'50%',transform:'translateX(10px)',background:'#ef4444',color:'#fff',borderRadius:10,padding:'1px 5px',fontSize:10,fontWeight:700,minWidth:16,textAlign:'center',lineHeight:'14px'}}>{friendRequestCount}</span>
        )}
      </button>
    </nav>
  );
}

// ============================================================
// LOBBY
// ============================================================
const GAME_ICONS_MAP = {
  xox: '❌⭕', rps: '✊✋✌️', connectfour: '🔵', gomoku: '⚫',
  reaction: '⚡', mathduel: '🧮', cardbattle: '🃏', memorybattle: '🧠', wordrace: '🔤'
};
const GAME_BG_MAP = {
  xox: 'linear-gradient(135deg,#E63946,#F4845F)',
  rps: 'linear-gradient(135deg,#2A9D8F,#76C893)',
  connectfour: 'linear-gradient(135deg,#1D4ED8,#60A5FA)',
  gomoku: 'linear-gradient(135deg,#1F2937,#4B5563)',
  reaction: 'linear-gradient(135deg,#D97706,#FCD34D)',
  mathduel: 'linear-gradient(135deg,#0369A1,#38BDF8)',
  cardbattle: 'linear-gradient(135deg,#7C3AED,#C084FC)',
  memorybattle: 'linear-gradient(135deg,#0F766E,#34D399)',
  wordrace: 'linear-gradient(135deg,#9333EA,#EC4899)',
};

const Lobby = ({ onSelectGame, onJoinRoom, onMultiplayer, user, stats, sock, onGoFriends }) => {
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [publicRooms, setPublicRooms] = useState([]);
  const [filterPlayers, setFilterPlayers] = useState('all');
  const [filterGenre, setFilterGenre] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(function() {
    function fetchRooms() {
      fetch('https://oyun-club-backend-production.up.railway.app/api/rooms')
        .then(function(r) { return r.json(); })
        .then(function(d) { if (d && d.rooms) setPublicRooms(d.rooms); })
        .catch(function() {});
    }
    fetchRooms();
    var interval = setInterval(fetchRooms, 8000);
    return function() { clearInterval(interval); };
  }, []);

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setJoinError('Geçerli bir masa kodu girin');
      return;
    }
    setJoinError('');
    onJoinRoom(code);
  };
  const totalGames = Object.values(stats.games).reduce(
    (a, g) => a + g.played,
    0
  );
  const totalWins = Object.values(stats.games).reduce((a, g) => a + g.wins, 0);

  const totalActivePlayers = publicRooms.reduce(function(a, r) { return a + (r.players || 0); }, 0);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 20px' }}>
      {/* Live activity banner */}
      {publicRooms.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.1),rgba(134,59,255,0.1))', border: '1px solid rgba(99,102,241,0.22)', borderRadius: 14, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, animation: 'fadeUp 0.35s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, flexShrink: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'livePulse 2s ease-in-out infinite' }} />
            CANLI
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', lineHeight: 1.2 }}>{publicRooms.length} açık masa · {totalActivePlayers} oyuncu aktif</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Hemen bir odaya katıl!</div>
          </div>
          <button onClick={function() { var r = publicRooms.find(function(rm) { return rm.players < rm.maxPlayers; }); if (r) onJoinRoom(r.id); else if (onMultiplayer) onMultiplayer(); }}
            style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", flexShrink: 0 }}>
            Hızlı Katıl →
          </button>
        </div>
      )}
      <DailyQuestBanner stats={stats} />

      {/* Arkadaşlar Widget */}
      {sock && (sock.friendList || []).length > 0 && (() => {
        const allFriends = sock.friendList || [];
        const online = allFriends.filter(f => f.online);
        const offline = allFriends.filter(f => !f.online);
        const shown = [...online, ...offline].slice(0, 3);
        return (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px', marginBottom: 20, animation: 'fadeUp 0.35s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>👥</span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Arkadaşlar</span>
                {online.length > 0 && (
                  <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'livePulse 2s ease-in-out infinite' }} />
                    {online.length} online
                  </span>
                )}
              </div>
              {onGoFriends && <button onClick={onGoFriends} style={{ fontSize: 12, color: '#863bff', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Tümü →</button>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shown.map(f => (
                <div key={f.userId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: f.online ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'linear-gradient(135deg,#6b7280,#4b5563)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>
                      {f.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: f.online ? '#22c55e' : '#6b7280', border: '2px solid var(--surface)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: f.online ? '#22c55e' : 'var(--text-secondary)' }}>{f.online ? 'Online' : 'Çevrimdışı'}</div>
                  </div>
                  {f.online && (
                    <button onClick={() => sock.inviteFriend && sock.inviteFriend(f.userId, null, null)}
                      style={{ flexShrink: 0, fontSize: 12, background: 'linear-gradient(135deg,#863bff,#5b21b6)', color: '#fff', border: 'none', borderRadius: 10, padding: '6px 12px', cursor: 'pointer', fontWeight: 700 }}>
                      Davet Et
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div style={{ marginBottom: 24, animation: 'fadeUp 0.4s ease' }}>
        <h1
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 'clamp(24px, 5vw, 36px)',
            fontWeight: 700,
            letterSpacing: '-1px',
            marginBottom: 6,
          }}
        >
          Merhaba, {user.name} 👋
        </h1>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            color: 'var(--text-secondary)',
            fontSize: 14,
          }}
        >
          <span>🎮 {totalGames} oyun</span>
          <span>🏆 {totalWins} galibiyet</span>
          <span style={{padding:'2px 10px',borderRadius:20,background:'rgba(134,59,255,0.12)',color:'#863bff',fontWeight:600,fontSize:12}}>{getLevelInfo(stats.xp||0).icon} {getLevelInfo(stats.xp||0).name}</span>
        </div>
      </div>

      <Card
        style={{
          marginBottom: 24,
          animation: 'fadeUp 0.45s ease',
          background: showJoin
            ? 'var(--surface)'
            : 'linear-gradient(135deg, #1A1A2E 0%, #2D2D44 100%)',
          color: showJoin ? 'var(--text)' : '#fff',
          border: showJoin
            ? '1px solid var(--border)'
            : '1px solid transparent',
        }}
      >
        {!showJoin ? (
          <div
            onClick={() => setShowJoin(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                }}
              >
                🎮
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "'Sora', sans-serif",
                    fontWeight: 700,
                    fontSize: 17,
                  }}
                >
                  Masaya Katıl
                </div>
                <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>
                  Arkadaşının masa kodunu gir
                </div>
              </div>
            </div>
            <div style={{ fontSize: 22, opacity: 0.5 }}>→</div>
          </div>
        ) : (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontFamily: "'Sora', sans-serif",
                  fontWeight: 700,
                  fontSize: 17,
                }}
              >
                🎮 Masa Kodunu Gir
              </div>
              <button
                onClick={() => {
                  setShowJoin(false);
                  setJoinCode('');
                  setJoinError('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 18,
                  color: 'var(--text-secondary)',
                  padding: 4,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Örn: A3BX9K"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase());
                  setJoinError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                maxLength={8}
                style={{
                  flex: 1,
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: joinError
                    ? '2px solid #E63946'
                    : '1px solid var(--border)',
                  fontSize: 18,
                  outline: 'none',
                  fontFamily: "'Sora', sans-serif",
                  fontWeight: 700,
                  letterSpacing: 4,
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                }}
                autoFocus
              />
              <Button
                onClick={handleJoin}
                style={{ padding: '14px 28px', fontSize: 16 }}
              >
                Katıl
              </Button>
            </div>
            {joinError && (
              <p
                style={{
                  color: '#E63946',
                  fontSize: 13,
                  marginTop: 8,
                  animation: 'shake 0.3s ease',
                }}
              >
                {joinError}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Public rooms section */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>
            🟢 Açık Masalar
            {publicRooms.length > 0 && (
              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: '#6366f1', background: 'rgba(99,102,241,0.15)', borderRadius: 6, padding: '1px 7px' }}>
                {publicRooms.length}
              </span>
            )}
          </div>
        </div>
        {publicRooms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 16px', background: 'var(--surface)', borderRadius: 14, border: '1px dashed var(--border)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🕹️</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>Şu an açık masa yok</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>İlk masayı sen kur, rakibini bekle!</div>
            <button onClick={onMultiplayer} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
              + Masa Oluştur
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
            {publicRooms.slice(0, 12).map(function(room) {
              const isFull = room.players >= room.maxPlayers;
              return (
                <div key={room.id}
                  style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '14px 14px 12px', opacity: isFull ? 0.6 : 1, transition: 'border-color 0.2s,transform 0.15s', cursor: isFull ? 'default' : 'pointer' }}
                  onMouseEnter={!isFull ? function(e) { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)'; e.currentTarget.style.transform = 'translateY(-2px)'; } : undefined}
                  onMouseLeave={!isFull ? function(e) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = ''; } : undefined}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: GAME_BG_MAP[room.gameId] || 'linear-gradient(135deg,#6366f1,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                      {GAME_ICONS_MAP[room.gameId] || '🎮'}
                    </div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {Array.from({ length: room.maxPlayers || 2 }).map(function(_, i) {
                        return <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < room.players ? '#22c55e' : 'var(--surface-hover)', border: '1px solid var(--border)' }} />;
                      })}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 2, lineHeight: 1.3 }}>{room.gameName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>Host: {room.hostName}</div>
                  <button
                    onClick={function() { if (!isFull) onJoinRoom(room.id); }}
                    disabled={isFull}
                    style={{ width: '100%', padding: '8px', borderRadius: 8, border: 'none', background: !isFull ? '#6366f1' : 'var(--surface-hover)', color: !isFull ? '#fff' : 'var(--text-secondary)', fontWeight: 700, fontSize: 12, cursor: isFull ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                    {isFull ? 'Dolu' : 'Katıl →'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Daily Challenge */}
      {(function(){
        var dailyId = getDailyGameId();
        var dailyGame = GAMES.find(function(g){ return g.id === dailyId; });
        if(!dailyGame) return null;
        return (
          <div onClick={function(){ onSelectGame(dailyGame); }} style={{borderRadius:16,overflow:'hidden',marginBottom:18,cursor:'pointer',background:dailyGame.bg,position:'relative'}}>
            <div style={{padding:'16px 20px',color:'#fff'}}>
              <div style={{fontSize:11,fontWeight:800,letterSpacing:1,opacity:0.8,marginBottom:4}}>⭐ GÜNÜN OYUNU</div>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <span style={{fontSize:36}}>{dailyGame.icon}</span>
                <div>
                  <div style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:18}}>{dailyGame.name}</div>
                  <div style={{fontSize:13,opacity:0.85}}>{dailyGame.desc}</div>
                </div>
                <div style={{marginLeft:'auto',background:'rgba(255,255,255,0.2)',borderRadius:20,padding:'6px 14px',fontWeight:700,fontSize:13}}>
                  2× XP 🚀
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, opacity: 0.5 }}>🔍</span>
        <input
          value={searchQuery}
          onChange={function(e) { setSearchQuery(e.target.value); }}
          placeholder="Oyun ara..."
          style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
        />
        {searchQuery && (
          <button onClick={function(){ setSearchQuery(''); }} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:16, color:'var(--text-secondary)' }}>✕</button>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ marginBottom: 20 }}>
        {/* Player count filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tümü' },
            { key: 1, label: '👤 Tek' },
            { key: 2, label: '👥 2 Kişi' },
            { key: '3-4', label: '👨‍👩‍👧 3-4 Kişi' },
          ].map(function(f) {
            const active = filterPlayers === f.key;
            return (
              <button key={f.key} onClick={function() { setFilterPlayers(f.key); setFilterGenre('all'); setSearchQuery(''); }}
                style={{ padding: '7px 14px', borderRadius: 20, border: active ? 'none' : '1px solid var(--border)', background: active ? 'var(--accent)' : 'var(--surface)', color: active ? (document.documentElement.dataset.theme === 'dark' ? '#000' : '#fff') : 'var(--text)', fontWeight: active ? 700 : 500, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s' }}>
                {f.label}
              </button>
            );
          })}
        </div>
        {/* Genre filter */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all',      label: '🎮 Hepsi',    color: '#6366f1' },
            { key: 'populer',  label: '🔥 Popüler',  color: '#E63946' },
            { key: 'yeni',     label: '🆕 Yeni',     color: '#0369A1' },
            { key: 'strateji', label: '♟️ Strateji', color: '#1D4ED8' },
            { key: 'hız',      label: '⚡ Hız',       color: '#D97706' },
            { key: 'hafıza',   label: '🧠 Hafıza',   color: '#7C3AED' },
            { key: 'kelime',   label: '🔤 Kelime',   color: '#0F766E' },
            { key: 'bulmaca',  label: '🧩 Bulmaca',  color: '#9333EA' },
            { key: 'klasik',   label: '🏺 Klasik',   color: '#92400E' },
          ].map(function(f) {
            const active = filterGenre === f.key;
            return (
              <button key={f.key} onClick={function() { setFilterGenre(f.key); setSearchQuery(''); }}
                style={{ padding: '5px 12px', borderRadius: 16, border: active ? 'none' : '1px solid var(--border)', background: active ? f.color : 'var(--surface)', color: active ? '#fff' : 'var(--text-secondary)', fontWeight: active ? 700 : 400, fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s' }}>
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Game grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {GAMES.filter(function(g) {
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return g.name.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q);
          }
          if (filterPlayers !== 'all') {
            if (filterPlayers === '3-4') {
              if (!(g.players >= 3 || (g.minPlayers && g.players >= 3))) return false;
            } else if (g.players !== filterPlayers) return false;
          }
          if (filterGenre === 'populer') return !!g.popular;
          if (filterGenre === 'yeni') return !!g.isNew;
          if (filterGenre !== 'all' && g.genre !== filterGenre) return false;
          return true;
        }).map(function(game, i) {
          const gs = stats.games[game.id];
          const genreIcons = { strateji:'♟️', hız:'⚡', hafıza:'🧠', kelime:'🔤', bulmaca:'🧩', klasik:'🏺' };
          return (
            <Card
              key={game.id}
              onClick={() => onSelectGame(game)}
              hoverable
              style={{ padding: 0, overflow: 'hidden', animation: 'fadeUp 0.4s ease', animationDelay: `${i * 0.05}s`, animationFillMode: 'both' }}
            >
              <div style={{ background: game.bg, padding: '20px 16px', color: '#fff', position: 'relative', overflow: 'hidden', minHeight: 80 }}>
                <div style={{ position: 'absolute', right: -8, top: -8, fontSize: 64, opacity: 0.15, fontWeight: 800 }}>{game.icon}</div>
                {game.isNew && <div style={{ position:'absolute', top:8, right:8, background:'#E63946', color:'#fff', fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:8, letterSpacing:0.5 }}>YENİ</div>}
                <span style={{ fontSize: 28, display: 'block', marginBottom: 2 }}>{game.icon}</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  <span style={{ fontSize: 10, background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '2px 6px' }}>
                    {game.players === 1 ? '👤 Tek' : game.minPlayers ? `👨‍👩‍👧 ${game.minPlayers}-${game.players} Kişi` : '👥 2 Kişi'}
                  </span>
                  <span style={{ fontSize: 10, background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '2px 6px', textTransform: 'capitalize' }}>
                    {genreIcons[game.genre] || '🎮'} {game.genre}
                  </span>
                </div>
              </div>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontFamily: "'Sora', sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{game.name}</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: 0, lineHeight: 1.4 }}>{game.desc}</p>
                  </div>
                  <button
                    onClick={function(e) { e.stopPropagation(); onSelectGame(game); }}
                    style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", flexShrink: 0, whiteSpace: 'nowrap' }}>
                    Oyna →
                  </button>
                </div>
                {gs && gs.played > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: game.color, fontWeight: 600 }}>
                    {gs.wins}G / {gs.losses}M · {gs.played} oyun
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Davet Linki */}
      <div style={{marginTop:24,padding:'16px 20px',borderRadius:16,background:'linear-gradient(135deg,#1e1b4b,#2d1b69)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
        <div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:2}}>🔗 Arkadaşını Davet Et</div>
          <div style={{fontSize:12,opacity:0.8}}>Linki paylaş, birlikte oynayın!</div>
        </div>
        <button onClick={()=>{
          const url = window.location.origin;
          if(navigator.share){navigator.share({title:'oyun.club',text:'Benimle oyna! 🎮',url});}
          else{navigator.clipboard?.writeText(url);alert('Link kopyalandı!');}
        }} style={{padding:'10px 18px',borderRadius:12,border:'none',background:'rgba(255,255,255,0.2)',color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',backdropFilter:'blur(10px)'}}>
          📤 Paylaş
        </button>
      </div>

      {/* Bağış */}
      <div style={{marginTop:16,padding:'20px',borderRadius:16,background:'var(--surface)',border:'1px solid var(--border)',textAlign:'center'}}>
        <div style={{fontSize:28,marginBottom:6}}>🙏</div>
        <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Daha iyi oyunlar için destek ol!</div>
        <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:16}}>Küçük bir katkı yeni oyunlar eklememize yardımcı olur.</div>
        <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
          <a href="https://www.patreon.com/oyunclup" target="_blank" rel="noopener noreferrer"
            style={{display:'inline-flex',alignItems:'center',gap:6,padding:'10px 20px',borderRadius:12,background:'linear-gradient(135deg,#FF424D,#FF7A45)',color:'#fff',fontWeight:700,fontSize:14,textDecoration:'none'}}>
            🎗️ Patreon
          </a>
          <a href="https://papara.com/personal/payment/oyunclub" target="_blank" rel="noopener noreferrer"
            style={{display:'inline-flex',alignItems:'center',gap:6,padding:'10px 20px',borderRadius:12,background:'linear-gradient(135deg,#6B21A8,#A855F7)',color:'#fff',fontWeight:700,fontSize:14,textDecoration:'none'}}>
            💜 Papara
          </a>
        </div>
      </div>

    </div>
  );
};

// ============================================================
// ROOM LOBBY
// ============================================================
const RoomLobby = ({ game, roomId, players, onStart, onCopyLink }) => (
  <div
    style={{
      maxWidth: 500,
      margin: '0 auto',
      padding: '48px 20px',
      animation: 'scaleIn 0.4s ease',
      textAlign: 'center',
    }}
  >
    <div
      style={{
        width: 72,
        height: 72,
        borderRadius: 20,
        background: game.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 32,
        margin: '0 auto 20px',
      }}
    >
      {game.icon}
    </div>
    <h2
      style={{
        fontFamily: "'Sora', sans-serif",
        fontSize: 28,
        fontWeight: 700,
        marginBottom: 8,
      }}
    >
      {game.name}
    </h2>
    <Card style={{ marginTop: 24, marginBottom: 24, padding: 20 }}>
      <div
        style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          marginBottom: 8,
        }}
      >
        Masa Kodu
      </div>
      <span
        style={{
          fontFamily: "'Sora', sans-serif",
          fontSize: 32,
          fontWeight: 800,
          letterSpacing: 6,
          color: game.color,
        }}
      >
        {roomId}
      </span>
      <Button
        variant="secondary"
        onClick={onCopyLink}
        style={{ marginTop: 16, width: '100%' }}
      >
        📋 Davet Linkini Kopyala
      </Button>
    </Card>
    <Card style={{ padding: 20 }}>
      <div
        style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          marginBottom: 16,
        }}
      >
        Oyuncular ({players.length}/{game.players})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {players.map((p, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 16px',
              background: 'var(--surface-hover)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <Avatar name={p} size={32} />
            <span style={{ fontWeight: 500, fontSize: 15 }}>{p}</span>
            {i === 0 && (
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  padding: '2px 8px',
                  background: game.bg,
                  color: '#fff',
                  borderRadius: 20,
                  fontWeight: 600,
                }}
              >
                HOST
              </span>
            )}
          </div>
        ))}
        {Array.from({ length: game.players - players.length }).map((_, i) => (
          <div
            key={`e-${i}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 16px',
              borderRadius: 'var(--radius-sm)',
              border: '2px dashed var(--border)',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: '2px dashed var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
              }}
            >
              ?
            </div>
            <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Bekleniyor...
            </span>
          </div>
        ))}
      </div>
    </Card>
    {game.players === 1 || players.length >= game.players ? (
      <Button
        onClick={onStart}
        style={{
          marginTop: 24,
          width: '100%',
          padding: '16px',
          fontSize: 16,
          background: game.bg,
        }}
      >
        ▶ Oyunu Başlat
      </Button>
    ) : (
      <p
        style={{ marginTop: 24, color: 'var(--text-secondary)', fontSize: 14 }}
      >
        Oyuncular bekleniyor...
      </p>
    )}
    {game.players > 1 && players.length < game.players && (
      <Button
        variant="ghost"
        onClick={onStart}
        style={{ marginTop: 8, fontSize: 13 }}
      >
        Bot ile başlat (Demo)
      </Button>
    )}
  </div>
);

// ============================================================
// XOX GAME
// ============================================================
const XOXGame = ({ game, players, onGameEnd, soundOn, onGoOnline }) => {
  const [mode, setMode] = useState(null); // null | 'bot' | '2p'
  const [difficulty, setDifficulty] = useState(null); // null | 'easy' | 'medium' | 'hard'
  const [board, setBoard] = useState(Array(9).fill(null));
  const [isX, setIsX] = useState(true);
  const [winner, setWinner] = useState(null);
  const [winLine, setWinLine] = useState(null);
  const [scores, setScores] = useState({ x: 0, o: 0, draw: 0 });
  const [showConfetti, setShowConfetti] = useState(false);
  const [botThinking, setBotThinking] = useState(false);

  const checkWinner = useCallback((b) => {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a, bb, c] of lines) {
      if (b[a] && b[a] === b[bb] && b[a] === b[c])
        return { winner: b[a], line: [a, bb, c] };
    }
    if (b.every(Boolean)) return { winner: 'draw', line: null };
    return null;
  }, []);

  // Easy: random move
  const botMoveEasy = useCallback((b) => {
    const empty = b.map((v,i) => v ? null : i).filter(i => i !== null);
    return empty[Math.floor(Math.random() * empty.length)];
  }, []);

  // Medium: win > block > center > corner > random
  const botMoveMedium = useCallback((b) => {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    const empty = b.map((v,i) => v ? null : i).filter(i => i !== null);
    for (const mark of ['O','X']) {
      for (const [a,bb,c] of lines) {
        const cells = [b[a],b[bb],b[c]];
        if (cells.filter(v=>v===mark).length===2 && cells.includes(null)) {
          const idx = [a,bb,c][cells.indexOf(null)];
          if (empty.includes(idx)) return idx;
        }
      }
    }
    if (empty.includes(4)) return 4;
    const corners = [0,2,6,8].filter(i => empty.includes(i));
    if (corners.length) return corners[Math.floor(Math.random()*corners.length)];
    return empty[Math.floor(Math.random()*empty.length)];
  }, []);

  // Hard: minimax
  const botMoveHard = useCallback((b) => {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    function score(bd, depth, isMaximizing) {
      for (const [a,bb,c] of lines) {
        if (bd[a] && bd[a]===bd[bb] && bd[a]===bd[c]) {
          return bd[a] === 'O' ? 10 - depth : depth - 10;
        }
      }
      if (bd.every(Boolean)) return 0;
      const empty = bd.map((v,i) => v?null:i).filter(i=>i!==null);
      if (isMaximizing) {
        let best = -Infinity;
        for (const i of empty) { const nb=[...bd]; nb[i]='O'; best=Math.max(best, score(nb,depth+1,false)); }
        return best;
      } else {
        let best = Infinity;
        for (const i of empty) { const nb=[...bd]; nb[i]='X'; best=Math.min(best, score(nb,depth+1,true)); }
        return best;
      }
    }
    const empty = b.map((v,i) => v?null:i).filter(i=>i!==null);
    let bestScore = -Infinity, bestMove = empty[0];
    for (const i of empty) {
      const nb=[...b]; nb[i]='O';
      const s = score(nb,0,false);
      if (s > bestScore) { bestScore=s; bestMove=i; }
    }
    return bestMove;
  }, []);

  const getBotMove = useCallback((b) => {
    if (difficulty === 'easy') return botMoveEasy(b);
    if (difficulty === 'hard') return botMoveHard(b);
    return botMoveMedium(b);
  }, [difficulty, botMoveEasy, botMoveMedium, botMoveHard]);

  const applyMove = useCallback((nb, currentIsX) => {
    const r = checkWinner(nb);
    if (r) {
      setWinner(r.winner); setWinLine(r.line);
      const diffOpts = difficulty ? { difficulty } : undefined;
      if (r.winner === 'draw') { setScores(s=>({...s,draw:s.draw+1})); onGameEnd('draw', diffOpts); }
      else if (r.winner === 'X') { setScores(s=>({...s,x:s.x+1})); onGameEnd('win', diffOpts); if(soundOn)playSound('win'); setShowConfetti(true); setTimeout(()=>setShowConfetti(false),2000); }
      else { setScores(s=>({...s,o:s.o+1})); onGameEnd('loss', diffOpts); if(soundOn)playSound('lose'); }
      return true;
    }
    return false;
  }, [checkWinner, onGameEnd, soundOn, difficulty]);

  const handleClick = (i) => {
    if (!mode || board[i] || winner || botThinking) return;
    if (mode === 'bot' && !isX) return; // O = bot's turn
    if (soundOn) playSound('place');
    playHaptic('tap');
    const nb = [...board]; nb[i] = isX ? 'X' : 'O';
    setBoard(nb);
    const finished = applyMove(nb, isX);
    if (!finished) {
      setIsX(!isX);
      if (mode === 'bot') {
        setBotThinking(true);
        setTimeout(() => {
          const bi = getBotMove(nb);
          if (bi !== undefined) {
            const nb2 = [...nb]; nb2[bi] = 'O';
            setBoard(nb2);
            applyMove(nb2, false);
            setIsX(true);
          }
          setBotThinking(false);
        }, difficulty === 'hard' ? 600 : 400);
      }
    }
  };

  const reset = () => { setBoard(Array(9).fill(null)); setIsX(true); setWinner(null); setWinLine(null); };

  if (!mode) return (
    <div style={{maxWidth:380,margin:'0 auto',padding:'32px 16px',textAlign:'center'}}>
      <div style={{fontSize:56,marginBottom:12}}>✕○</div>
      <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:26,marginBottom:8}}>XOX</h2>
      <p style={{color:'var(--text-secondary)',marginBottom:28,fontSize:15}}>Klasik Tic-Tac-Toe</p>
      <div style={{display:'flex',flexDirection:'column',gap:12,maxWidth:280,margin:'0 auto'}}>
        {onGoOnline && (
          <button onClick={onGoOnline} style={{padding:'16px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',color:'#FFF',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>
            🌐 Çevrimiçi Oyna
            <div style={{fontSize:12,fontWeight:400,opacity:0.85,marginTop:3}}>Arkadaşını davet et</div>
          </button>
        )}
        <div style={{background:'var(--surface-hover)',borderRadius:14,padding:'16px',border:'1px solid var(--border)'}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:'var(--text-secondary)'}}>🤖 Bota Karşı — Zorluk</div>
          <div style={{display:'flex',gap:8,justifyContent:'center',marginBottom:12}}>
            {[['easy','Kolay','#059669'],['medium','Orta','#D97706'],['hard','Zor','#E63946']].map(([d,label,color])=>(
              <button key={d} onClick={()=>setDifficulty(d===difficulty?null:d)}
                style={{flex:1,padding:'10px 4px',borderRadius:10,border:`2px solid ${difficulty===d?color:'var(--border)'}`,
                  background:difficulty===d?color+'22':'transparent',color:difficulty===d?color:'var(--text-secondary)',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={()=>{ if(!difficulty)setDifficulty('medium'); setMode('bot'); }}
            style={{width:'100%',padding:'14px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#E63946,#F4845F)',color:'#FFF',fontSize:15,fontWeight:700,cursor:'pointer'}}>
            Oyna
          </button>
        </div>
        <button onClick={()=>setMode('2p')} style={{padding:'16px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#059669,#34D399)',color:'#FFF',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>📱 Aynı Cihazda 2 Kişi</button>
      </div>
    </div>
  );

  return (
    <div
      style={{
        maxWidth: 440,
        margin: '0 auto',
        padding: '24px 20px',
        animation: 'fadeUp 0.4s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 24,
          marginBottom: 28,
          textAlign: 'center',
        }}
      >
        {[
          {
            label: players[0] || 'Sen (X)',
            score: scores.x,
            color: '#E63946',
            active: isX && !winner,
          },
          {
            label: 'Berabere',
            score: scores.draw,
            color: 'var(--text-secondary)',
          },
          {
            label: mode === 'bot' ? '🤖 Bot (O)' : players[1] || 'Oyuncu 2 (O)',
            score: scores.o,
            color: '#457B9D',
            active: !isX && !winner,
          },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              padding: '12px 20px',
              borderRadius: 'var(--radius-sm)',
              background: s.active ? 'var(--surface)' : 'transparent',
              boxShadow: s.active ? 'var(--shadow)' : 'none',
              transition: 'var(--transition)',
              minWidth: 80,
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                marginBottom: 4,
                fontWeight: 500,
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 28,
                fontWeight: 800,
                color: s.color,
              }}
            >
              {s.score}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          maxWidth: 320,
          margin: '0 auto',
        }}
      >
        {board.map((cell, i) => (
          <button
            key={i}
            onClick={() => handleClick(i)}
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: 'var(--radius-sm)',
              border: '2px solid var(--border)',
              background: winLine?.includes(i)
                ? winner === 'X'
                  ? '#FEE2E2'
                  : '#DBEAFE'
                : 'var(--surface)',
              cursor: cell || winner ? 'default' : 'pointer',
              fontSize: 'clamp(28px, 8vw, 48px)',
              fontFamily: "'Sora', sans-serif",
              fontWeight: 800,
              color: cell === 'X' ? '#E63946' : '#457B9D',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: cell ? 'scaleIn 0.2s ease' : 'none',
            }}
          >
            {cell}
          </button>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginTop: 24 }}>
        {winner ? (
          <div style={{ animation: 'bounceIn 0.5s ease' }}>
            <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
              {winner === 'draw' ? 'Berabere! 🤝'
                : winner === 'X' ? (mode === 'bot' ? 'Kazandın! 🎉' : 'Oyuncu 1 Kazandı! 🎉')
                : (mode === 'bot' ? 'Bot Kazandı! 🤖' : 'Oyuncu 2 Kazandı! 🎉')}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button onClick={reset} style={{ background: game?.bg || '#E63946' }}>Tekrar Oyna</Button>
              <button onClick={() => { reset(); setMode(null); setScores({x:0,o:0,draw:0}); }} style={{ padding: '10px 20px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Menü</button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 8 }}>
              {botThinking ? '🤖 Bot düşünüyor...' : <>Sıra: <strong style={{ color: isX ? '#E63946' : '#457B9D' }}>{isX ? 'Sen (X)' : (mode === 'bot' ? '🤖 Bot' : 'Oyuncu 2 (O)')}</strong></>}
            </p>
            <button onClick={() => { reset(); setMode(null); setScores({x:0,o:0,draw:0}); }} style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>Menü</button>
          </div>
        )}
      </div>
      <Confetti active={showConfetti} color={game?.color || '#E63946'} />
    </div>
  );
};

// ============================================================
// MINESWEEPER GAME
// ============================================================
const MinesweeperGame = ({ game, onGameEnd, soundOn, dark }) => {
  const ROWS = 9,
    COLS = 9,
    MINES = 10;
  const initBoard = useCallback(() => {
    const cells = Array.from({ length: ROWS * COLS }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      adjacent: 0,
    }));
    const mineIdx = new Set();
    while (mineIdx.size < MINES)
      mineIdx.add(Math.floor(Math.random() * ROWS * COLS));
    mineIdx.forEach((i) => {
      cells[i].mine = true;
    });
    cells.forEach((cell, i) => {
      if (cell.mine) return;
      const r = Math.floor(i / COLS),
        c = i % COLS;
      let cnt = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr,
            nc = c + dc;
          if (
            nr >= 0 &&
            nr < ROWS &&
            nc >= 0 &&
            nc < COLS &&
            cells[nr * COLS + nc].mine
          )
            cnt++;
        }
      cell.adjacent = cnt;
    });
    return cells;
  }, []);
  const [cells, setCells] = useState(() => initBoard());
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [time, setTime] = useState(0);
  const [started, setStarted] = useState(false);
  const [flagMode, setFlagMode] = useState(false);
  const timerRef = useRef(null);
  const longPressRef = useRef(null);
  useEffect(() => {
    if (started && !gameOver && !won)
      timerRef.current = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [started, gameOver, won]);
  const reveal = (idx, nc) => {
    if (nc[idx].revealed || nc[idx].flagged) return;
    nc[idx].revealed = true;
    if (nc[idx].adjacent === 0 && !nc[idx].mine) {
      const r = Math.floor(idx / COLS),
        c = idx % COLS;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr,
            ncc = c + dc;
          if (nr >= 0 && nr < ROWS && ncc >= 0 && ncc < COLS)
            reveal(nr * COLS + ncc, nc);
        }
    }
  };
  const doFlag = (idx) => {
    if (gameOver || won || cells[idx].revealed) return;
    if (soundOn) playSound('flip');
    const nc = cells.map((c) => ({ ...c }));
    nc[idx].flagged = !nc[idx].flagged;
    setCells(nc);
  };
  const handleClick = (idx) => {
    if (gameOver || won) return;
    if (flagMode) { doFlag(idx); return; }
    if (cells[idx].flagged) return;
    if (!started) setStarted(true);
    if (soundOn) playSound('click');
    const nc = cells.map((c) => ({ ...c }));
    if (nc[idx].mine) {
      nc.forEach((c) => { if (c.mine) c.revealed = true; });
      setCells(nc);
      setGameOver(true);
      clearInterval(timerRef.current);
      if (soundOn) playSound('explode');
      onGameEnd('loss');
      return;
    }
    reveal(idx, nc);
    setCells(nc);
    if (nc.filter((c) => !c.mine).every((c) => c.revealed)) {
      setWon(true);
      clearInterval(timerRef.current);
      if (soundOn) playSound('win');
      onGameEnd('win');
    }
  };
  const handleRC = (e, idx) => {
    e.preventDefault();
    doFlag(idx);
  };
  const handleTouchStart = (idx) => {
    longPressRef.current = setTimeout(function() { doFlag(idx); longPressRef.current = null; }, 500);
  };
  const handleTouchEnd = () => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  };
  const reset = () => {
    setCells(initBoard());
    setGameOver(false);
    setWon(false);
    setTime(0);
    setStarted(false);
    setFlagMode(false);
    clearInterval(timerRef.current);
  };
  const flagCount = cells.filter((c) => c.flagged).length;
  const colors = [
    '',
    '#2563EB',
    '#16A34A',
    '#DC2626',
    '#7C3AED',
    '#B91C1C',
    '#0891B2',
    '#1A1A2E',
    '#6B7280',
  ];

  return (
    <div
      style={{
        maxWidth: 500,
        margin: '0 auto',
        padding: '24px 20px',
        animation: 'fadeUp 0.4s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          padding: '12px 16px',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            fontFamily: "'Sora', sans-serif",
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          💣 {MINES - flagCount}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setFlagMode(f => !f)}
            title="Bayrak modu (uzun bas ya da tıkla)"
            style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: flagMode ? '#ef4444' : 'var(--border)', color: flagMode ? '#fff' : 'var(--text)', fontSize: 16, cursor: 'pointer' }}>🚩</button>
          <Button variant="secondary" onClick={reset} style={{ padding: '8px 14px', fontSize: 13 }}>🔄</Button>
        </div>
        <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 18 }}>
          ⏱ {time}s
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gap: 2,
          maxWidth: 380,
          margin: '0 auto',
          userSelect: 'none',
        }}
      >
        {cells.map((cell, i) => (
          <button
            key={i}
            onClick={() => handleClick(i)}
            onContextMenu={(e) => handleRC(e, i)}
            onTouchStart={() => handleTouchStart(i)}
            onTouchEnd={handleTouchEnd}
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: 4,
              border: 'none',
              background: cell.revealed
                ? cell.mine
                  ? dark
                    ? '#4A1A1A'
                    : '#FEE2E2'
                  : dark
                  ? '#252540'
                  : '#F3F4F6'
                : 'var(--surface)',
              boxShadow: cell.revealed
                ? 'none'
                : dark
                ? 'inset 0 -2px 0 rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.15)'
                : 'inset 0 -2px 0 rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
              cursor: gameOver || won ? 'default' : 'pointer',
              fontSize: 'clamp(11px, 3vw, 16px)',
              fontWeight: 700,
              fontFamily: "'Sora', sans-serif",
              color: cell.mine ? '#DC2626' : colors[cell.adjacent],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {cell.revealed
              ? cell.mine
                ? '💣'
                : cell.adjacent || ''
              : cell.flagged
              ? '🚩'
              : ''}
          </button>
        ))}
      </div>
      <p
        style={{
          textAlign: 'center',
          marginTop: 12,
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}
      >
        💡 Bayrak: sağ tık veya uzun basın
      </p>
      {(gameOver || won) && (
        <div
          style={{
            textAlign: 'center',
            marginTop: 24,
            animation: 'scaleIn 0.3s ease',
          }}
        >
          <p
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 22,
              fontWeight: 700,
              marginBottom: 16,
            }}
          >
            {won ? 'Tebrikler! 🎉' : 'Patladı! 💥'}
          </p>
          <Button onClick={reset} style={{ background: game.bg }}>
            Tekrar Oyna
          </Button>
        </div>
      )}
    </div>
  );
};

// ============================================================
// RPS GAME
// ============================================================
const RPSGame = ({ game, players, onGameEnd, soundOn, onGoOnline }) => {
  const CHOICES = [
    { id: 'rock', emoji: '✊', name: 'Taş', beats: 'scissors' },
    { id: 'paper', emoji: '✋', name: 'Kağıt', beats: 'rock' },
    { id: 'scissors', emoji: '✌️', name: 'Makas', beats: 'paper' },
  ];
  const [mode, setMode] = useState(null); // null | 'bot' | '2p'
  const [p1Choice, setP1Choice] = useState(null);
  const [p2Choice, setP2Choice] = useState(null);
  const [p2Hidden, setP2Hidden] = useState(null); // for 2p mode - hidden until both pick
  const [scores, setScores] = useState([0, 0]);
  const [round, setRound] = useState(1);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [gameWinner, setGameWinner] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);

  if (!mode) return (
    <div style={{maxWidth:380,margin:'0 auto',padding:'32px 16px',textAlign:'center'}}>
      <div style={{fontSize:56,marginBottom:12}}>✊✋✌️</div>
      <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:26,marginBottom:8}}>Taş Kağıt Makas</h2>
      <p style={{color:'var(--text-secondary)',marginBottom:28,fontSize:15}}>En iyi 3'ü alan kazanır</p>
      <div style={{display:'flex',flexDirection:'column',gap:12,maxWidth:280,margin:'0 auto'}}>
        {onGoOnline && (
          <button onClick={onGoOnline} style={{padding:'16px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',color:'#FFF',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>
            🌐 Çevrimiçi Oyna
            <div style={{fontSize:12,fontWeight:400,opacity:0.85,marginTop:3}}>Arkadaşını davet et</div>
          </button>
        )}
        <button onClick={()=>setMode('bot')} style={{padding:'16px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#2A9D8F,#76C893)',color:'#FFF',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>🤖 Bota Karşı</button>
        <button onClick={()=>setMode('2p')} style={{padding:'16px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#059669,#34D399)',color:'#FFF',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>📱 Aynı Cihazda 2 Kişi</button>
      </div>
    </div>
  );
  const play = (choice) => {
    if (showResult) return;
    if (soundOn) playSound('place');
    const bot = CHOICES[Math.floor(Math.random() * 3)];
    setP1Choice(choice);
    setP2Choice(bot);
    setShowResult(true);
    let res =
      choice.id === bot.id ? 'draw' : choice.beats === bot.id ? 'p1' : 'p2';
    setResult(res);
    if (soundOn)
      setTimeout(
        () =>
          playSound(res === 'p1' ? 'match' : res === 'p2' ? 'lose' : 'click'),
        300
      );
    const ns = [...scores];
    if (res === 'p1') ns[0]++;
    else if (res === 'p2') ns[1]++;
    setScores(ns);
    if (ns[0] >= 3 || ns[1] >= 3) {
      const w = ns[0] >= 3 ? 0 : 1;
      setTimeout(() => {
        setGameWinner(w);
        onGameEnd(w === 0 ? 'win' : 'loss');
        if (w === 0 && soundOn) playSound('win');
        if (w === 0) {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 2000);
        }
      }, 1500);
    }
  };
  const nextRound = () => {
    setP1Choice(null);
    setP2Choice(null);
    setResult(null);
    setShowResult(false);
    setRound((r) => r + 1);
  };
  const reset = () => {
    setP1Choice(null);
    setP2Choice(null);
    setScores([0, 0]);
    setRound(1);
    setResult(null);
    setShowResult(false);
    setGameWinner(null);
  };

  return (
    <div
      style={{
        maxWidth: 480,
        margin: '0 auto',
        padding: '24px 20px',
        animation: 'fadeUp 0.4s ease',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 14,
          color: 'var(--text-secondary)',
          marginBottom: 8,
        }}
      >
        Raund {round} • İlk 3'e ulaşan kazanır
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 32,
          marginBottom: 32,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
            {players[0] || 'Sen'}
          </div>
          <div
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 40,
              fontWeight: 800,
              color: '#2A9D8F',
            }}
          >
            {scores[0]}
          </div>
        </div>
        <div
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 20,
            fontWeight: 300,
            color: 'var(--text-secondary)',
          }}
        >
          vs
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
            {players[1] || 'Bot'}
          </div>
          <div
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 40,
              fontWeight: 800,
              color: '#E63946',
            }}
          >
            {scores[1]}
          </div>
        </div>
      </div>
      {showResult && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 32,
            marginBottom: 32,
            animation: 'scaleIn 0.3s ease',
          }}
        >
          <div
            style={{
              fontSize: 64,
              animation: 'pulse 0.6s ease',
              filter: result === 'p2' ? 'grayscale(0.5)' : 'none',
            }}
          >
            {p1Choice?.emoji}
          </div>
          <div
            style={{
              fontFamily: "'Sora', sans-serif",
              fontWeight: 800,
              fontSize: 20,
              color:
                result === 'draw'
                  ? 'var(--text-secondary)'
                  : result === 'p1'
                  ? '#2A9D8F'
                  : '#E63946',
            }}
          >
            {result === 'draw' ? '=' : result === 'p1' ? '>' : '<'}
          </div>
          <div
            style={{
              fontSize: 64,
              animation: 'pulse 0.6s ease',
              filter: result === 'p1' ? 'grayscale(0.5)' : 'none',
            }}
          >
            {p2Choice?.emoji}
          </div>
        </div>
      )}
      {showResult && (
        <div
          style={{
            marginBottom: 24,
            fontFamily: "'Sora', sans-serif",
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          {result === 'draw'
            ? 'Berabere! 🤝'
            : result === 'p1'
            ? 'Kazandın! ✨'
            : 'Kaybettin! 😤'}
        </div>
      )}
      {!showResult && !gameWinner && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          {CHOICES.map((c) => (
            <button
              key={c.id}
              onClick={() => play(c)}
              style={{
                width: 100,
                height: 100,
                borderRadius: 'var(--radius)',
                border: '2px solid var(--border)',
                background: 'var(--surface)',
                cursor: 'pointer',
                fontSize: 48,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                transition: 'var(--transition)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.08)';
                e.currentTarget.style.borderColor = game.color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <span>{c.emoji}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                {c.name}
              </span>
            </button>
          ))}
        </div>
      )}
      {showResult && !gameWinner && (
        <Button onClick={nextRound} style={{ background: game.bg }}>
          Sonraki Raund →
        </Button>
      )}
      {gameWinner !== null && (
        <div style={{ animation: 'bounceIn 0.5s ease' }}>
          <div
            style={{
              fontSize: 48,
              marginBottom: 12,
              animation: 'pulse 1s ease infinite',
            }}
          >
            🏆
          </div>
          <p
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 24,
              fontWeight: 700,
              marginBottom: 20,
            }}
          >
            {gameWinner === 0
              ? `${players[0] || 'Sen'} Kazandı!`
              : `${players[1] || 'Bot'} Kazandı!`}
          </p>
          <Button onClick={reset} style={{ background: game.bg }}>
            Tekrar Oyna
          </Button>
        </div>
      )}
      <Confetti active={showConfetti} color={game.color} />
    </div>
  );
};

// ============================================================
// MEMORY GAME
// ============================================================
const CARD_EMOJIS = ['🍎', '🍋', '🍇', '🍊', '🌸', '🌈', '⭐', '🎯'];
const MemoryGame = ({ game, onGameEnd, soundOn }) => {
  const initCards = useCallback(() => {
    const pairs = [...CARD_EMOJIS, ...CARD_EMOJIS];
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    return pairs.map((emoji, i) => ({
      id: i,
      emoji,
      flipped: false,
      matched: false,
    }));
  }, []);

  const [cards, setCards] = useState(() => initCards());
  const [flipped, setFlipped] = useState([]);
  const [moves, setMoves] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [won, setWon] = useState(false);
  const [time, setTime] = useState(0);
  const [started, setStarted] = useState(false);
  const timerRef = useRef(null);
  const lockRef = useRef(false);

  useEffect(() => {
    if (started && !won)
      timerRef.current = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [started, won]);

  const handleFlip = (idx) => {
    if (
      lockRef.current ||
      cards[idx].flipped ||
      cards[idx].matched ||
      flipped.length >= 2
    )
      return;
    if (!started) setStarted(true);
    if (soundOn) playSound('flip');
    const nc = cards.map((c) => ({ ...c }));
    nc[idx].flipped = true;
    setCards(nc);
    const newFlipped = [...flipped, idx];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setMoves((m) => m + 1);
      lockRef.current = true;
      const [a, b] = newFlipped;
      if (nc[a].emoji === nc[b].emoji) {
        if (soundOn) setTimeout(() => playSound('match'), 200);
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c, i) =>
              i === a || i === b ? { ...c, matched: true } : c
            )
          );
          const nm = matchCount + 1;
          setMatchCount(nm);
          if (nm === CARD_EMOJIS.length) {
            setWon(true);
            clearInterval(timerRef.current);
            onGameEnd('win');
            if (soundOn) playSound('win');
          }
          setFlipped([]);
          lockRef.current = false;
        }, 400);
      } else {
        if (soundOn) setTimeout(() => playSound('lose'), 400);
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c, i) =>
              i === a || i === b ? { ...c, flipped: false } : c
            )
          );
          setFlipped([]);
          lockRef.current = false;
        }, 800);
      }
    }
  };

  const reset = () => {
    setCards(initCards());
    setFlipped([]);
    setMoves(0);
    setMatchCount(0);
    setWon(false);
    setTime(0);
    setStarted(false);
    lockRef.current = false;
    clearInterval(timerRef.current);
  };

  const stars = moves <= 10 ? 3 : moves <= 16 ? 2 : 1;

  return (
    <div
      style={{
        maxWidth: 440,
        margin: '0 auto',
        padding: '24px 20px',
        animation: 'fadeUp 0.4s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          padding: '12px 16px',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            fontFamily: "'Sora', sans-serif",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          🎯 {moves} hamle
        </div>
        <Button
          variant="secondary"
          onClick={reset}
          style={{ padding: '8px 16px', fontSize: 13 }}
        >
          🔄 Yeni
        </Button>
        <div
          style={{
            fontFamily: "'Sora', sans-serif",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          ⏱ {time}s
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          maxWidth: 360,
          margin: '0 auto',
        }}
      >
        {cards.map((card, i) => (
          <button
            key={card.id}
            onClick={() => handleFlip(i)}
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: 'var(--radius-sm)',
              border: '2px solid',
              borderColor: card.matched
                ? '#A78BFA'
                : card.flipped
                ? game.color
                : 'var(--border)',
              background:
                card.flipped || card.matched
                  ? card.matched
                    ? 'var(--surface-hover)'
                    : 'var(--surface)'
                  : game.bg,
              cursor: card.flipped || card.matched ? 'default' : 'pointer',
              fontSize: 'clamp(24px, 7vw, 36px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease',
              opacity: card.matched ? 0.7 : 1,
            }}
          >
            {card.flipped || card.matched ? (
              <span style={{ animation: 'scaleIn 0.25s ease' }}>
                {card.emoji}
              </span>
            ) : (
              <span
                style={{
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: 'clamp(18px, 5vw, 24px)',
                }}
              >
                ?
              </span>
            )}
          </button>
        ))}
      </div>

      <div
        style={{
          textAlign: 'center',
          marginTop: 16,
          fontSize: 13,
          color: 'var(--text-secondary)',
        }}
      >
        {matchCount}/{CARD_EMOJIS.length} eşleşme bulundu
      </div>

      {won && (
        <div
          style={{
            textAlign: 'center',
            marginTop: 24,
            animation: 'scaleIn 0.4s ease',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>
            {'⭐'.repeat(stars)}
            {'☆'.repeat(3 - stars)}
          </div>
          <p
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 22,
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Tebrikler! 🎉
          </p>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            {moves} hamlede, {time} saniyede tamamladın
          </p>
          <Button onClick={reset} style={{ background: game.bg }}>
            Tekrar Oyna
          </Button>
        </div>
      )}
    </div>
  );
};

// ============================================================
// SNAKE GAME
// ============================================================
const GRID = 20;
const SnakeGame = ({ game, onGameEnd, soundOn, dark }) => {
  const canvasRef = useRef(null);
  const [gameState, setGameState] = useState('idle');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const snakeRef = useRef([{ x: 10, y: 10 }]);
  const dirRef = useRef({ x: 1, y: 0 });
  const nextDirRef = useRef({ x: 1, y: 0 });
  const foodRef = useRef({ x: 15, y: 10 });
  const loopRef = useRef(null);
  const scoreRef = useRef(0);
  const gameOverRef = useRef(false);
  const onGameEndRef = useRef(onGameEnd);
  onGameEndRef.current = onGameEnd;
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const darkRef = useRef(dark);
  darkRef.current = dark;

  const spawnFood = useCallback(() => {
    let f;
    do {
      f = {
        x: Math.floor(Math.random() * GRID),
        y: Math.floor(Math.random() * GRID),
      };
    } while (snakeRef.current.some((s) => s.x === f.x && s.y === f.y));
    foodRef.current = f;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width / GRID;
    ctx.fillStyle = darkRef.current ? '#1A1A2E' : '#F8FAFC';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = darkRef.current ? '#2A2A45' : '#E5E7EB';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * size, 0);
      ctx.lineTo(i * size, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * size);
      ctx.lineTo(canvas.width, i * size);
      ctx.stroke();
    }
    const snake = snakeRef.current;
    snake.forEach((seg, i) => {
      const ratio = 1 - (i / snake.length) * 0.4;
      const r = Math.round(5 * ratio + 150 * (1 - ratio));
      const g = Math.round(150 * ratio + 211 * (1 - ratio));
      const b = Math.round(105 * ratio + 153 * (1 - ratio));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      const pad = i === 0 ? 1 : 2;
      ctx.beginPath();
      ctx.roundRect(
        seg.x * size + pad,
        seg.y * size + pad,
        size - pad * 2,
        size - pad * 2,
        i === 0 ? 6 : 4
      );
      ctx.fill();
    });
    const head = snake[0];
    const ex = head.x * size + size * 0.3;
    const ey = head.y * size + size * 0.3;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + size * 0.35, ey, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1A1A2E';
    ctx.beginPath();
    ctx.arc(ex + 1, ey, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + size * 0.35 + 1, ey, 1.5, 0, Math.PI * 2);
    ctx.fill();
    const food = foodRef.current;
    ctx.font = `${size - 4}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🍎', food.x * size + size / 2, food.y * size + size / 2 + 1);
  }, []);

  const gameLoop = useCallback(() => {
    dirRef.current = nextDirRef.current;
    const snake = snakeRef.current;
    const head = {
      x: snake[0].x + dirRef.current.x,
      y: snake[0].y + dirRef.current.y,
    };
    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
      clearInterval(loopRef.current);
      if (!gameOverRef.current) {
        gameOverRef.current = true;
        setGameState('over');
        if (soundOnRef.current) playSound('explode');
        onGameEndRef.current('loss');
      }
      return;
    }
    if (snake.some((s) => s.x === head.x && s.y === head.y)) {
      clearInterval(loopRef.current);
      if (!gameOverRef.current) {
        gameOverRef.current = true;
        setGameState('over');
        if (soundOnRef.current) playSound('explode');
        onGameEndRef.current('loss');
      }
      return;
    }
    const newSnake = [head, ...snake];
    if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
      scoreRef.current++;
      setScore(scoreRef.current);
      setHighScore((h) => Math.max(h, scoreRef.current));
      if (soundOnRef.current) playSound('eat');
      spawnFood();
    } else {
      newSnake.pop();
    }
    snakeRef.current = newSnake;
    draw();
  }, [draw, spawnFood]);

  const startGame = useCallback(() => {
    snakeRef.current = [{ x: 10, y: 10 }];
    dirRef.current = { x: 1, y: 0 };
    nextDirRef.current = { x: 1, y: 0 };
    scoreRef.current = 0;
    gameOverRef.current = false;
    setScore(0);
    spawnFood();
    setGameState('playing');
    draw();
    clearInterval(loopRef.current);
    loopRef.current = setInterval(gameLoop, 120);
  }, [gameLoop, draw, spawnFood]);

  useEffect(() => {
    return () => clearInterval(loopRef.current);
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (gameState !== 'playing') return;
      const d = dirRef.current;
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
          if (d.y !== 1) nextDirRef.current = { x: 0, y: -1 };
          break;
        case 'ArrowDown':
        case 's':
          if (d.y !== -1) nextDirRef.current = { x: 0, y: 1 };
          break;
        case 'ArrowLeft':
        case 'a':
          if (d.x !== 1) nextDirRef.current = { x: -1, y: 0 };
          break;
        case 'ArrowRight':
        case 'd':
          if (d.x !== -1) nextDirRef.current = { x: 1, y: 0 };
          break;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [gameState]);

  const touchStart = useRef(null);
  const handleTouchStart = (e) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e) => {
    if (!touchStart.current || gameState !== 'playing') return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    const d = dirRef.current;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 20 && d.x !== -1) nextDirRef.current = { x: 1, y: 0 };
      else if (dx < -20 && d.x !== 1) nextDirRef.current = { x: -1, y: 0 };
    } else {
      if (dy > 20 && d.y !== -1) nextDirRef.current = { x: 0, y: 1 };
      else if (dy < -20 && d.y !== 1) nextDirRef.current = { x: 0, y: -1 };
    }
    touchStart.current = null;
  };

  useEffect(() => {
    if (gameState === 'idle') draw();
  }, [gameState, draw]);

  const canvasSize = Math.min(
    380,
    typeof window !== 'undefined' ? window.innerWidth - 40 : 380
  );

  return (
    <div
      style={{
        maxWidth: 440,
        margin: '0 auto',
        padding: '24px 20px',
        animation: 'fadeUp 0.4s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          padding: '12px 16px',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            fontFamily: "'Sora', sans-serif",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          🍎 {score}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          En yüksek: {highScore}
        </div>
      </div>
      <div
        style={{
          position: 'relative',
          margin: '0 auto',
          width: canvasSize,
          height: canvasSize,
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize}
          height={canvasSize}
          style={{
            borderRadius: 'var(--radius-sm)',
            border: '2px solid var(--border)',
            display: 'block',
          }}
        />
        {gameState !== 'playing' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: dark
                ? 'rgba(15,15,23,0.92)'
                : 'rgba(255,255,255,0.9)',
              borderRadius: 'var(--radius-sm)',
              animation: 'scaleIn 0.3s ease',
            }}
          >
            {gameState === 'over' && (
              <>
                <div style={{ fontSize: 48, marginBottom: 8 }}>💀</div>
                <p
                  style={{
                    fontFamily: "'Sora', sans-serif",
                    fontSize: 22,
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  Oyun Bitti!
                </p>
                <p
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: 14,
                    marginBottom: 20,
                  }}
                >
                  Skor: {score}
                </p>
              </>
            )}
            {gameState === 'idle' && (
              <>
                <div
                  style={{
                    fontSize: 48,
                    marginBottom: 8,
                    animation: 'float 2s ease-in-out infinite',
                  }}
                >
                  🐍
                </div>
                <p
                  style={{
                    fontFamily: "'Sora', sans-serif",
                    fontSize: 18,
                    fontWeight: 600,
                    marginBottom: 20,
                    color: 'var(--text-secondary)',
                  }}
                >
                  Hazır mısın?
                </p>
              </>
            )}
            <Button
              onClick={startGame}
              style={{
                background: game.bg,
                padding: '14px 32px',
                fontSize: 16,
              }}
            >
              {gameState === 'over' ? 'Tekrar Oyna' : '▶ Başla'}
            </Button>
          </div>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: 20,
          gap: 4,
        }}
      >
        <button
          onClick={() => {
            if (gameState === 'playing' && dirRef.current.y !== 1)
              nextDirRef.current = { x: 0, y: -1 };
          }}
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            fontSize: 22,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ↑
        </button>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => {
              if (gameState === 'playing' && dirRef.current.x !== 1)
                nextDirRef.current = { x: -1, y: 0 };
            }}
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              fontSize: 22,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ←
          </button>
          <div style={{ width: 56, height: 56 }} />
          <button
            onClick={() => {
              if (gameState === 'playing' && dirRef.current.x !== -1)
                nextDirRef.current = { x: 1, y: 0 };
            }}
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              fontSize: 22,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            →
          </button>
        </div>
        <button
          onClick={() => {
            if (gameState === 'playing' && dirRef.current.y !== -1)
              nextDirRef.current = { x: 0, y: 1 };
          }}
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            fontSize: 22,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ↓
        </button>
      </div>
      <p
        style={{
          textAlign: 'center',
          marginTop: 10,
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}
      >
        💡 Yön tuşları, WASD veya ekrana kaydır
      </p>
    </div>
  );
};

// ============================================================
// GAME HELP TEXTS
// ============================================================
const GAME_HELP = {
  xox:         { icon:'❌⭕', title:'XOX (Tic-Tac-Toe)',    rules:['3×3 ızgaraya sırayla X ve O koy.','Yatay, dikey veya çapraz 3 aynı işareti diz — kazanırsın.','Tüm hücreler dolup kimse dizemezse berabere.'] },
  minesweeper: { icon:'💣',  title:'Mayın Tarlası',         rules:['Karelere tıkla, mayın olmayan tüm kareleri aç.','Sayılar o kareye komşu kaç mayın olduğunu gösterir.','Mayına basarsan kaybedersin. Bayrak koymak için uzun bas (mobil) veya sağ tıkla.'] },
  rps:         { icon:'✊',  title:'Taş Kağıt Makas',       rules:['Taş makası, makas kağıdı, kağıt taşı yener.','Aynı anda seçim yap, kazanmak için rakibi yen.','5 raundda daha fazla galibiyet alan oyunu kazanır.'] },
  memory:      { icon:'🃏',  title:'Hafıza (Eşleştirme)',   rules:['Kartlar yüzü aşağı sıralı. Her turda 2 kart çevir.','Aynı çiftse kartlar açık kalır, puan alırsın.','Tüm çiftleri bul — oyunu bitir!'] },
  snake:       { icon:'🐍',  title:'Yılan',                 rules:['Yılanı ok tuşları veya ekrana kaydırarak yönet.','Her yenen elma yılanı uzatır.','Duvara veya kendi kuyruğuna çarparsan oyun biter.'] },
  '2048':      { icon:'🔢',  title:'2048',                  rules:['Ok tuşları veya kaydırmayla tüm taşları bir yöne it.','Aynı sayılı iki taş birleşince toplamları olur.','2048 sayısına ulaş — kazanırsın!'] },
  wordle:      { icon:'🟩',  title:'Wordle',                rules:['5 harfli Türkçe kelimeyi 6 denemede bul.','Yeşil: doğru harf, doğru yer. Sarı: doğru harf, yanlış yer. Gri: kelimede yok.','Her tahmin gerçek bir kelime olmalı.'] },
  connectfour: { icon:'🔵',  title:'Dört Sıra',             rules:['Sırayla sütunlara disk bırak, yatay/dikey/çapraz 4 disk diz.','Tahta dolarsa berabere.','Bota karşı veya aynı cihazda 2 kişi oyna.'] },
  dama:        { icon:'⚫',  title:'Dama',                  rules:['Taşları çapraz ilerlet. Rakip taşını atlayarak ye.','Karşı sıraya ulaşan taş "dama" olur, her yöne gidebilir.','Tüm rakip taşlarını yen veya tıkandır — kazanırsın.'] },
  sudoku:      { icon:'🔲',  title:'Sudoku',                rules:['9×9 ızgarayı 1-9 rakamlarıyla doldur.','Her satır, sütun ve 3×3 kutuda rakamlar tekrarsız olmalı.','Hatalı rakamlar kırmızıyla gösterilir.'] },
  gomoku:      { icon:'⚫',  title:'Beş Taş (Gomoku)',      rules:['Sırayla taş koy, yatay/dikey/çapraz 5 taşı diz — kazanırsın.','Siyah taşlar senin, beyaz taşlar bot/rakip.','Bota karşı veya aynı cihazda 2 kişi oyna.'] },
  reaction:    { icon:'⚡',  title:'Refleks Savaşı',        rules:['Yeşil ışık yandığında mümkün olduğunca hızlı dokun/tıkla.','En hızlı 5 turda en çok turu kazanan galip.','Erken basarsan tur kaybedebilirsin!'] },
  mathduel:    { icon:'🧮',  title:'Matematik Düellosu',    rules:['Ekranda bir matematik sorusu çıkar.','Doğru cevabı rakibinden önce seç.','10 soruda en çok doğru yapan kazanır.'] },
  cardbattle:  { icon:'🃏',  title:'Kart Savaşı',           rules:['Her turda iki karta bakılır, yüksek kart turu kazanır.','13 turda en çok turu kazanan oyunu kazanır.','Beraberlik o turda puan yok.'] },
  memorybattle:{ icon:'🧠',  title:'Hafıza Savaşı',         rules:['Kendi sırandayken 2 kart çevir, eşleştirirsen yeniden hamle hakkı kazanırsın.','12 çifti kim önce eşleştirirse kazanır.','2 kişilik strateji: rakibinin açtığı kartları aklında tut.'] },
  wordrace:    { icon:'🔤',  title:'Kelime Yarışı',          rules:['Ekranda karışık harfler görünür — doğru kelimeyi bul.','Rakibinden önce doğru yazarsan puan alırsın.','En çok tura kazanan kazanır.'] },
  mangala:     { icon:'🪨',  title:'Mangala',               rules:['Her tur bir çukurdan taşları al, sola doğru tek tek dağıt.','Son taş kendi haznene düşerse tekrar oynarsın.','Son taş boş rakip çukuruna düşerse karşısındaki taşları alırsın.','Tüm çukurlar boşaldığında haznesinde daha fazla taş olan kazanır.'] },
  simon:       { icon:'🔴',  title:'Simon Söylüyor',         rules:['Renkli düğmeler sırayla yanıp söner — diziyi ezberle.','Sıra sende: aynı renkli düğmelere aynı sırada bas.','Her turda dizi bir adım uzar. Hata yaparsan oyun biter.'] },
  lightsout:   { icon:'💡',  title:'Işığı Söndür',           rules:['Bir kareye tıkladığında o kare ve 4 komşusu (yukarı/aşağı/sol/sağ) durumunu değiştirir.','Amaç tüm ışıkları söndürmek.','Az hamleyle bitirmek için kafanı kullan!'] },
  brickbreaker:{ icon:'🧱',  title:'Top Patlatma',           rules:['Paddle\'ı hareket ettir (fare/parmak veya ok tuşları).','Top fırlatmak için tıkla/dokun veya Boşluk tuşuna bas.','Tüm tuğlaları topla kır — ama topu düşürme!'] },
  nim:         { icon:'🪵',  title:'Çubuk Oyunu (Nim)',      rules:['3 sıra var (3, 5 ve 7 çubuk). Sırayla bir sıradan istediğin kadar çubuk al.','Ama hepsini bir anda sadece bir sıradan alabilirsin.','Son çubuğu almak zorunda kalan KAYBEDER.'] },
  hizcarpim:  { icon:'🚀',  title:'Hız Çarpım',             rules:['60 saniye içinde çarpım sorularını çöz.','Cevabı yazınca otomatik kontrol edilir, Enter\'a gerek yok.','Art arda doğru cevaplar seri bonusu kazandırır!'] },
  tarihefsan: { icon:'📚',  title:'Tarih mi Efsane mi?',    rules:['Türk tarihi ve kültürüne dair ifadeler gösterilir.','Doğruysa "Tarih", yanlışsa "Efsane" düğmesine bas.','Hız bonusu var — ne kadar çabuk cevaplarsan o kadar fazla puan!'] },
  kelimeav:   { icon:'🔍',  title:'Kelime Avcısı',          rules:['Ekranda 12 Türkçe harf gösterilir.','Bu harfleri kullanarak en az 3 harfli Türkçe kelimeler yaz.','Daha uzun kelime = daha fazla puan. 90 sanijen içinde topla!'] },
  emojimuz:   { icon:'🎭',  title:'Emoji Müzayedesi',       rules:['Ekranda bir emoji dizisi çıkar.','Dizinin temsil ettiği Türkçe deyim, şarkı veya filmi yaz.','Ne kadar hızlı cevaplarsan o kadar yüksek puan!'] },
  tavla:      { icon:'🎲',  title:'Tavla',                  rules:['Zar at, taşlarını kart üzerinde ilerlet.','Rakip taşı vu: tek taşı vurunca onu bara gönderirsin.','15 taşını önce evine toplayan ve sonra tahtadan çıkaran kazanır.'] },
  kelimezinciri:{ icon:'🔗',title:'Kelime Zinciri',         rules:['Verilen kelimenin son harfiyle yeni kelime yaz.','60 saniyede zinciri uzat — 10+ kelime için mükemmel puan!','Aynı kelime tekrar kullanılamaz.'] },
  deyimtamamla:{ icon:'📖', title:'Deyim Tamamla',          rules:['8 atasözü/deyim sorusu. Doğru şıkkı seç.','Hızlı cevap = bonus puan. 15+ saniye kaldıysa +3 puan.','Tüm soruları doğru yaparsan mükemmel puan alırsın!'] },
  sorugecesi:  { icon:'🧠', title:'Soru Gecesi',            rules:['2-4 oyuncu isimlerini gir, oyunu başlat.','Her oyuncu kendi sırasında "Hazırım" a basar — diğerleri bakmaz.','15 saniyede doğru şıkkı seç: 10 puan + hız bonusu.','10 soru sonunda en çok puan toplayan kazanır!'] },
};

function HelpModal({ gameId, onClose }) {
  const h = GAME_HELP[gameId];
  if (!h) return null;
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:9998,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--surface)',borderRadius:20,padding:'28px 24px',maxWidth:380,width:'100%',maxHeight:'80vh',overflowY:'auto'}}>
        <div style={{textAlign:'center',marginBottom:20}}>
          <div style={{fontSize:48,marginBottom:8}}>{h.icon}</div>
          <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:22,marginBottom:0}}>{h.title}</h2>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:12,marginBottom:24}}>
          {h.rules.map((r,i)=>(
            <div key={i} style={{display:'flex',gap:12,alignItems:'flex-start'}}>
              <div style={{width:24,height:24,borderRadius:'50%',background:'linear-gradient(135deg,#863bff,#5b21b6)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0}}>{i+1}</div>
              <p style={{margin:0,fontSize:14,lineHeight:1.6,color:'var(--text)'}}>{r}</p>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{width:'100%',padding:'13px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#863bff,#5b21b6)',color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer'}}>Anladım, Oynayalım! 🎮</button>
      </div>
    </div>
  );
}

// ============================================================
// AD OVERLAY
// ============================================================
// AdSense publisher ID buraya gelecek — adsense.google.com'dan al
const ADSENSE_CLIENT = 'ca-pub-4692358549981436';
const ADSENSE_SLOT   = '8053490650';
// Kaç oyunda bir reklam göster (1 = her oyun, 4 = her 4 oyunda bir)
const AD_INTERVAL = 4;

var HOUSE_ADS = [
  { icon: '🏆', bg: 'linear-gradient(135deg,#6366f1,#a855f7)', title: 'Skor Tablosunda Zirveye Çık!', body: 'Arkadaşlarına meydan oku, en üste çık ve rozetini kazan.' },
  { icon: '🎲', bg: 'linear-gradient(135deg,#92400E,#D97706)', title: 'Tavla Seni Bekliyor!', body: 'Klasik Türk tavlasını bota karşı oyna, ustalığını kanıtla.' },
  { icon: '🔥', bg: 'linear-gradient(135deg,#E63946,#F4845F)', title: 'Günlük Serileri Kır!', body: 'Her gün oyna, serisini koru ve bonus XP kazan.' },
  { icon: '🔗', bg: 'linear-gradient(135deg,#0F766E,#2DD4BF)', title: 'Kelime Zincirine Gir!', body: '60 saniyede ne kadar uzun zincir kurabilirsin?' },
  { icon: '📖', bg: 'linear-gradient(135deg,#7C3AED,#A78BFA)', title: 'Deyim Tamamla!', body: 'Türkçe atasözlerini ne kadar iyi biliyorsun?' },
];

function AdOverlay({ onClose }) {
  const [seconds, setSeconds] = useState(5);
  const canClose = seconds <= 0;
  const houseAd = HOUSE_ADS[Math.floor((Date.now() / 30000)) % HOUSE_ADS.length];

  useEffect(() => {
    // AdSense push — çalışırsa görünür, çalışmazsa ev reklamı gösterilir
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {}
  }, []);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div style={{
        borderRadius: 24, width: '100%', maxWidth: 340,
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)', overflow: 'hidden',
      }}>
        {/* Ev reklamı — her zaman görünür */}
        <div style={{ background: houseAd.bg, padding: '32px 24px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 12, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))' }}>{houseAd.icon}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 8, fontFamily: "'Sora',sans-serif", lineHeight: 1.2 }}>{houseAd.title}</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 1.5 }}>{houseAd.body}</div>
        </div>
        {/* AdSense slot — onaylı domainlerde buraya gerçek reklam gelir */}
        <ins
          className="adsbygoogle"
          style={{ display: 'block', height: 0, overflow: 'hidden' }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={ADSENSE_SLOT}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
        <div style={{ padding: '16px 20px 20px', background: '#fff', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 12 }}>
            {canClose ? '✅ Hazır!' : `${seconds} saniye sonra geçebilirsin`}
          </div>
          <button
            onClick={canClose ? onClose : undefined}
            style={{
              padding: '14px', borderRadius: 14, border: 'none',
              background: canClose ? 'linear-gradient(135deg,#863bff,#5b21b6)' : '#E5E7EB',
              color: canClose ? '#FFF' : '#9CA3AF', fontSize: 15, fontWeight: 800,
              cursor: canClose ? 'pointer' : 'default',
              width: '100%', fontFamily: "'Sora',sans-serif",
              transition: 'all 0.3s ease',
            }}
          >
            {canClose ? '▶ Oyuna Başla' : `⏳ ${seconds} saniye...`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PROGRESSION SYSTEM
// ============================================================
var XP_LEVELS = [
  { level: 1, min: 0,    name: 'Çaylak',    icon: '🌱', color: '#6B7280' },
  { level: 2, min: 150,  name: 'Acemi',      icon: '⚔️',  color: '#3B82F6' },
  { level: 3, min: 400,  name: 'Meraklı',    icon: '🔍', color: '#10B981' },
  { level: 4, min: 800,  name: 'Tecrübeli',  icon: '🎯', color: '#F59E0B' },
  { level: 5, min: 1500, name: 'Usta',       icon: '⭐', color: '#EF4444' },
  { level: 6, min: 2500, name: 'Uzman',      icon: '💎', color: '#8B5CF6' },
  { level: 7, min: 4000, name: 'Efsane',     icon: '👑', color: '#F97316' },
  { level: 8, min: 6000, name: 'Efsane+',    icon: '🏆', color: '#EC4899' },
];

function getLevelInfo(xp) {
  var cur = XP_LEVELS[0];
  for (var i = XP_LEVELS.length - 1; i >= 0; i--) {
    if (xp >= XP_LEVELS[i].min) { cur = XP_LEVELS[i]; break; }
  }
  var next = XP_LEVELS.find(function(l) { return l.level === cur.level + 1; }) || null;
  var progress = next ? Math.round(((xp - cur.min) / (next.min - cur.min)) * 100) : 100;
  return Object.assign({}, cur, { next: next, progress: progress });
}

function calcXpGain(result, winStreak, difficulty) {
  var base;
  if (result === 'win') { base = 30; if (winStreak >= 3) base += 10; if (winStreak >= 5) base += 10; }
  else if (result === 'loss') base = 10;
  else base = 5;
  var mult = difficulty === 'hard' ? 1.5 : difficulty === 'easy' ? 0.75 : 1;
  return Math.round(base * mult);
}

var BADGE_DEFS = [
  // ── Keşif rozetleri (ilk kez oyna) ──
  { id: 'xox_first',      tier:'bronze', name: 'İlk XOX',          icon: '✕',   check: function(s){ return (s.games.xox?.played||0)>=1; } },
  { id: 'rps_first',      tier:'bronze', name: 'İlk Taş Kağıt',    icon: '✊',  check: function(s){ return (s.games.rps?.played||0)>=1; } },
  { id: 'wordle_first',   tier:'bronze', name: 'İlk Wordle',        icon: '🔤',  check: function(s){ return (s.games.wordle?.played||0)>=1; } },
  { id: 'snake_first',    tier:'bronze', name: 'İlk Yılan',         icon: '🐍',  check: function(s){ return (s.games.snake?.played||0)>=1; } },
  { id: 'memory_first',   tier:'bronze', name: 'İlk Hafıza',        icon: '🃏',  check: function(s){ return (s.games.memory?.played||0)>=1; } },
  { id: 'sudoku_first',   tier:'bronze', name: 'İlk Sudoku',        icon: '🔲',  check: function(s){ return (s.games.sudoku?.played||0)>=1; } },
  { id: 'hizcarpim',      tier:'bronze', name: 'Hız Çarpım',        icon: '🚀',  check: function(s){ return (s.games.hizcarpim?.played||0)>=1; } },
  { id: 'tarih_first',    tier:'bronze', name: 'Tarih Meraklısı',   icon: '📚',  check: function(s){ return (s.games.tarihefsan?.played||0)>=1; } },
  { id: 'kelimeav_first', tier:'bronze', name: 'Kelime Avcısı',     icon: '🔍',  check: function(s){ return (s.games.kelimeav?.played||0)>=1; } },
  { id: 'emojimuz_first', tier:'bronze', name: 'Emoji Ustası',      icon: '🎭',  check: function(s){ return (s.games.emojimuz?.played||0)>=1; } },
  // ── Oyun sayısı (bronz→gümüş→altın→elmas) ──
  { id: 'play_10',        tier:'bronze', name: 'İlk 10',            icon: '🎮',  check: function(s){ return Object.values(s.games).reduce(function(a,g){return a+g.played;},0)>=10; } },
  { id: 'play_50',        tier:'silver', name: '50 Maç',            icon: '🕹️', check: function(s){ return Object.values(s.games).reduce(function(a,g){return a+g.played;},0)>=50; } },
  { id: 'play_200',       tier:'gold',   name: 'Çılgın Oyuncu',     icon: '💯',  check: function(s){ return Object.values(s.games).reduce(function(a,g){return a+g.played;},0)>=200; } },
  { id: 'play_500',       tier:'diamond',name: '500 Maç Efsanesi',  icon: '🏟️', check: function(s){ return Object.values(s.games).reduce(function(a,g){return a+g.played;},0)>=500; } },
  // ── Galibiyet sayısı ──
  { id: 'win_10',         tier:'bronze', name: '10 Galibiyet',      icon: '🏅',  check: function(s){ return Object.values(s.games).reduce(function(a,g){return a+g.wins;},0)>=10; } },
  { id: 'win_50',         tier:'silver', name: '50 Galibiyet',      icon: '🥈',  check: function(s){ return Object.values(s.games).reduce(function(a,g){return a+g.wins;},0)>=50; } },
  { id: 'win_150',        tier:'gold',   name: '150 Galibiyet',     icon: '🥇',  check: function(s){ return Object.values(s.games).reduce(function(a,g){return a+g.wins;},0)>=150; } },
  { id: 'win_500',        tier:'diamond',name: '500 Galibiyet',     icon: '🏆',  check: function(s){ return Object.values(s.games).reduce(function(a,g){return a+g.wins;},0)>=500; } },
  // ── Günlük seri ──
  { id: 'streak_3',       tier:'bronze', name: '3 Günlük Seri',     icon: '🔥',  check: function(s){ return (s.streak?.count||0)>=3; } },
  { id: 'streak_7',       tier:'silver', name: 'Haftalık Savaşçı',  icon: '🌟',  check: function(s){ return (s.streak?.count||0)>=7; } },
  { id: 'streak_30',      tier:'gold',   name: 'Aylık Kahraman',    icon: '👑',  check: function(s){ return (s.streak?.count||0)>=30; } },
  { id: 'streak_100',     tier:'diamond',name: '100 Günlük Titan',  icon: '🔱',  check: function(s){ return (s.streak?.count||0)>=100; } },
  // ── Art arda galibiyet serisi ──
  { id: 'winstreak_3',    tier:'bronze', name: '3 Art Arda',        icon: '⚡',  check: function(s){ return (s.bestWinStreak||0)>=3; } },
  { id: 'winstreak_5',    tier:'silver', name: '5 Art Arda',        icon: '🔥',  check: function(s){ return (s.bestWinStreak||0)>=5; } },
  { id: 'winstreak_10',   tier:'gold',   name: '10 Art Arda',       icon: '💥',  check: function(s){ return (s.bestWinStreak||0)>=10; } },
  { id: 'winstreak_20',   tier:'diamond',name: '20 Art Arda',       icon: '🌪️', check: function(s){ return (s.bestWinStreak||0)>=20; } },
  // ── Seviye rozetleri ──
  { id: 'level_3',        tier:'bronze', name: 'Meraklı Seviyesi',  icon: '🔍',  check: function(s){ return (s.level||1)>=3; } },
  { id: 'level_5',        tier:'silver', name: 'Usta Seviyesi',     icon: '⭐',  check: function(s){ return (s.level||1)>=5; } },
  { id: 'level_7',        tier:'gold',   name: 'Efsane Seviyesi',   icon: '💎',  check: function(s){ return (s.level||1)>=7; } },
  { id: 'level_8',        tier:'diamond',name: 'Tanrı Seviyesi',    icon: '🌌',  check: function(s){ return (s.level||1)>=8; } },
  // ── Çeşitlilik ──
  { id: 'variety_3',      tier:'bronze', name: '3 Farklı Oyun',     icon: '🎲',  check: function(s){ return Object.keys(s.games).filter(function(k){return s.games[k].played>0;}).length>=3; } },
  { id: 'variety_5',      tier:'silver', name: 'Çok Yönlü',         icon: '🎯',  check: function(s){ return Object.keys(s.games).filter(function(k){return s.games[k].played>0;}).length>=5; } },
  { id: 'variety_10',     tier:'gold',   name: '10 Oyun Koleksiyonu',icon: '🗂️', check: function(s){ return Object.keys(s.games).filter(function(k){return s.games[k].played>0;}).length>=10; } },
  { id: 'all_games',      tier:'diamond',name: 'Her Oyunu Dene',    icon: '🌟',  check: function(s){ return Object.keys(s.games).filter(function(k){return s.games[k].played>0;}).length>=18; } },
  // ── Oyuna özel ustalık ──
  { id: 'xox_master',     tier:'silver', name: 'XOX Ustası',        icon: '✕',   check: function(s){ return (s.games.xox?.wins||0)>=10; } },
  { id: 'xox_legend',     tier:'gold',   name: 'XOX Efsanesi',      icon: '✕',   check: function(s){ return (s.games.xox?.wins||0)>=30; } },
  { id: 'math_master',    tier:'silver', name: 'Matematik Dehası',   icon: '🧮',  check: function(s){ return (s.games.mathduel?.wins||0)>=10; } },
  { id: 'wordle_master',  tier:'silver', name: 'Wordle Üstadı',      icon: '🟩',  check: function(s){ return (s.games.wordle?.wins||0)>=10; } },
  // ── Günlük görev & özel ──
  { id: 'daily_done',     tier:'silver', name: 'Günlük Kahraman',   icon: '⚡',  check: function(s){ var ds=s.dailyStats||{}; return ds.played>=3&&ds.wins>=2; } },
  { id: 'daily_10',       tier:'gold',   name: 'Rutin Savaşçı',     icon: '📅',  check: function(s){ return (s.streak?.count||0)>=10&&Object.values(s.games).reduce(function(a,g){return a+g.played;},0)>=100; } },
  // ── Özel ──
  { id: 'welcome',        tier:'bronze', name: 'Hoş Geldin!',       icon: '🎉',  check: function(s){ return !!(s.badges&&s.badges.welcome); } },
  { id: 'season_bronze',  tier:'silver', name: 'İlk Sezon',         icon: '🏅',  check: function(s){ return (s.season?.xp||0)>=100; } },
  { id: 'season_silver',  tier:'gold',   name: 'Sezon Şampiyonu',   icon: '🥈',  check: function(s){ return (s.season?.xp||0)>=500; } },
  { id: 'season_gold',    tier:'diamond',name: 'Sezon Efsanesi',    icon: '👑',  check: function(s){ return (s.season?.xp||0)>=2000; } },
  { id: 'tavla_master',   tier:'silver', name: 'Tavla Ustası',      icon: '🎲',  check: function(s){ return (s.games?.tavla?.wins||0)>=5; } },
  { id: 'freeze_used',    tier:'bronze', name: 'Seri Koruyucu',     icon: '🛡️', check: function(s){ return (s.streakFreeze?.weekUsed) != null; } },
];

function checkNewBadges(newStats) {
  var existing = newStats.badges || {};
  return BADGE_DEFS.filter(function(b) { return !existing[b.id] && b.check(newStats); });
}

function XPBar({ xp, streakCount }) {
  var info = getLevelInfo(xp || 0);
  return (
    <div style={{ marginTop: 14, padding: '14px 18px', background: 'var(--surface-hover)', borderRadius: 14, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{info.icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Seviye {info.level} — {info.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{xp || 0} XP</div>
          </div>
        </div>
        {streakCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(251,191,36,0.15)', color: '#F59E0B', padding: '4px 12px', borderRadius: 999, fontWeight: 700, fontSize: 13 }}>
            🔥 {streakCount} gün
          </div>
        )}
      </div>
      <div style={{ height: 8, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${info.progress}%`, height: '100%', background: 'linear-gradient(90deg,#863bff,#a855f7)', borderRadius: 999, transition: 'width 0.5s ease' }} />
      </div>
      {info.next && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
          {info.next.name} için {info.next.min - (xp || 0)} XP kaldı
        </div>
      )}
    </div>
  );
}

var TIER_STYLES = {
  bronze:  { bg:'rgba(205,127,50,0.13)', border:'rgba(205,127,50,0.35)', dot:'#CD7F32', label:'Bronz' },
  silver:  { bg:'rgba(180,180,180,0.13)', border:'rgba(180,180,180,0.35)', dot:'#A8A8A8', label:'Gümüş' },
  gold:    { bg:'rgba(255,196,0,0.13)', border:'rgba(255,196,0,0.35)', dot:'#FFC400', label:'Altın' },
  diamond: { bg:'rgba(134,59,255,0.13)', border:'rgba(134,59,255,0.35)', dot:'#863bff', label:'Elmas' },
};

var TIER_ORDER = ['bronze','silver','gold','diamond'];
var TIER_LABELS = { bronze:'🥉 Bronz', silver:'🥈 Gümüş', gold:'🥇 Altın', diamond:'💎 Elmas' };

function BadgeGrid({ badges }) {
  var s1 = useState(false); var showAll = s1[0]; var setShowAll = s1[1];
  var earned = BADGE_DEFS.filter(function(b) { return badges && badges[b.id]; });
  var totalEarned = earned.length;

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Rozetler ({totalEarned}/{BADGE_DEFS.length})
        </div>
        <button onClick={function(){ setShowAll(function(p){ return !p; }); }}
          style={{ background:'none', border:'none', color:'#863bff', fontWeight:700, fontSize:12, cursor:'pointer', padding:'4px 8px' }}>
          {showAll ? '▲ Gizle' : '▼ Tümünü Gör'}
        </button>
      </div>
      {totalEarned === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, padding: '12px 0' }}>Henüz rozet kazanılmadı — oynamaya başla!</div>
      )}
      {TIER_ORDER.map(function(tier) {
        var t = TIER_STYLES[tier];
        var tierEarned = BADGE_DEFS.filter(function(b){ return b.tier===tier && badges && badges[b.id]; });
        var tierLocked = BADGE_DEFS.filter(function(b){ return b.tier===tier && (!badges || !badges[b.id]); });
        var lockedVisible = showAll ? tierLocked : tierLocked.slice(0, 4);
        if (tierEarned.length === 0 && !showAll) return null;
        return (
          <div key={tier} style={{ marginBottom: 16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <div style={{ fontWeight:800, fontSize:12, color: t.dot, textTransform:'uppercase', letterSpacing:1 }}>{TIER_LABELS[tier]}</div>
              <div style={{ flex:1, height:1, background: t.border }} />
              <div style={{ fontSize:11, color: t.dot, fontWeight:700 }}>{tierEarned.length}/{BADGE_DEFS.filter(function(b){return b.tier===tier;}).length}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {tierEarned.map(function(b) {
                return (
                  <div key={b.id} title={b.name} style={{ background: t.bg, border: '2px solid '+t.border, borderRadius: 12, padding: '10px 4px', textAlign: 'center', position:'relative' }}>
                    <div style={{ position:'absolute', top:4, right:5, width:7, height:7, borderRadius:'50%', background:t.dot }} />
                    <div style={{ fontSize: 22 }}>{b.icon}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, marginTop: 4, color: 'var(--text)', lineHeight: 1.2 }}>{b.name}</div>
                  </div>
                );
              })}
              {showAll && lockedVisible.map(function(b) {
                return (
                  <div key={b.id} title={b.name+' — kilitli'} style={{ background: 'var(--surface-hover)', border: '1px dashed var(--border)', borderRadius: 12, padding: '10px 4px', textAlign: 'center', opacity: 0.45 }}>
                    <div style={{ fontSize: 22, filter: 'grayscale(1)' }}>{b.icon}</div>
                    <div style={{ fontSize: 9, fontWeight: 600, marginTop: 4, color: 'var(--text-secondary)', lineHeight: 1.2 }}>{b.name}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ShareResultOverlay({ gameName, result, xpGain, onClose, onReplay, stats }) {
  var resultEmoji = result === 'win' ? '🏆' : result === 'loss' ? '😅' : '🤝';
  var resultText = result === 'win' ? 'kazandım' : result === 'loss' ? 'kaybettim' : 'berabere kaldım';
  var shareText = 'oyun.club\'ta ' + gameName + ' oynadım ve ' + resultText + '! ' + resultEmoji + '\n\n+' + xpGain + ' XP kazandım 🎮\n\nSen de oyna: oyun.club';

  function generateShareCard(callback) {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = 540; canvas.height = 300;
      var ctx = canvas.getContext('2d');
      // Background gradient
      var grad = ctx.createLinearGradient(0, 0, 540, 300);
      if (result === 'win') { grad.addColorStop(0, '#1a0a33'); grad.addColorStop(1, '#3d1a6e'); }
      else if (result === 'loss') { grad.addColorStop(0, '#1a0a0a'); grad.addColorStop(1, '#3d1010'); }
      else { grad.addColorStop(0, '#0a1a1a'); grad.addColorStop(1, '#0d3030'); }
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 540, 300);
      // Card shine overlay
      ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.beginPath(); ctx.ellipse(270, -30, 260, 120, 0, 0, Math.PI*2); ctx.fill();
      // Result emoji
      ctx.font = '80px serif'; ctx.textAlign = 'center'; ctx.fillText(resultEmoji, 270, 105);
      // Game name
      ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(gameName, 270, 148);
      // Result text
      ctx.font = '20px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(result === 'win' ? 'Kazandım!' : result === 'loss' ? 'Kaybettim' : 'Berabere!', 270, 178);
      // XP pill
      ctx.fillStyle = 'rgba(168,85,247,0.3)'; ctx.beginPath(); ctx.roundRect(200, 195, 140, 36, 18); ctx.fill();
      ctx.font = 'bold 17px sans-serif'; ctx.fillStyle = '#d8b4fe'; ctx.fillText('⚡ +' + xpGain + ' XP', 270, 219);
      // Streak
      var streak = (stats && stats.streak && stats.streak.count) || 0;
      if (streak > 1) {
        ctx.font = '14px sans-serif'; ctx.fillStyle = '#fbbf24';
        ctx.fillText('🔥 ' + streak + ' günlük seri', 270, 250);
      }
      // Branding
      ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillText('oyun.club', 270, 282);
      callback(canvas.toDataURL('image/png'));
    } catch(e) { callback(null); }
  }

  function doShareCard() {
    generateShareCard(function(dataUrl) {
      if (!dataUrl) { doShareText(); return; }
      if (navigator.share && navigator.canShare) {
        fetch(dataUrl).then(function(r){ return r.blob(); }).then(function(blob) {
          var file = new File([blob], 'oyun-club-sonuc.png', { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], text: shareText, url: 'https://oyun.club' }).catch(function(){ doShareText(); });
          } else { doShareText(); }
        }).catch(function(){ doShareText(); });
      } else {
        var link = document.createElement('a'); link.download = 'oyun-club-sonuc.png'; link.href = dataUrl; link.click();
      }
    });
  }

  function doShareText() {
    if (navigator.share) { navigator.share({ text: shareText, url: 'https://oyun.club' }).catch(function(){}); }
    else { window.open('https://wa.me/?text=' + encodeURIComponent(shareText), '_blank'); }
  }

  function doShareFacebook() {
    var url = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent('https://oyun.club') + '&quote=' + encodeURIComponent(shareText);
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=400');
  }

  function doShareInstagram() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText + '\n\nhttps://oyun.club').then(function() {
        alert('Metin kopyalandı! Instagram\'ı aç ve hikayene yapıştır.');
      }).catch(function() {
        alert('Instagram paylaşımı için: oyun.club adresini ziyaret edip ekran görüntüsü alabilirsin.');
      });
    } else {
      alert('Instagram paylaşımı için ekran görüntüsü alarak paylaşabilirsin!');
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 20, padding: '28px 24px', maxWidth: 320, width: '100%', textAlign: 'center', animation: 'fadeUp 0.3s ease' }} onClick={function(e){e.stopPropagation();}}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>{resultEmoji}</div>
        <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{gameName}</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 6, fontSize: 15 }}>
          {result === 'win' ? 'Kazandın!' : result === 'loss' ? 'Kaybettin' : 'Berabere!'}
        </p>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(134,59,255,0.12)', color: '#a855f7', padding: '6px 16px', borderRadius: 999, fontWeight: 700, fontSize: 14, marginBottom: 20 }}>
          ⚡ +{xpGain} XP
        </div>
        {onReplay && (
          <button onClick={onReplay} style={{ display: 'block', width: '100%', padding: 14, borderRadius: 12, background: 'linear-gradient(135deg,#863bff,#5b21b6)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 10 }}>
            🔄 Tekrar Oyna
          </button>
        )}
        <button onClick={doShareCard} style={{ display: 'block', width: '100%', padding: 12, borderRadius: 12, background: '#25D366', color: '#fff', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 8 }}>
          🖼️ Kart Paylaş
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
          <button onClick={doShareText} style={{ padding: '10px 4px', borderRadius: 12, background: 'rgba(37,211,102,0.15)', color: '#25D366', border: '1px solid rgba(37,211,102,0.3)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            WhatsApp
          </button>
          <button onClick={doShareFacebook} style={{ padding: '10px 4px', borderRadius: 12, background: 'rgba(24,119,242,0.12)', color: '#1877F2', border: '1px solid rgba(24,119,242,0.3)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            Facebook
          </button>
          <button onClick={doShareInstagram} style={{ padding: '10px 4px', borderRadius: 12, background: 'rgba(225,48,108,0.1)', color: '#E1306C', border: '1px solid rgba(225,48,108,0.3)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            Instagram
          </button>
        </div>
        <button onClick={onClose} style={{ display: 'block', width: '100%', padding: 12, borderRadius: 12, background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          Devam Et
        </button>
      </div>
    </div>
  );
}

// ============================================================
// KELIME ZİNCİRİ GAME
// ============================================================
var TR_WORD_SET = new Set(TR_WORDS);

function KelimeZinciriGame({ game, onGameEnd, soundOn }) {
  var s0 = useState(null); var phase = s0[0]; var setPhase = s0[1]; // null | 'playing' | 'over'
  var s1 = useState([]); var chain = s1[0]; var setChain = s1[1];
  var s2 = useState(''); var input = s2[0]; var setInput = s2[1];
  var s3 = useState(60); var timeLeft = s3[0]; var setTimeLeft = s3[1];
  var s4 = useState(''); var error = s4[0]; var setError = s4[1];
  var s5 = useState(false); var ended = s5[0]; var setEnded = s5[1];
  var timerRef = React.useRef(null);

  var startWord = 'araba';
  var lastLetter = chain.length > 0 ? chain[chain.length-1].slice(-1).toLowerCase() : startWord.slice(-1);

  React.useEffect(function() {
    if (phase !== 'playing') return;
    timerRef.current = setInterval(function() {
      setTimeLeft(function(t) {
        if (t <= 1) {
          clearInterval(timerRef.current);
          if (!ended) { setEnded(true); setPhase('over'); }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return function() { clearInterval(timerRef.current); };
  }, [phase]);

  function submit(e) {
    e.preventDefault();
    var word = input.trim().toLowerCase();
    if (!word) return;
    if (chain.includes(word)) { setError('Bu kelime zaten kullanıldı!'); playHaptic('wrong'); return; }
    if (word[0] !== lastLetter) { setError('Kelime "' + lastLetter.toUpperCase() + '" harfiyle başlamalı!'); playHaptic('wrong'); return; }
    if (!TR_WORD_SET.has(word) && word.length < 3) { setError('Geçerli bir Türkçe kelime giriniz.'); playHaptic('wrong'); return; }
    playHaptic('correct');
    if (soundOn) playSound('correct');
    setChain(function(c) { return [...c, word]; });
    setInput('');
    setError('');
  }

  function handleEnd() {
    clearInterval(timerRef.current);
    var score = chain.length;
    var result = score >= 10 ? 'win' : score >= 5 ? 'draw' : 'loss';
    onGameEnd(result);
  }

  if (!phase) return (
    <div style={{maxWidth:380,margin:'0 auto',padding:'32px 16px',textAlign:'center'}}>
      <div style={{fontSize:56,marginBottom:12}}>🔗</div>
      <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:26,marginBottom:8}}>Kelime Zinciri</h2>
      <p style={{color:'var(--text-secondary)',marginBottom:12}}>Son harften yeni kelime üret. 60 saniyede ne kadar uzatabilirsin?</p>
      <p style={{color:'var(--text-secondary)',fontSize:13,marginBottom:28}}>Başlangıç: <strong>"{startWord}"</strong> → "{startWord.slice(-1).toUpperCase()}" harfinden başla</p>
      <button onClick={function(){setPhase('playing');}} style={{padding:'16px 48px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#0F766E,#2DD4BF)',color:'#FFF',fontSize:17,fontWeight:700,cursor:'pointer'}}>
        Başla
      </button>
    </div>
  );

  if (phase === 'over') return (
    <div style={{maxWidth:380,margin:'0 auto',padding:'32px 16px',textAlign:'center'}}>
      <div style={{fontSize:56,marginBottom:8}}>{chain.length>=10?'🏆':chain.length>=5?'👍':'😅'}</div>
      <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:24,marginBottom:8}}>Süre Doldu!</h2>
      <p style={{color:'var(--text-secondary)',marginBottom:4}}>Zincir uzunluğu: <strong style={{color:'#0F766E'}}>{chain.length}</strong></p>
      <p style={{color:'var(--text-secondary)',fontSize:13,marginBottom:20}}>{chain.join(' → ') || startWord}</p>
      <button onClick={handleEnd} style={{padding:'14px 40px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#0F766E,#2DD4BF)',color:'#FFF',fontSize:16,fontWeight:700,cursor:'pointer'}}>
        Devam Et
      </button>
    </div>
  );

  return (
    <div style={{maxWidth:420,margin:'0 auto',padding:'24px 16px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:15}}>🔗 Zincir: <span style={{color:'#0F766E'}}>{chain.length}</span></div>
        <div style={{padding:'6px 16px',borderRadius:999,background:timeLeft<=10?'rgba(230,57,70,0.15)':'rgba(15,118,110,0.12)',color:timeLeft<=10?'#E63946':'#0F766E',fontWeight:700,fontSize:14}}>
          ⏱ {timeLeft}s
        </div>
      </div>
      <div style={{padding:'10px 14px',background:'var(--surface-hover)',borderRadius:12,marginBottom:12,fontSize:13,minHeight:44,color:'var(--text-secondary)',wordBreak:'break-all'}}>
        {chain.length>0 ? chain.slice(-5).join(' → ') : 'Başlangıç: '+startWord}
      </div>
      <div style={{marginBottom:8,fontWeight:600,fontSize:14,color:'var(--text-secondary)'}}>
        Sıradaki harf: <span style={{color:'#0F766E',fontWeight:800,fontSize:18}}>{lastLetter.toUpperCase()}</span>
      </div>
      <form onSubmit={submit} style={{display:'flex',gap:8}}>
        <input value={input} onChange={function(e){setInput(e.target.value);setError('');}} placeholder={''+lastLetter.toUpperCase()+'... ile başlayan kelime'} autoFocus
          style={{flex:1,padding:'12px 16px',borderRadius:12,border:'2px solid '+(error?'#E63946':'var(--border)'),background:'var(--surface)',color:'var(--text)',fontSize:16,outline:'none'}} />
        <button type="submit" style={{padding:'12px 20px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#0F766E,#2DD4BF)',color:'#FFF',fontWeight:700,fontSize:16,cursor:'pointer'}}>
          ✓
        </button>
      </form>
      {error && <div style={{color:'#E63946',fontSize:13,marginTop:6}}>{error}</div>}
    </div>
  );
}

// ============================================================
// DEYİM TAMAMLA GAME
// ============================================================
var DEYIMLER = [
  { q: '"Damlaya damlaya ___"', opts: ['göl olur', 'taş biter', 'dağ aşar', 'nehir olur'], a: 1, tip: 'Küçük çabalar birikerek büyük şeyler yaratır.' },
  { q: '"Ağaç yaşken ___"', opts: ['kurur', 'eğilir', 'büyür', 'düzelir'], a: 1, tip: 'Karakter gençken şekillenir.' },
  { q: '"Boş durma, eline ___"', opts: ['bak', 'iş al', 'kalem al', 'taş al'], a: 1, tip: 'Her zaman meşgul ol.' },
  { q: '"Dost kara günde ___"', opts: ['kaçar', 'belli olur', 'gelir', 'ağlar'], a: 1, tip: 'Gerçek dostluk zor zamanda görülür.' },
  { q: '"Komşu komşunun ___"', opts: ['düşmanıdır', 'kapıcısıdır', 'gözünü oyar', 'evine bakar'], a: 2, tip: 'Kıskançlık komşular arasında yaygındır.' },
  { q: '"Ne ekersen ___"', opts: ['biçersin', 'taşırsın', 'içersin', 'görürsün'], a: 0, tip: 'Yaptıklarının karşılığını görürsün.' },
  { q: '"Sakla samanı, gelir ___"', opts: ['yaz günü', 'zamanı', 'gün olur', 'ihtiyacın'], a: 2, tip: 'İlerisi için biriktir.' },
  { q: '"Bugünün işini yarına ___"', opts: ['sakla', 'bırakma', 'taşıma', 'gönder'], a: 1, tip: 'Erteleme.' },
  { q: '"Bir elde ne var? ___"', opts: ['Az şey', 'İki elde var', 'Hiçbir şey', 'Güç var'], a: 2, tip: 'Birlik kuvvet getirir.' },
  { q: '"Mum dibine ___"', opts: ['aydınlatır', 'yanar', 'ışık tutar', 'karanlık düşer'], a: 3, tip: 'En yakınlar zaman zaman körleşir.' },
  { q: '"Akıl yaşta değil ___"', opts: ['başta', 'kasta', 'taşta', 'hısta'], a: 0, tip: 'Akıl kişinin deneyimiyle gelir, yaşla değil.' },
  { q: '"El eli yıkar, el de ___"', opts: ['kaşır', 'yıkar', 'yüzü yıkar', 'siler'], a: 2, tip: 'Yardımlaşmak herkese faydalıdır.' },
  { q: '"İt ürür, kervan ___"', opts: ['geçer', 'durur', 'bozulur', 'gider'], a: 0, tip: 'Engeller kararlı ilerlemeyi durduramaz.' },
  { q: '"Taşıma su ile değirmen ___"', opts: ['döner', 'durur', 'çalışır', 'çalışmaz'], a: 1, tip: 'Sürdürülemez çabalar sonunda biter.' },
  { q: '"Üzüm üzüme baka baka ___"', opts: ['büyür', 'kararır', 'bozulur', 'olgunlaşır'], a: 1, tip: 'Kötü arkadaş kötü etkiler.' },
  { q: '"Adam ol, adam ___"', opts: ['döver', 'giydirmez', 'iste', 'seçer'], a: 2, tip: 'İnsan şerefli olmaya çalışmalıdır.' },
  { q: '"Baş eğmek ___"', opts: ['güç verir', 'boyun vermek', 'zayıflık değil', 'hiçtir'], a: 1, tip: 'Boyun eğmek, teslim olmak demektir.' },
  { q: '"Körle yatan ___"', opts: ['kör olur', 'şaşı kalkar', 'iyi görür', 'görmez olur'], a: 1, tip: 'Kötü kişilerle vakit geçirmek zarar verir.' },
  { q: '"Ağlayan çocuğa ___"', opts: ['şeker verme', 'bakma', 'emzirme', 'iş ver'], a: 0, tip: 'Ağlayana boyun eğme.' },
  { q: '"Eline ___"', opts: ['sağlık', 'güç', 'iş', 'para'], a: 0, tip: 'Teşekkür ifadesi.' },
  { q: '"Bir musibet bin ___"', opts: ['sevinçten yeğdir', 'şükrü gerektirir', 'nasihatten yeğdir', 'mutluluktan iyidir'], a: 2, tip: 'Bir felaketten ders almak bin öğütten daha etkilidir.' },
  { q: '"Aşk olsun ___"', opts: ['sana', 'bana', 'hepimize', 'sana ve bana'], a: 0, tip: 'Utanma ifadesi.' },
  { q: '"Yalancının mumu ___"', opts: ['söner', 'yanar', 'yatsıya kadar yanar', 'hep yanar'], a: 2, tip: 'Yalancılık geçici olarak işe yarayabilir ama kalıcı değildir.' },
  { q: '"Öğrenmek ___"', opts: ['güçtür', 'öğretmekle olur', 'istekle olur', 'chinayla olur'], a: 1, tip: 'Bir şeyi öğrenmenin en iyi yolu onu başkasına öğretmektir.' },
  { q: '"Kaza geliyorum demez, ___"', opts: ['ansızın gelir', 'haber vermez', 'hazır ol', 'bekle beni'], a: 1, tip: 'Felaket önceden uyarmaz.' },
  { q: '"Her şeyin fazlası ___"', opts: ['iyidir', 'zarar verir', 'güzeldir', 'az olmaktan iyidir'], a: 1, tip: 'Aşırılık her zaman zararlıdır.' },
  { q: '"Tatlı dil yılanı ___"', opts: ['kaçırır', 'yutar', 'deliğinden çıkarır', 'öldürür'], a: 2, tip: 'Nazik konuşmak en zorlu insanları bile ikna edebilir.' },
  { q: '"Çok konuşan ___"', opts: ['akıllıdır', 'çok yanılır', 'çok bilir', 'az dinler'], a: 1, tip: 'Fazla konuşmak hata yapmaya yol açar.' },
  { q: '"Borçlu borcunu ___"', opts: ['öder', 'unutmaz', 'inkâr eder', 'geç öder'], a: 1, tip: 'Borcu olan kişi bunu daima aklında tutar.' },
  { q: '"Saman altından su ___"', opts: ['geçer', 'akar', 'sızar', 'yürütmek'], a: 3, tip: 'Gizlice, sinsi bir şekilde hareket etmek.' },
  { q: '"Can boğazdan ___"', opts: ['gelir', 'çıkar', 'geçer', 'akar'], a: 0, tip: 'Yaşamak için yemek şarttır.' },
  { q: '"Yorgan gitti, kavga ___"', opts: ['bitti', 'başladı', 'sürdü', 'çıktı'], a: 0, tip: 'Anlaşmazlığın sebebi ortadan kalkınca kavga da biter.' },
  { q: '"Gönül ne kahve ister ne ___"', opts: ['çay', 'su', 'kahvehane', 'çerez'], a: 2, tip: 'Kişi asıl muhabbet ve ilgi ister.' },
  { q: '"Bal tutan ___"', opts: ['parmağını yalar', 'elini yalar', 'tatlanır', 'arı sokar'], a: 0, tip: 'İyi bir işte çalışan onun meyvelerini de tadar.' },
];

function DeyimTamamlaGame({ game, onGameEnd, soundOn }) {
  var qs = DEYIMLER.slice().sort(function(){ return Math.random()-0.5; }).slice(0,8);
  var s0 = useState(null); var phase = s0[0]; var setPhase = s0[1];
  var s1 = useState(0); var qi = s1[0]; var setQi = s1[1];
  var s2 = useState(0); var score = s2[0]; var setScore = s2[1];
  var s3 = useState(null); var chosen = s3[0]; var setChosen = s3[1];
  var s4 = useState(null); var questions = s4[0]; var setQuestions = s4[1];
  var s5 = useState(20); var timer = s5[0]; var setTimer = s5[1];
  var timerRef = React.useRef(null);

  React.useEffect(function() {
    if (phase !== 'playing') return;
    timerRef.current = setInterval(function() {
      setTimer(function(t) {
        if (t <= 1) {
          clearInterval(timerRef.current);
          // Time's up for this question — move on
          setChosen(-1);
          setTimeout(function() {
            setChosen(null); setTimer(20);
            setQi(function(q) { return q + 1; });
          }, 1000);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return function() { clearInterval(timerRef.current); };
  }, [phase, qi]);

  function startGame() {
    setQuestions(qs); setPhase('playing'); setQi(0); setScore(0); setChosen(null); setTimer(20);
  }

  function pickAnswer(idx) {
    if (chosen !== null) return;
    clearInterval(timerRef.current);
    setChosen(idx);
    var correct = questions[qi].a === idx;
    var bonus = timer >= 15 ? 3 : timer >= 8 ? 2 : 1;
    if (correct) {
      playHaptic('correct');
      if (soundOn) playSound('correct');
      setScore(function(s) { return s + bonus; });
    } else {
      playHaptic('wrong');
    }
    setTimeout(function() {
      setChosen(null); setTimer(20);
      if (qi + 1 >= questions.length) {
        setPhase('over');
      } else {
        setQi(function(q) { return q + 1; });
      }
    }, 1200);
  }

  function handleEnd() {
    var result = score >= (questions ? questions.length * 2 : 10) ? 'win' : score >= (questions ? questions.length : 5) ? 'draw' : 'loss';
    onGameEnd(result);
  }

  if (!phase) return (
    <div style={{maxWidth:380,margin:'0 auto',padding:'32px 16px',textAlign:'center'}}>
      <div style={{fontSize:56,marginBottom:12}}>📖</div>
      <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:26,marginBottom:8}}>Deyim Tamamla</h2>
      <p style={{color:'var(--text-secondary)',marginBottom:28}}>8 Türkçe atasözü ve deyim sorusu. Hızlı cevapla bonus puan kazan!</p>
      <button onClick={startGame} style={{padding:'16px 48px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#7C3AED,#A78BFA)',color:'#FFF',fontSize:17,fontWeight:700,cursor:'pointer'}}>
        Başla
      </button>
    </div>
  );

  if (phase === 'over') return (
    <div style={{maxWidth:380,margin:'0 auto',padding:'32px 16px',textAlign:'center'}}>
      <div style={{fontSize:56,marginBottom:8}}>{score>=14?'🏆':score>=8?'👍':'😅'}</div>
      <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:24,marginBottom:8}}>Tamamlandı!</h2>
      <p style={{color:'var(--text-secondary)',marginBottom:4}}>Puan: <strong style={{color:'#7C3AED',fontSize:24}}>{score}</strong></p>
      <p style={{color:'var(--text-secondary)',fontSize:13,marginBottom:24}}>{score>=14?'Mükemmel! Atasözlerine hakimsin.':score>=8?'İyi! Biraz daha pratik yapabilirsin.':'Dene dene öğrenilir!'}</p>
      <button onClick={handleEnd} style={{padding:'14px 40px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#7C3AED,#A78BFA)',color:'#FFF',fontSize:16,fontWeight:700,cursor:'pointer'}}>
        Devam Et
      </button>
    </div>
  );

  if (!questions) return null;
  var q = questions[qi];
  return (
    <div style={{maxWidth:420,margin:'0 auto',padding:'24px 16px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:14,color:'var(--text-secondary)'}}>Soru {qi+1}/{questions.length}</div>
        <div style={{padding:'4px 14px',borderRadius:999,background:timer<=5?'rgba(230,57,70,0.15)':'rgba(124,58,237,0.12)',color:timer<=5?'#E63946':'#7C3AED',fontWeight:700,fontSize:14}}>⏱ {timer}s</div>
        <div style={{fontWeight:700,fontSize:14}}>🏆 {score}</div>
      </div>
      <div style={{background:'var(--surface-hover)',borderRadius:16,padding:'20px',marginBottom:20,textAlign:'center'}}>
        <p style={{fontSize:17,fontWeight:600,lineHeight:1.5}}>{q.q}</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {q.opts.map(function(opt,i) {
          var bg = 'var(--surface)';
          var border = 'var(--border)';
          var color = 'var(--text)';
          if (chosen !== null) {
            if (i === q.a) { bg='rgba(52,211,153,0.15)'; border='#34d399'; color='#10b981'; }
            else if (i === chosen && chosen !== q.a) { bg='rgba(230,57,70,0.1)'; border='#E63946'; color='#E63946'; }
          }
          return (
            <button key={i} onClick={function(){pickAnswer(i);}}
              style={{padding:'14px 10px',borderRadius:14,border:'2px solid '+border,background:bg,color:color,fontWeight:600,fontSize:14,cursor:chosen!==null?'default':'pointer',transition:'all 0.2s'}}>
              {opt}
            </button>
          );
        })}
      </div>
      {chosen !== null && (
        <div style={{marginTop:14,padding:'10px 14px',background:'rgba(124,58,237,0.08)',borderRadius:12,fontSize:13,color:'var(--text-secondary)',textAlign:'center'}}>
          💡 {q.tip}
        </div>
      )}
    </div>
  );
}

// ============================================================
// TAVLA GAME
// ============================================================
function TavlaGame({ game, onGameEnd, soundOn }) {
  var s_mode = useState(null); var gameMode = s_mode[0]; var setGameMode = s_mode[1];
  // Simplified Tavla: 24 points, 2 players. White=1 moves 23→0, Black=-1 moves 0→23
  var INITIAL = (function() {
    var b = Array(24).fill(null).map(function(){ return {count:0,color:0}; });
    // Standard backgammon starting position
    b[0]  = {count:2,  color: 1};
    b[5]  = {count:5,  color:-1};
    b[7]  = {count:3,  color:-1};
    b[11] = {count:5,  color: 1};
    b[12] = {count:5,  color:-1};
    b[16] = {count:3,  color: 1};
    b[18] = {count:5,  color: 1};
    b[23] = {count:2,  color:-1};
    return b;
  })();

  var s0 = useState(null); var phase = s0[0]; var setPhase = s0[1];
  var s1 = useState(JSON.parse(JSON.stringify(INITIAL))); var board = s1[0]; var setBoard = s1[1];
  var s2 = useState(null); var dice = s2[0]; var setDice = s2[1];
  var s3 = useState(null); var selected = s3[0]; var setSelected = s3[1];
  var s4 = useState({ white:0, black:0 }); var bar = s4[0]; var setBar = s4[1];
  var s5 = useState({ white:0, black:0 }); var borne = s5[0]; var setBorne = s5[1];
  var s6 = useState(null); var winner = s6[0]; var setWinner = s6[1];
  var s7 = useState([]); var moves = s7[0]; var setMoves = s7[1];
  var s8 = useState(false); var botThinking = s8[0]; var setBotThinking = s8[1];

  function rollDice() { return [Math.ceil(Math.random()*6), Math.ceil(Math.random()*6)]; }

  function startGame(mode) {
    setGameMode(mode);
    var d = rollDice();
    setPhase('white'); // White goes first
    setDice(d);
    setMoves(d[0]===d[1] ? [d[0],d[0],d[0],d[0]] : [...d]);
    setBoard(JSON.parse(JSON.stringify(INITIAL)));
    setBar({white:0,black:0});
    setBorne({white:0,black:0});
    setSelected(null);
    setWinner(null);
  }

  function getLegalMoves(fromPoint, currentPhase, currentDice, currentBoard, currentBar) {
    var color = currentPhase === 'white' ? 1 : -1;
    var dir = color; // white moves toward lower index (dir -1), black toward higher (+1)
    var legal = [];
    var remainingDice = [...new Set(currentDice)];
    remainingDice.forEach(function(d) {
      var to = fromPoint + (color === 1 ? -d : d);
      if (to >= 0 && to <= 23) {
        var pt = currentBoard[to];
        if (pt.count === 0 || pt.color === color || pt.count === 1) {
          legal.push({die:d, to:to});
        }
      } else if ((color === 1 && to < 0) || (color === -1 && to > 23)) {
        // bearing off — simplified: allow if all pieces in home
        legal.push({die:d, to: color===1 ? -1 : 24});
      }
    });
    return legal;
  }

  function applyMove(from, to, currentPhase, currentBoard, currentBar, currentBorne, currentDice) {
    var color = currentPhase === 'white' ? 1 : -1;
    var nb = currentBoard.map(function(p){ return {count:p.count, color:p.color}; });
    var nBar = {...currentBar};
    var nBorne = {...currentBorne};
    var dieUsed = Math.abs(to - from);
    if (to === -1 || to === 24) dieUsed = Math.max(...currentDice);

    // Remove from source
    if (from >= 0 && from <= 23) {
      nb[from].count--;
      if (nb[from].count === 0) nb[from].color = 0;
    } else {
      // from bar
      if (color===1) nBar.white = Math.max(0, nBar.white-1);
      else nBar.black = Math.max(0, nBar.black-1);
    }

    // Apply to destination
    if (to >= 0 && to <= 23) {
      if (nb[to].count === 1 && nb[to].color !== color) {
        // Hit — send to bar
        if (nb[to].color === 1) nBar.white++;
        else nBar.black++;
        nb[to] = {count:1, color:color};
      } else {
        nb[to].count++;
        nb[to].color = color;
      }
    } else {
      // Borne off
      if (color === 1) nBorne.white++;
      else nBorne.black++;
    }

    // Remove used die
    var newDice = [...currentDice];
    var idx = newDice.indexOf(dieUsed);
    if (idx === -1) idx = newDice.indexOf(Math.max(...currentDice));
    if (idx !== -1) newDice.splice(idx, 1);

    return {board: nb, bar: nBar, borne: nBorne, dice: newDice};
  }

  function checkWin(currentBorne) {
    if (currentBorne.white >= 15) return 'white';
    if (currentBorne.black >= 15) return 'black';
    return null;
  }

  function endTurn(newDice, nextPhase, newBoard, newBar, newBorne) {
    var w = checkWin(newBorne);
    if (w) {
      setWinner(w);
      onGameEnd(w === 'white' ? 'win' : 'loss');
      return;
    }
    if (newDice.length === 0) {
      var d = rollDice();
      var nm = d[0]===d[1] ? [d[0],d[0],d[0],d[0]] : [...d];
      setDice(d); setMoves(nm); setPhase(nextPhase);
      // Bot move
      if (nextPhase === 'black') {
        setBotThinking(true);
        setTimeout(function() {
          doBotMove(newBoard, newBar, newBorne, nm);
        }, 700);
      }
    } else {
      setMoves(newDice);
      setPhase(newPhase => newPhase); // keep same phase
    }
  }

  function doBotMove(brd, br, bn, remainDice) {
    var color = -1; // black
    var myDice = [...remainDice];
    var myBoard = brd.map(function(p){ return {count:p.count,color:p.color}; });
    var myBar = {...br};
    var myBorne = {...bn};

    while (myDice.length > 0) {
      var moved = false;
      // Try from bar first
      if (myBar.black > 0) {
        var from = 24; // bar notation
        for (var di = 0; di < myDice.length; di++) {
          var to = myDice[di] - 1; // 0-indexed entry
          var pt = myBoard[to];
          if (pt.count === 0 || pt.color === color || pt.count === 1) {
            var res = applyMove(from, to, 'black', myBoard, myBar, myBorne, myDice);
            myBoard = res.board; myBar = res.bar; myBorne = res.borne; myDice = res.dice;
            moved = true; break;
          }
        }
        if (!moved) break;
        continue;
      }
      // Find all legal moves
      var allMoves = [];
      for (var i = 0; i < 24; i++) {
        if (myBoard[i].color !== color || myBoard[i].count === 0) continue;
        var legal = getLegalMoves(i, 'black', myDice, myBoard, myBar);
        legal.forEach(function(m){ allMoves.push({from:i, to:m.to, die:m.die}); });
      }
      if (allMoves.length === 0) break;
      // Pick highest-value move (prefer hitting, prefer advancing)
      var pick = allMoves[Math.floor(Math.random() * allMoves.length)];
      var r = applyMove(pick.from, pick.to, 'black', myBoard, myBar, myBorne, myDice);
      myBoard = r.board; myBar = r.bar; myBorne = r.borne; myDice = r.dice;
      moved = true;
    }

    setBoard(myBoard); setBar(myBar); setBorne(myBorne);
    var w = checkWin(myBorne);
    if (w) {
      setWinner(w); onGameEnd(w==='white'?'win':'loss');
      setBotThinking(false); return;
    }
    var d2 = rollDice();
    var nm2 = d2[0]===d2[1] ? [d2[0],d2[0],d2[0],d2[0]] : [...d2];
    setDice(d2); setMoves(nm2); setPhase('white');
    setBotThinking(false);
  }

  function handlePointClick(idx) {
    var isMyTurn = phase === 'white' || (phase === 'black' && gameMode === 'local');
    if (!isMyTurn || botThinking || winner) return;
    var color = phase === 'white' ? 1 : -1;
    var barCount = phase === 'white' ? bar.white : bar.black;
    var barIdx = phase === 'white' ? 24 : -1;
    if (selected === null) {
      if (barCount > 0) {
        var legal = getLegalMoves(barIdx, phase, moves, board, bar);
        if (legal.length === 0) return;
        setSelected(barIdx);
        return;
      }
      if (board[idx] && board[idx].color === color && board[idx].count > 0) {
        setSelected(idx);
      }
    } else {
      var fromIdx = selected;
      var legal2 = getLegalMoves(fromIdx, phase, moves, board, bar);
      var move = legal2.find(function(m){ return m.to === idx; });
      if (move) {
        playHaptic('tap');
        if (soundOn) playSound('place');
        var res = applyMove(fromIdx, idx, phase, board, bar, borne, moves);
        setBoard(res.board); setBar(res.bar); setBorne(res.borne);
        setSelected(null);
        if (res.dice.length === 0) {
          var w = checkWin(res.borne);
          if (w) { setWinner(w); onGameEnd(w==='white'?'win':'loss'); return; }
          var nextPhase = phase === 'white' ? 'black' : 'white';
          var d3 = rollDice();
          var nm3 = d3[0]===d3[1]?[d3[0],d3[0],d3[0],d3[0]]:[...d3];
          setDice(d3); setMoves(nm3); setPhase(nextPhase);
          if (nextPhase === 'black' && gameMode === 'bot') {
            setBotThinking(true);
            setTimeout(function() { doBotMove(res.board, res.bar, res.borne, nm3); }, 700);
          }
        } else {
          setMoves(res.dice);
        }
      } else {
        if (board[idx] && board[idx].color === color) setSelected(idx);
        else setSelected(null);
      }
    }
  }

  function handleBearOff() {
    var isMyTurn = phase === 'white' || (phase === 'black' && gameMode === 'local');
    if (!isMyTurn || botThinking || winner || moves.length === 0) return;
    var bearTo = phase === 'white' ? -1 : 24;
    var legal3 = getLegalMoves(selected !== null ? selected : -99, phase, moves, board, bar);
    var bearMove = legal3.find(function(m){ return m.to === bearTo; });
    if (bearMove) {
      var res2 = applyMove(selected, bearTo, phase, board, bar, borne, moves);
      setBoard(res2.board); setBar(res2.bar); setBorne(res2.borne); setSelected(null);
      if (res2.dice.length === 0) {
        var w2 = checkWin(res2.borne);
        if (w2) { setWinner(w2); onGameEnd(w2==='white'?'win':'loss'); return; }
        var nextPhase2 = phase === 'white' ? 'black' : 'white';
        var d4 = rollDice();
        var nm4 = d4[0]===d4[1]?[d4[0],d4[0],d4[0],d4[0]]:[...d4];
        setDice(d4); setMoves(nm4); setPhase(nextPhase2);
        if (nextPhase2 === 'black' && gameMode === 'bot') {
          setBotThinking(true);
          setTimeout(function() { doBotMove(res2.board, res2.bar, res2.borne, nm4); }, 700);
        }
      } else {
        setMoves(res2.dice);
      }
    }
  }

  var POINT_SIZE = 28;

  if (!phase) return (
    <div style={{maxWidth:420,margin:'0 auto',padding:'40px 20px',textAlign:'center'}}>
      <div style={{fontSize:72,marginBottom:8}}>🎲</div>
      <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:900,fontSize:28,marginBottom:6}}>Tavla</h2>
      <p style={{color:'var(--text-secondary)',fontSize:14,marginBottom:32}}>Klasik Türk tavlası — hem bot hem 2 kişilik</p>
      <div style={{display:'flex',flexDirection:'column',gap:14,marginBottom:24}}>
        <button onClick={function(){startGame('bot');}} style={{padding:'20px 24px',borderRadius:18,border:'2px solid rgba(146,64,14,0.3)',background:'linear-gradient(135deg,#92400E,#D97706)',color:'#fff',fontSize:16,fontWeight:800,cursor:'pointer',fontFamily:"'Sora',sans-serif",display:'flex',alignItems:'center',justifyContent:'center',gap:12}}>
          <span style={{fontSize:28}}>🤖</span>
          <div style={{textAlign:'left'}}>
            <div>Bot ile Oyna</div>
            <div style={{fontSize:12,fontWeight:400,opacity:0.85}}>Yapay zekaya karşı tek başına oyna</div>
          </div>
        </button>
        <button onClick={function(){startGame('local');}} style={{padding:'20px 24px',borderRadius:18,border:'2px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:16,fontWeight:800,cursor:'pointer',fontFamily:"'Sora',sans-serif",display:'flex',alignItems:'center',justifyContent:'center',gap:12}}>
          <span style={{fontSize:28}}>👥</span>
          <div style={{textAlign:'left'}}>
            <div>2 Kişi Oyna</div>
            <div style={{fontSize:12,fontWeight:400,color:'var(--text-secondary)'}}>Aynı cihazda arkadaşınla oyna</div>
          </div>
        </button>
      </div>
      <p style={{color:'var(--text-secondary)',fontSize:12}}>⬜ Beyaz üstten alta, ⬛ Siyah alttan yukarı gider</p>
    </div>
  );

  return (
    <div style={{maxWidth:440,margin:'0 auto',padding:'16px',overflowX:'auto'}}>
      {/* Status */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <div style={{fontWeight:700,fontSize:13}}>
          {winner ? (winner==='white' ? (gameMode==='bot'?'🏆 Sen kazandın!':'🏆 Beyaz kazandı!') : (gameMode==='bot'?'😅 Bot kazandı!':'🏆 Siyah kazandı!')) :
           botThinking ? '🤖 Bot düşünüyor...' :
           phase==='white' ? (gameMode==='local'?'⬜ Beyaz\'ın sırası':'⬜ Senin hamlen') : (gameMode==='local'?'⬛ Siyah\'ın sırası':'⬛ Bot hamle yapıyor')}
        </div>
        <div style={{display:'flex',gap:6}}>
          {moves.map(function(d,i){return(
            <div key={i} style={{width:28,height:28,borderRadius:6,background:'var(--surface-hover)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:14}}>{d}</div>
          );})}
        </div>
      </div>
      {/* Board */}
      <div style={{background:'#2D5A27',borderRadius:12,padding:'10px 8px',userSelect:'none'}}>
        {/* Top: points 12–23 (left to right) */}
        <div style={{display:'flex',gap:2,justifyContent:'center',marginBottom:4}}>
          {Array.from({length:12},function(_,i){return i+12;}).map(function(idx){
            var pt = board[idx];
            var isLegal = selected !== null && getLegalMoves(selected,phase,moves,board,bar).some(function(m){return m.to===idx;});
            return (
              <div key={idx} onClick={function(){handlePointClick(idx);}}
                style={{width:POINT_SIZE,minHeight:80,borderRadius:4,cursor:'pointer',background:isLegal?'rgba(255,255,0,0.2)':idx%2===0?'#8B4513':'#DEB887',display:'flex',flexDirection:'column',alignItems:'center',paddingTop:4,gap:2,position:'relative'}}>
                {Array.from({length:Math.min(pt.count,5)}).map(function(_,j){
                  return <div key={j} style={{width:22,height:22,borderRadius:'50%',background:pt.color===1?'#fff':'#111',border:'1px solid rgba(255,255,255,0.3)',flexShrink:0}} />;
                })}
                {pt.count>5 && <div style={{fontSize:9,color:'#fff',fontWeight:700}}>+{pt.count-5}</div>}
                <div style={{position:'absolute',bottom:2,fontSize:8,color:'rgba(255,255,255,0.5)'}}>{idx}</div>
              </div>
            );
          })}
        </div>
        {/* Bar */}
        <div style={{display:'flex',justifyContent:'center',gap:16,margin:'4px 0',padding:'4px',background:'rgba(0,0,0,0.3)',borderRadius:8}}>
          <div>⬜ Bar: {bar.white}</div>
          <div>⬛ Bar: {bar.black}</div>
        </div>
        {/* Bottom: points 11–0 (left to right displayed as 11,10,...0) */}
        <div style={{display:'flex',gap:2,justifyContent:'center',marginTop:4}}>
          {Array.from({length:12},function(_,i){return 11-i;}).map(function(idx){
            var pt = board[idx];
            var isLegal = selected !== null && getLegalMoves(selected,phase,moves,board,bar).some(function(m){return m.to===idx;});
            return (
              <div key={idx} onClick={function(){handlePointClick(idx);}}
                style={{width:POINT_SIZE,minHeight:80,borderRadius:4,cursor:'pointer',background:isLegal?'rgba(255,255,0,0.2)':idx%2===0?'#8B4513':'#DEB887',display:'flex',flexDirection:'column-reverse',alignItems:'center',paddingBottom:4,gap:2,position:'relative'}}>
                {Array.from({length:Math.min(pt.count,5)}).map(function(_,j){
                  return <div key={j} style={{width:22,height:22,borderRadius:'50%',background:pt.color===1?'#fff':'#111',border:'1px solid rgba(255,255,255,0.3)',flexShrink:0}} />;
                })}
                {pt.count>5 && <div style={{fontSize:9,color:'#fff',fontWeight:700}}>+{pt.count-5}</div>}
                <div style={{position:'absolute',top:2,fontSize:8,color:'rgba(255,255,255,0.5)'}}>{idx}</div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Bear-off zone */}
      <div style={{display:'flex',justifyContent:'space-between',marginTop:10,padding:'8px 12px',background:'var(--surface-hover)',borderRadius:10,fontSize:13}}>
        <span>⬜ Çıkan: {borne.white}/15</span>
        <span>⬛ Çıkan: {borne.black}/15</span>
        {selected !== null && (phase==='white' || (phase==='black' && gameMode==='local')) && (
          <button onClick={handleBearOff} style={{padding:'4px 12px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#D97706,#F59E0B)',color:'#fff',fontWeight:700,fontSize:12,cursor:'pointer'}}>
            Çıkar
          </button>
        )}
      </div>
      {selected !== null && (
        <div style={{marginTop:6,fontSize:12,color:'var(--text-secondary)',textAlign:'center'}}>
          Taş seçildi: Puan {selected === 24 ? 'Bar' : selected} — gitmek istediğin noktaya dokun
        </div>
      )}
    </div>
  );
}

// ============================================================
// SORU GECESİ — 2-4 player local party quiz
// ============================================================
const SORUGECESI_QS = [
  { q:'Türkiye\'nin başkenti hangisidir?', a:0, opts:['Ankara','İstanbul','İzmir','Bursa'] },
  { q:'Osmanlı İmparatorluğu kaç yılında kuruldu?', a:2, opts:['1299','1453','1071','1326'] },
  { q:'Türkiye\'nin en yüksek dağı hangisidir?', a:1, opts:['Uludağ','Ağrı Dağı','Erciyes','Süphan'] },
  { q:'Hangi gezegen Güneş Sistemi\'nin en büyüğüdür?', a:3, opts:['Satürn','Neptün','Uranüs','Jüpiter'] },
  { q:'Su kaç derecede kaynar?', a:0, opts:['100°C','90°C','80°C','110°C'] },
  { q:'DNA\'nın açılımı nedir?', a:2, opts:['Deoxynitric Acid','Dual Nucleic Acid','Deoxyribonucleic Acid','Dynamic Nucleic Acid'] },
  { q:'Türkiye\'nin para birimi nedir?', a:1, opts:['Lira','Türk Lirası','Kuruş','Akçe'] },
  { q:'Kaç tane renk (ışık) gözünüz var?', a:0, opts:['3','4','2','5'] },
  { q:'Türkiye kaç kıtada yer alır?', a:2, opts:['1','3','2','4'] },
  { q:'İstanbul\'un eski adı nedir?', a:3, opts:['Ankara','Nikomedia','Nikaia','Konstantinopolis'] },
  { q:'Atom altı parçacık hangisi değildir?', a:1, opts:['Proton','Foton','Nötron','Elektron'] },
  { q:'Türkiye\'nin en uzun nehri hangisidir?', a:0, opts:['Kızılırmak','Fırat','Dicle','Sakarya'] },
  { q:'Hangi yıl Türkiye Cumhuriyeti ilan edildi?', a:2, opts:['1919','1920','1923','1938'] },
  { q:'İnsan vücudunda kaç kemik var?', a:1, opts:['186','206','196','216'] },
  { q:'Dünya\'nın en büyük okyanusu hangisidir?', a:0, opts:['Pasifik','Atlantik','Hint','Arktik'] },
  { q:'Hangi element simgesi "Fe" dir?', a:3, opts:['Flor','Fermiyum','Fosfor','Demir'] },
  { q:'Türkiye\'de kaç il vardır?', a:2, opts:['72','80','81','76'] },
  { q:'Güneş Sistemi\'ndeki en küçük gezegen hangisidir?', a:1, opts:['Mars','Merkür','Venüs','Plüton'] },
  { q:'Boğaziçi Köprüsü hangi iki kıtayı birbirine bağlar?', a:0, opts:['Asya-Avrupa','Asya-Afrika','Avrupa-Afrika','Asya-Amerika'] },
  { q:'Işığın hızı yaklaşık kaç km/s\'dir?', a:2, opts:['200.000','250.000','300.000','350.000'] },
  { q:'Hangi spor dalında Türkiye en fazla Olimpiyat altın madalyası kazanmıştır?', a:0, opts:['Güreş','Halter','Boks','Atletizm'] },
  { q:'Atatürk hangi şehirde doğmuştur?', a:1, opts:['Ankara','Selanik','İstanbul','İzmir'] },
  { q:'Türkiye\'nin nüfusu yaklaşık kaçtır?', a:2, opts:['70 milyon','75 milyon','85 milyon','100 milyon'] },
  { q:'Türkiye\'nin en büyük gölü hangisidir?', a:0, opts:['Van Gölü','Tuz Gölü','Beyşehir Gölü','Eğirdir Gölü'] },
  { q:'Osmanlı Devleti\'nin son padişahı kimdir?', a:2, opts:['Abdülhamid II','Mehmed V','Mehmed VI','Abdülmecid II'] },
  { q:'Dünya\'nın en uzun nehri hangisidir?', a:1, opts:['Amazon','Nil','Yangtze','Mississippi'] },
  { q:'Türkiye\'nin en büyük adası hangisidir?', a:0, opts:['Gökçeada','Bozcaada','Marmara Adası','Avşa Adası'] },
  { q:'Hangi element sembolü "Au" dur?', a:3, opts:['Gümüş','Bakır','Alüminyum','Altın'] },
  { q:'Fatih Sultan Mehmet İstanbul\'u kaç yaşında fethetti?', a:1, opts:['18','21','25','30'] },
  { q:'Dünya\'nın en yüksek dağı hangisidir?', a:0, opts:['Everest','K2','Kangchenjunga','Lhotse'] },
  { q:'Kanın pıhtılaşmasında hangi vitamin görev alır?', a:3, opts:['A vitamini','B vitamini','C vitamini','K vitamini'] },
  { q:'Türkiye\'de kaç tane UNESCO Dünya Mirası alanı vardır?', a:2, opts:['10','16','21','28'] },
  { q:'Güneş\'ten sonra Dünya\'ya en yakın yıldız hangisidir?', a:1, opts:['Sirius','Proxima Centauri','Betelgeuse','Polaris'] },
  { q:'Türkiye hangi yılda AB\'ye üyelik başvurusu yapmıştır?', a:0, opts:['1987','1993','1999','2004'] },
  { q:'Bir insan vücudunda kaç litre kan bulunur?', a:2, opts:['3-4','4-5','5-6','7-8'] },
  { q:'Hangi şehir "Pamukkale" ile ünlüdür?', a:1, opts:['Antalya','Denizli','Muğla','Aydın'] },
  { q:'İstanbul Boğazı hangi iki denizi birbirine bağlar?', a:0, opts:['Karadeniz-Marmara','Ege-Marmara','Karadeniz-Ege','Marmara-Akdeniz'] },
  { q:'Türk Hava Yolları\'nın (THY) uçuş kodu nedir?', a:2, opts:['TA','TH','TK','TY'] },
  { q:'Dünya\'nın en büyük çölü hangisidir?', a:3, opts:['Gobi','Arabistan','Kalahari','Antarktika'] },
  { q:'Türkiye\'nin en uzun sahil şeridi hangi denize aittir?', a:1, opts:['Karadeniz','Akdeniz','Ege','Marmara'] },
  { q:'Cappadocia (Kapadokya) hangi ilde yer alır?', a:2, opts:['Konya','Kayseri','Nevşehir','Aksaray'] },
  { q:'Türk alfabesinde kaç harf vardır?', a:1, opts:['27','29','31','33'] },
  { q:'Bir üçgenin iç açıları toplamı kaç derecedir?', a:0, opts:['180°','270°','360°','90°'] },
  { q:'İnsanın en uzun kemiği hangisidir?', a:2, opts:['Omurga','Kol kemiği','Femur (uyluk kemiği)','Kaburga'] },
  { q:'Dünya\'da en çok konuşulan dil hangisidir?', a:1, opts:['İngilizce','Mandarin Çincesi','İspanyolca','Arapça'] },
  { q:'Troya Antik Kenti hangi ilde yer alır?', a:0, opts:['Çanakkale','İzmir','Bursa','Balıkesir'] },
  { q:'Türkiye\'nin ilk Cumhurbaşkanı kimdir?', a:3, opts:['İsmet İnönü','Celal Bayar','Adnan Menderes','Mustafa Kemal Atatürk'] },
  { q:'"Mavi Yolculuk" kavramı hangi Türk yazarla özdeşleşmiştir?', a:1, opts:['Orhan Pamuk','Cevat Şakir Kabaağaçlı (Halikarnas Balıkçısı)','Yaşar Kemal','Aziz Nesin'] },
  { q:'Türkiye\'de en çok konuşulan ikinci dil hangisidir?', a:0, opts:['Kürtçe','Arapça','Zazaca','Lazca'] },
  { q:'Çanakkale Savaşı hangi yılda başlamıştır?', a:2, opts:['1912','1914','1915','1918'] },
  { q:'Türkiye\'nin en yüksek barajı hangisidir?', a:1, opts:['Atatürk Barajı','Deriner Barajı','Keban Barajı','Karakaya Barajı'] },
  { q:'Süleymaniye Camii hangi padişah döneminde inşa edilmiştir?', a:0, opts:['Kanuni Sultan Süleyman','Yavuz Sultan Selim','Fatih Sultan Mehmet','II. Mahmut'] },
  { q:'Piramitler hangi ülkededir?', a:1, opts:['İran','Mısır','Irak','Libya'] },
  { q:'Türkiye\'nin en büyük ticaret limanı hangisidir?', a:0, opts:['Ambarlı Limanı','Mersin Limanı','İzmir Limanı','Trabzon Limanı'] },
  { q:'Hangi hayvan en uzun süre uyumadan yaşayabilir?', a:3, opts:['Fil','Deve','At','Uzun kullaklı yarasa'] },
  { q:'"Mevlana" Türkiye\'nin hangi şehrinde yatmaktadır?', a:2, opts:['Ankara','İstanbul','Konya','Bursa'] },
  { q:'Dünya\'nın en büyük kıtası hangisidir?', a:0, opts:['Asya','Afrika','Amerika','Avrupa'] },
  { q:'İnsan beyninin ağırlığı yaklaşık kaç gramdır?', a:1, opts:['1000g','1400g','1800g','2200g'] },
  { q:'Türkiye\'nin yüzölçümü yaklaşık kaç km² dir?', a:2, opts:['580.000','720.000','785.000','850.000'] },
  { q:'Hangi meyve "Roma\'nın altın elması" olarak bilinir?', a:3, opts:['Şeftali','Armut','Kiraz','Nar'] },
  { q:'"Dede Korkut" hikayeleri hangi Türk boyuna aittir?', a:0, opts:['Oğuz','Kıpçak','Karluk','Uygur'] },
  { q:'Güneş Sistemi\'ndeki halkalı gezegen hangisidir?', a:1, opts:['Jüpiter','Satürn','Uranüs','Neptün'] },
  { q:'Türkiye kaç komşu ülkeye sahiptir?', a:2, opts:['6','7','8','9'] },
  { q:'Hangi spor dalında "Servis" terimi kullanılır?', a:3, opts:['Futbol','Basketbol','Güreş','Tenis'] },
  { q:'Efes Antik Kenti hangi ilde yer alır?', a:1, opts:['Muğla','İzmir','Antalya','Aydın'] },
  { q:'Türk mutfağının sembolü olan "Döner" hangi ülkeye özgüdür?', a:0, opts:['Türkiye','Yunanistan','Suriye','Lübnan'] },
];

const PLAYER_COLORS = ['#E63946','#2A9D8F','#6366F1','#D97706'];
const PLAYER_EMOJIS = ['🔴','🟢','🔵','🟡'];

function SoruGecesiGame({ game, onGameEnd, soundOn }) {
  const [phase, setPhase] = React.useState('setup');
  const [playerCount, setPlayerCount] = React.useState(2);
  const [names, setNames] = React.useState(['Oyuncu 1','Oyuncu 2','Oyuncu 3','Oyuncu 4']);
  const [scores, setScores] = React.useState([0,0,0,0]);
  const [qIdx, setQIdx] = React.useState(0);
  const [pIdx, setPIdx] = React.useState(0);
  const [selected, setSelected] = React.useState(null);
  const [showAns, setShowAns] = React.useState(false);
  const [timer, setTimer] = React.useState(15);
  const TOTAL_Q = 10;
  const shuffled = React.useMemo(function() {
    var arr = SORUGECESI_QS.slice(); for(var i=arr.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=arr[i];arr[i]=arr[j];arr[j]=t;} return arr.slice(0,TOTAL_Q);
  },[]);

  React.useEffect(function(){
    if(phase!=='playing'||showAns)return;
    if(timer<=0){handleAnswer(null);return;}
    var t=setTimeout(function(){setTimer(function(v){return v-1;});},1000);
    return function(){clearTimeout(t);};
  },[phase,timer,showAns]);

  function handleAnswer(idx){
    setSelected(idx);
    setShowAns(true);
    var correct=idx===shuffled[qIdx].a;
    if(correct){
      var bonus=Math.floor(timer/3);
      setScores(function(s){var n=s.slice();n[pIdx]+=10+bonus;return n;});
      if(soundOn)playSound('correct');
      playHaptic('correct');
    } else {
      if(soundOn)playSound('wrong');
      playHaptic('wrong');
    }
    setTimeout(function(){
      setShowAns(false);setSelected(null);setTimer(15);
      var nextP=pIdx+1;
      if(nextP>=playerCount){
        var nextQ=qIdx+1;
        if(nextQ>=TOTAL_Q){setPhase('result');return;}
        setQIdx(nextQ);setPIdx(0);
      } else { setPIdx(nextP); }
    },1800);
  }

  var activePlayers = names.slice(0,playerCount);

  if(phase==='setup'){
    return (
      <div style={{maxWidth:480,margin:'0 auto',padding:'28px 16px',textAlign:'center'}}>
        <div style={{fontSize:52,marginBottom:8}}>🧠</div>
        <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:22,marginBottom:4}}>Soru Gecesi</h2>
        <p style={{color:'var(--text-secondary)',fontSize:14,marginBottom:24}}>2-4 kişilik bilgi yarışması. Sırayla oynayın!</p>
        <div style={{marginBottom:20}}>
          <div style={{fontWeight:600,marginBottom:8}}>Oyuncu sayısı</div>
          <div style={{display:'flex',gap:8,justifyContent:'center'}}>
            {[2,3,4].map(function(n){
              return <button key={n} onClick={function(){setPlayerCount(n);}} style={{width:52,height:52,borderRadius:12,border:playerCount===n?'none':'1px solid var(--border)',background:playerCount===n?'#6366f1':'var(--surface)',color:playerCount===n?'#fff':'var(--text)',fontWeight:700,fontSize:18,cursor:'pointer'}}>{n}</button>;
            })}
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:28}}>
          {Array.from({length:playerCount},function(_,i){
            return (
              <div key={i} style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:22}}>{PLAYER_EMOJIS[i]}</span>
                <input value={names[i]} onChange={function(e){var v=e.target.value;setNames(function(n){var a=n.slice();a[i]=v;return a;});}} style={{flex:1,padding:'10px 12px',borderRadius:10,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:15,outline:'none'}} maxLength={16} />
              </div>
            );
          })}
        </div>
        <button onClick={function(){setPhase('playing');}} style={{width:'100%',padding:'14px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#863bff,#5b21b6)',color:'#fff',fontWeight:800,fontSize:16,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>
          Oyunu Başlat 🎉
        </button>
      </div>
    );
  }

  if(phase==='result'){
    var ranked=activePlayers.map(function(n,i){return{name:n,score:scores[i],color:PLAYER_COLORS[i],emoji:PLAYER_EMOJIS[i]};}).sort(function(a,b){return b.score-a.score;});
    var winner=ranked[0];
    return (
      <div style={{maxWidth:480,margin:'0 auto',padding:'28px 16px',textAlign:'center'}}>
        <div style={{fontSize:52,marginBottom:8}}>🏆</div>
        <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:22,marginBottom:4}}>Oyun Bitti!</h2>
        <div style={{marginBottom:6,fontSize:18,fontWeight:700}}>{winner.emoji} {winner.name} kazandı!</div>
        <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:28,marginTop:20}}>
          {ranked.map(function(p,i){
            return (
              <div key={p.name} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',borderRadius:12,background:i===0?'rgba(134,59,255,0.12)':'var(--surface)',border:i===0?'1px solid rgba(134,59,255,0.3)':'1px solid var(--border)'}}>
                <span style={{fontSize:20,width:28}}>{i===0?'🥇':i===1?'🥈':'🥉'}</span>
                <span style={{fontSize:20}}>{p.emoji}</span>
                <span style={{flex:1,fontWeight:700,textAlign:'left'}}>{p.name}</span>
                <span style={{fontWeight:800,color:p.color,fontSize:18}}>{p.score} puan</span>
              </div>
            );
          })}
        </div>
        <button onClick={function(){onGameEnd('win');}} style={{width:'100%',padding:'14px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#863bff,#5b21b6)',color:'#fff',fontWeight:800,fontSize:16,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>
          Lobiyi Bitir ✓
        </button>
      </div>
    );
  }

  var q=shuffled[qIdx];

  return (
    <div style={{maxWidth:480,margin:'0 auto',padding:'24px 16px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <span style={{fontSize:13,color:'var(--text-secondary)',fontWeight:600}}>Soru {qIdx+1}/{TOTAL_Q}</span>
        <div style={{display:'flex',gap:8}}>
          {activePlayers.map(function(n,i){return <span key={i} style={{fontSize:11,padding:'3px 8px',borderRadius:8,background:i===pIdx?PLAYER_COLORS[pIdx]:'var(--surface)',color:i===pIdx?'#fff':'var(--text-secondary)',fontWeight:700}}>{PLAYER_EMOJIS[i]}{scores[i]}</span>;})}
        </div>
      </div>
      <div style={{textAlign:'center',marginBottom:16}}>
        <div style={{fontSize:28,fontWeight:800,color:PLAYER_COLORS[pIdx]}}>{PLAYER_EMOJIS[pIdx]} {activePlayers[pIdx]}</div>
        <div style={{fontSize:12,color:'var(--text-secondary)'}}>sırasında</div>
      </div>
      <div style={{background:'var(--surface)',borderRadius:16,padding:'20px',marginBottom:20,border:'1px solid var(--border)'}}>
        <div style={{fontFamily:"'Sora',sans-serif",fontWeight:700,fontSize:17,lineHeight:1.4,textAlign:'center'}}>{q.q}</div>
      </div>
      <div style={{position:'relative',height:8,background:'var(--surface-hover)',borderRadius:4,marginBottom:20,overflow:'hidden'}}>
        <div style={{position:'absolute',left:0,top:0,height:'100%',borderRadius:4,background:timer>8?'#22c55e':timer>4?'#D97706':'#E63946',width:(timer/15*100)+'%',transition:'width 1s linear'}}/>
        <div style={{position:'absolute',right:8,top:-12,fontSize:12,fontWeight:700,color:timer>8?'#22c55e':timer>4?'#D97706':'#E63946'}}>{timer}s</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {q.opts.map(function(opt,i){
          var bg='var(--surface)',color='var(--text)',border='1px solid var(--border)';
          if(showAns){
            if(i===q.a){bg='#22c55e';color='#fff';border='none';}
            else if(i===selected&&selected!==q.a){bg='#ef4444';color='#fff';border='none';}
          }
          return (
            <button key={i} onClick={function(){if(!showAns)handleAnswer(i);}} disabled={showAns}
              style={{padding:'14px 10px',borderRadius:12,border:border,background:bg,color:color,fontWeight:600,fontSize:14,cursor:showAns?'default':'pointer',fontFamily:"'DM Sans',sans-serif",lineHeight:1.3,transition:'all 0.2s'}}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// DAILY QUEST BANNER
// ============================================================
function DailyQuestBanner({ stats }) {
  var today = new Date().toDateString();
  var ds = stats.dailyStats || {};
  var dayPlayed = (ds.date === today) ? (ds.played || 0) : 0;
  var dayWins   = (ds.date === today) ? (ds.wins   || 0) : 0;
  var variety   = Object.keys(stats.games || {}).filter(function(k){ return (stats.games[k].played||0)>0; }).length;

  var quests = [
    { icon:'🎮', label:'Bugün 3 oyun oyna',      cur: Math.min(dayPlayed,3),  goal:3,  xp:15 },
    { icon:'🏆', label:'Bugün 2 galibiyet al',   cur: Math.min(dayWins,2),    goal:2,  xp:20 },
    { icon:'🎯', label:'5 farklı oyun dene',      cur: Math.min(variety,5),    goal:5,  xp:25 },
  ];
  var allDone = quests.every(function(q){ return q.cur>=q.goal; });
  return (
    <div style={{ background: allDone ? 'linear-gradient(135deg,rgba(52,211,153,0.08),rgba(134,59,255,0.08))' : 'linear-gradient(135deg,rgba(134,59,255,0.07),rgba(99,102,241,0.07))', border: '1px solid '+(allDone?'rgba(52,211,153,0.25)':'rgba(134,59,255,0.18)'), borderRadius:16, padding:'16px 18px', marginBottom:20, animation:'fadeUp 0.4s ease' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ fontWeight:800, fontSize:15, display:'flex', alignItems:'center', gap:8 }}>
          <span>⚡</span> Günlük Görevler
        </div>
        {allDone && <span style={{ background:'rgba(52,211,153,0.18)', color:'#34d399', fontWeight:700, fontSize:11, padding:'3px 10px', borderRadius:20 }}>✅ Tamamlandı</span>}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {quests.map(function(q,i){
          var pct = Math.round((q.cur/q.goal)*100);
          var done = q.cur>=q.goal;
          return (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:18, flexShrink:0 }}>{q.icon}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, fontWeight:600, marginBottom:4 }}>
                  <span style={{ color: done?'#34d399':'var(--text)' }}>{q.label}</span>
                  <span style={{ color:'var(--text-secondary)', fontVariantNumeric:'tabular-nums' }}>{q.cur}/{q.goal}</span>
                </div>
                <div style={{ height:5, background:'var(--border)', borderRadius:999, overflow:'hidden' }}>
                  <div style={{ width:pct+'%', height:'100%', background: done?'linear-gradient(90deg,#34d399,#10b981)':'linear-gradient(90deg,#863bff,#a855f7)', borderRadius:999, transition:'width 0.5s ease' }} />
                </div>
              </div>
              <span style={{ fontSize:11, fontWeight:700, color:'#a855f7', flexShrink:0 }}>+{q.xp}XP</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// ADAM ASMACA GAME
// ============================================================
var ASMACA_WORDS = [
  'araba','elma','masa','kalem','kitap','okul','yol','ağaç','deniz','dağ',
  'çiçek','güneş','yıldız','bulut','rüzgar','yağmur','fırtına','yılan',
  'kelebek','aslan','kaplan','fil','deve','tavşan','tilki','kartal',
  'portakal','domates','patates','soğan','sarımsak','biber','kavun','karpuz',
  'hastane','öğretmen','mühendis','doktor','avukat','öğrenci','arkadaş',
  'bayram','tatil','yolculuk','macera','hazine','gizem','efsane','kahraman',
  'mevsim','sonbahar','ilkbahar','yüzyıl','tarih','kültür','sanat','müzik',
  'futbol','basketbol','tenis','yüzme','koşu','bisiklet','satranç',
  'bilgisayar','telefon','internet','program','uygulama','oyun','film',
  'mutfak','banyo','pencere','merdiven','balkon','bahçe','çatı','duvar',
];

var ASMACA_TR_ALPHABET = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'.split('');

function AdamAsmacaGame({ game, onGameEnd, soundOn }) {
  var MAX_WRONG = 6;
  var s0 = React.useState(null); var phase = s0[0]; var setPhase = s0[1];
  var s1 = React.useState(''); var word = s1[0]; var setWord = s1[1];
  var s2 = React.useState([]); var guessed = s2[0]; var setGuessed = s2[1];
  var s3 = React.useState(0); var wrongCount = s3[0]; var setWrongCount = s3[1];

  function startGame() {
    var w = ASMACA_WORDS[Math.floor(Math.random()*ASMACA_WORDS.length)].toUpperCase();
    setWord(w); setGuessed([]); setWrongCount(0); setPhase('playing');
  }

  function guess(letter) {
    if(guessed.indexOf(letter)!==-1 || phase!=='playing') return;
    var newGuessed = guessed.concat([letter]);
    setGuessed(newGuessed);
    var wordUp = word;
    var letterInWord = wordUp.indexOf(letter)!==-1 || (letter==='I' && wordUp.indexOf('İ')!==-1) || (letter==='İ' && wordUp.indexOf('I')!==-1);
    if(!letterInWord) {
      var nw = wrongCount+1;
      setWrongCount(nw);
      if(soundOn) playSound('wrong');
      playHaptic('wrong');
      if(nw>=MAX_WRONG) { setPhase('lost'); onGameEnd('loss'); }
    } else {
      if(soundOn) playSound('correct');
      playHaptic('correct');
      // Check win: all letters guessed
      var allGuessed = wordUp.split('').every(function(c){
        if(c==='_' || c===' ') return true;
        return newGuessed.indexOf(c)!==-1;
      });
      if(allGuessed) { setPhase('won'); onGameEnd('win'); }
    }
  }

  var HANGMAN_STAGES = [
    '😊','😟','😰','😨','😱','💀','☠️'
  ];

  if(!phase) return (
    <div style={{maxWidth:380,margin:'0 auto',padding:'40px 20px',textAlign:'center'}}>
      <div style={{fontSize:72,marginBottom:8}}>🪢</div>
      <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:900,fontSize:28,marginBottom:6}}>Adam Asmaca</h2>
      <p style={{color:'var(--text-secondary)',fontSize:14,marginBottom:12}}>Kelimeyi bulmaya çalış! 6 yanlış tahmin hakkın var.</p>
      <div style={{display:'flex',justifyContent:'center',gap:6,marginBottom:28}}>
        {Array.from({length:MAX_WRONG+1}).map(function(_,i){
          return <span key={i} style={{fontSize:20}}>{HANGMAN_STAGES[i]}</span>;
        })}
      </div>
      <button onClick={startGame} style={{padding:'16px 48px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#6366F1,#8B5CF6)',color:'#fff',fontSize:17,fontWeight:800,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>
        Başla
      </button>
    </div>
  );

  var displayWord = word.split('').map(function(c){
    return guessed.indexOf(c)!==-1 ? c : (c===' '?'  ':'_');
  });

  var wrongLetters = guessed.filter(function(l){ return word.indexOf(l)===-1; });

  if(phase==='won' || phase==='lost') return (
    <div style={{maxWidth:400,margin:'0 auto',padding:'40px 20px',textAlign:'center'}}>
      <div style={{fontSize:64,marginBottom:12}}>{phase==='won'?'🎉':'💀'}</div>
      <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:900,fontSize:26,marginBottom:8}}>
        {phase==='won'?'Tebrikler!':'Kaybettin!'}
      </h2>
      <p style={{color:'var(--text-secondary)',marginBottom:4}}>
        {phase==='won'?'Kelimeyi buldun:':'Kelime:'}
      </p>
      <div style={{fontSize:28,fontWeight:800,letterSpacing:4,color:'#6366F1',marginBottom:20}}>{word}</div>
      <button onClick={startGame} style={{display:'block',width:'100%',padding:14,borderRadius:12,background:'linear-gradient(135deg,#6366F1,#8B5CF6)',color:'#fff',border:'none',fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:10}}>
        Tekrar Oyna
      </button>
      <button onClick={function(){onGameEnd(phase==='won'?'win':'loss');}} style={{display:'block',width:'100%',padding:12,borderRadius:12,background:'var(--surface-hover)',color:'var(--text)',border:'1px solid var(--border)',fontWeight:600,fontSize:14,cursor:'pointer'}}>
        Çık
      </button>
    </div>
  );

  return (
    <div style={{maxWidth:420,margin:'0 auto',padding:'20px 16px'}}>
      {/* Hangman visual */}
      <div style={{textAlign:'center',marginBottom:16}}>
        <div style={{fontSize:60,lineHeight:1}}>{HANGMAN_STAGES[wrongCount]}</div>
        <div style={{display:'flex',justifyContent:'center',gap:4,marginTop:8}}>
          {Array.from({length:MAX_WRONG}).map(function(_,i){
            return <div key={i} style={{width:12,height:12,borderRadius:'50%',background:i<wrongCount?'#EF4444':'var(--border)'}} />;
          })}
        </div>
        <div style={{fontSize:12,color:wrongCount>=4?'#EF4444':'var(--text-secondary)',marginTop:4}}>
          {MAX_WRONG-wrongCount} hak kaldı
        </div>
      </div>
      {/* Word display */}
      <div style={{display:'flex',justifyContent:'center',gap:8,flexWrap:'wrap',marginBottom:24}}>
        {displayWord.map(function(c,i){
          return (
            <div key={i} style={{textAlign:'center',minWidth:24}}>
              <div style={{fontSize:22,fontWeight:800,letterSpacing:1,color:c!=='_'?'#6366F1':'var(--text)',height:32,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>{c}</div>
              <div style={{height:2,background:c!=='_'?'#6366F1':'var(--border)',borderRadius:2,marginTop:2}} />
            </div>
          );
        })}
      </div>
      {/* Wrong letters */}
      {wrongLetters.length>0 && (
        <div style={{textAlign:'center',marginBottom:12,fontSize:13,color:'#EF4444'}}>
          Yanlış: {wrongLetters.join(', ')}
        </div>
      )}
      {/* Letter keyboard */}
      <div style={{display:'flex',flexWrap:'wrap',gap:5,justifyContent:'center'}}>
        {ASMACA_TR_ALPHABET.map(function(letter){
          var isGuessed = guessed.indexOf(letter)!==-1;
          var isCorrect = isGuessed && word.indexOf(letter)!==-1;
          var isWrong = isGuessed && word.indexOf(letter)===-1;
          return (
            <button key={letter} onClick={function(){ guess(letter); }} disabled={isGuessed}
              style={{width:36,height:36,borderRadius:8,border:'1px solid var(--border)',
                background:isCorrect?'rgba(99,102,241,0.15)':isWrong?'rgba(239,68,68,0.1)':'var(--surface)',
                color:isCorrect?'#6366F1':isWrong?'#EF4444':'var(--text)',
                fontWeight:700,fontSize:13,cursor:isGuessed?'default':'pointer',
                opacity:isGuessed?0.5:1
              }}>
              {letter}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// STROOP TESTİ — Color-Word Interference Game
// ============================================================
var STROOP_COLORS = [
  { name:'KIRMIZI', color:'#E63946', label:'KIRMIZI' },
  { name:'MAVİ',    color:'#2563EB', label:'MAVİ' },
  { name:'YEŞİL',   color:'#16A34A', label:'YEŞİL' },
  { name:'SARI',    color:'#D97706', label:'SARI' },
  { name:'MOR',     color:'#7C3AED', label:'MOR' },
  { name:'TURUNCU', color:'#EA580C', label:'TURUNCU' },
];

function generateStroopRound() {
  var word = STROOP_COLORS[Math.floor(Math.random()*STROOP_COLORS.length)];
  var colorObj;
  do { colorObj = STROOP_COLORS[Math.floor(Math.random()*STROOP_COLORS.length)]; } while(colorObj.name===word.name);
  return { word: word.name, wordColor: colorObj.color, correctName: colorObj.name, correctColor: colorObj.color };
}

function StroopTestiGame({ game, onGameEnd, soundOn }) {
  var TOTAL = 20;
  var s0 = React.useState(null); var phase = s0[0]; var setPhase = s0[1];
  var s1 = React.useState(0); var score = s1[0]; var setScore = s1[1];
  var s2 = React.useState(0); var qIdx = s2[0]; var setQIdx = s2[1];
  var s3 = React.useState(function(){ return generateStroopRound(); }); var round = s3[0]; var setRound = s3[1];
  var s4 = React.useState(null); var feedback = s4[0]; var setFeedback = s4[1];
  var s5 = React.useState(0); var combo = s5[0]; var setCombo = s5[1];
  var s6 = React.useState(45); var timeLeft = s6[0]; var setTimeLeft = s6[1];

  React.useEffect(function(){
    if(phase!=='playing') return;
    if(timeLeft<=0){ setPhase('done'); return; }
    var t = setTimeout(function(){ setTimeLeft(function(v){ return v-1; }); },1000);
    return function(){ clearTimeout(t); };
  },[phase,timeLeft]);

  function handleAnswer(colorName) {
    if(phase!=='playing'||feedback) return;
    var correct = colorName === round.correctName;
    if(correct){
      var newCombo = combo+1;
      setCombo(newCombo);
      var pts = 10 + (newCombo>=3?5:0);
      setScore(function(s){ return s+pts; });
      if(soundOn) playSound('correct');
      playHaptic('correct');
      setFeedback('correct');
    } else {
      setCombo(0);
      if(soundOn) playSound('wrong');
      playHaptic('wrong');
      setFeedback('wrong');
    }
    setTimeout(function(){
      setFeedback(null);
      var next = qIdx+1;
      if(next>=TOTAL){ setPhase('done'); return; }
      setQIdx(next);
      setRound(generateStroopRound());
    }, 400);
  }

  var buttons = React.useMemo(function(){
    var correct = STROOP_COLORS.find(function(c){ return c.name===round.correctName; });
    var others = STROOP_COLORS.filter(function(c){ return c.name!==round.correctName; });
    for(var i=others.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=others[i];others[i]=others[j];others[j]=t;}
    var sel = [correct].concat(others.slice(0,3));
    for(var k=sel.length-1;k>0;k--){var l=Math.floor(Math.random()*(k+1));var tmp=sel[k];sel[k]=sel[l];sel[l]=tmp;}
    return sel;
  },[round]);

  if(!phase) return (
    <div style={{maxWidth:380,margin:'0 auto',padding:'40px 20px',textAlign:'center'}}>
      <div style={{fontSize:72,marginBottom:8}}>🎨</div>
      <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:900,fontSize:28,marginBottom:6}}>Stroop Testi</h2>
      <p style={{color:'var(--text-secondary)',fontSize:14,marginBottom:8}}>Kelimenin rengini seç, yazdığını değil!</p>
      <div style={{background:'var(--surface)',borderRadius:14,padding:'16px',marginBottom:20}}>
        <div style={{fontSize:32,fontWeight:900,color:'#2563EB',marginBottom:8}}>KIRMIZI</div>
        <p style={{fontSize:12,color:'var(--text-secondary)'}}>⬆️ Bu kelime "KIRMIZI" yazıyor ama MAVİ renkte. Doğru cevap: MAVİ</p>
      </div>
      <button onClick={function(){setPhase('playing');}} style={{padding:'16px 48px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#BE185D,#F472B6)',color:'#fff',fontSize:17,fontWeight:800,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>
        Başla
      </button>
    </div>
  );

  if(phase==='done') {
    var rank = score>=150?'win':score>=80?'draw':'loss';
    return (
      <div style={{maxWidth:400,margin:'0 auto',padding:'40px 20px',textAlign:'center'}}>
        <div style={{fontSize:64,marginBottom:12}}>{score>=150?'🧠':score>=80?'😊':'🤔'}</div>
        <h2 style={{fontFamily:"'Sora',sans-serif",fontWeight:900,fontSize:26,marginBottom:8}}>
          {score>=150?'Olağanüstü Beyin!':score>=80?'İyi İş!':'Pratik Yapalım!'}
        </h2>
        <div style={{fontSize:48,fontWeight:900,color:'#BE185D',marginBottom:4}}>{score}</div>
        <div style={{color:'var(--text-secondary)',fontSize:14,marginBottom:8}}>puan · {qIdx} soru</div>
        <div style={{background:'var(--surface)',borderRadius:12,padding:'12px',marginBottom:20,fontSize:13,color:'var(--text-secondary)'}}>
          💡 Stroop Etkisi: Beyin renk ve kelime anlamını aynı anda işler. Bu çatışma tepki sürenizi uzatır!
        </div>
        <button onClick={function(){onGameEnd(rank);}} style={{display:'block',width:'100%',padding:14,borderRadius:12,background:'linear-gradient(135deg,#BE185D,#F472B6)',color:'#fff',border:'none',fontWeight:700,fontSize:15,cursor:'pointer'}}>
          Bitir
        </button>
      </div>
    );
  }

  return (
    <div style={{maxWidth:420,margin:'0 auto',padding:'20px 16px'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{fontSize:14,color:'var(--text-secondary)',fontWeight:600}}>{qIdx+1}/{TOTAL}</div>
        <div style={{padding:'6px 14px',borderRadius:999,background:timeLeft<=10?'rgba(239,68,68,0.12)':'rgba(190,24,93,0.1)',color:timeLeft<=10?'#EF4444':'#BE185D',fontWeight:700,fontSize:14}}>
          ⏱ {timeLeft}s
        </div>
        <div style={{fontWeight:800,fontSize:16,color:'#BE185D'}}>{score}p {combo>=3?'🔥×'+combo:''}</div>
      </div>
      {/* The word */}
      <div style={{textAlign:'center',marginBottom:32,padding:'24px',background:'var(--surface)',borderRadius:20,border:'2px solid var(--border)'}}>
        <div style={{fontSize:11,color:'var(--text-secondary)',fontWeight:700,letterSpacing:1,marginBottom:8}}>BU KELİMENİN RENGİ NEDİR?</div>
        <div style={{fontSize:44,fontWeight:900,color:round.wordColor,letterSpacing:2,fontFamily:'monospace'}}>{round.word}</div>
      </div>
      {/* Color buttons */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {buttons.map(function(c){
          return (
            <button key={c.name} onClick={function(){ handleAnswer(c.name); }}
              style={{padding:'16px 8px',borderRadius:14,border:'2px solid '+c.color,
                background:feedback&&c.name===round.correctName?c.color+'22':'var(--surface)',
                color:c.color,fontWeight:800,fontSize:14,cursor:'pointer',
                fontFamily:"'Sora',sans-serif",transition:'transform 0.1s',
                transform:'scale(1)'}}>
              ● {c.name}
            </button>
          );
        })}
      </div>
      {feedback && (
        <div style={{textAlign:'center',marginTop:12,fontSize:16,fontWeight:700,color:feedback==='correct'?'#16A34A':'#EF4444'}}>
          {feedback==='correct'?(combo>=3?'🔥 COMBO! +15':'✅ Doğru! +10'):'❌ Yanlış!'}
        </div>
      )}
    </div>
  );
}

// ============================================================
// KELIME AVCI GAME
// ============================================================

function turkishLower(s) {
  return s.split('').map(function(c){
    if(c==='İ') return 'i';
    if(c==='I') return 'ı';
    return c.toLowerCase();
  }).join('');
}

var TR_WORDS = [
  // 3 harf
  'ada','ağa','ak','ala','alt','ana','ara','arı','at','av','ay','az',
  'bak','bal','bar','bas','bat','bay','bez','bor','boy','boz','bul',
  'can','cep','çak','çal','çam','çan','çat','çek','çil','çit','çok','çöl',
  'dağ','dal','dam','dar','del','din','dip','don','dur','düş',
  'ek','el','en','er','eş','ev',
  'fal','fen','fil','fon',
  'gaz','gel','gem','gen','git','gök','göl','göz','güç','gül','gün',
  'hak','ham','hat','haz','hem','hep','hız','hiç',
  'iç','ip','iş',
  'kap','kar','kat','kay','kaz','kır','kıl','kol','koy','köy','kum','kur',
  'ok','on','oy','öç','öz',
  'pak','par','pay','pek','pir','put',
  'raf','rap','ray','ruh',
  'sap','sar','say','ses','sev','sır','sol','son','soy','söz','süs','süt',
  'şan','şap','şef','şen','şey','şık','şiş',
  'tak','tam','tan','taş','ter','tok','top','tuz','tür','tüm',
  'uç','üç','üst','üye',
  'var','ver',
  'yağ','yak','yan','yap','yar','yat','yay','yaz','yel','yem','yen','yok','yön','yüz',
  'zam','zan','zar','zor',
  // 4 harf
  'abla','acı','adam','ağaç','ağır','ağız','akıl','akış','alay','alan','alev','alım','alın',
  'anne','arka','arzu','asıl','asma','atık','avlu','ayak','ayna',
  'baca','baht','baş','beden','bela','bile','biri','bitki','borç','büyük',
  'canlı','çaba','çalı','çanak','çapa','çatı','çene','çizgi','çoban','çorba',
  'dalga','damar','davet','delik','demet','deniz','deve','diken','dilek',
  'doğu','dolap','dolma','dönem','durak','duvar','duman',
  'elmas','emek','emir','esen','eşek',
  'fayda','fidan','fırça','fırın','fikir',
  'gece','gelin','gemi','gişe','gönül','güzel',
  'haber','hafif','halk','hasar','havuz','hayat','hırsız','hızlı',
  'icat','ikaz','ilan','imza','insan','irade','isim',
  'kebap','kedi','kelam','kenar','kesim','keten','keyif','kılıç','kına','kısa','koca','kolay',
  'koltuk','komut','korku','kova','köpek','köprü','kulak','kurum','kutu','küçük',
  'leke','liman',
  'madde','masal','mavi','mekan','mesaj','meslek','meyve','mısır','model','motor','müzik',
  'neden','nefes','nesne','niyet',
  'ocak','onay','onur','oyun',
  'para','pazar','perde','omuz','ordu','orman','ödev','öğle','önce','öneri','örnek',
  'roman',
  'saat','sanat','sebep','selam','siyah','sohbet','sokak','söylem',
  'şahin','şarkı','şeker','şehir','şarap',
  'tarih','tarla','tekne','tema','test','tırnak',
  'uçak','uzman','ütü',
  'yaban','yaka','yalın','yanık','yardım','yazar','yılan',
  'zaman','zemin',
  // 5 harf
  'adres','ağabey','ahşap','albüm','aktris',
  'bahçe','bakır','bakan','balkon','bayram','bebek','belge','berber','bıçak',
  'bodrum','boyun','bölge',
  'cadde','ceket','cennet','çalışma','çarşı','çekici','çelik',
  'damar','damga','değer','deneme','destek','devlet','dürüst',
  'eğlence','emekli','enerji','erkek',
  'fabrika','falcı','gerçek','görüntü','gözlük','güçlük','güneş','güvenlik',
  'hediye','heykel','horoz',
  'işaret','içerik','ilginç','inanç','iptal',
  'kadın','kalıcı','kaptan','karanlık','kasım','kavram','kebapçı','kelime','kırmızı',
  'mahkeme','maymun','meydan','mutfak','müdür',
  'okuyucu','oyuncu',
  'papatya','resim','ruhsat',
  'sabun','sağlam','sandık','satıcı',
  'şaşırt','taban','tahmin','takım','talep','tavan',
  'uğraş','uyarı',
  'yabancı','yalnız','yardımcı','yarışma','yönetim','zincir',
  // 6+ harf
  'bahçede','başarı','değişim','gelişim','güzellik',
  'hareket','hastane','hesabı','iletişim','ilerleme',
  'katılım','kazanma','kesinlik',
  'öğrenci','özellik','öğretim',
  'planlama','sanatçı','serbest',
  'tatilci','toplumun','verimli',
  // Ek yaygın kelimeler
  'araba','elma','masa','kalem','kitap','okul','yol','ağaç','yaprak','çiçek',
  'kuş','balık','kedi','köpek','inek','koyun','böcek','ipek','pamuk','yün',
  'elbise','göz','kulak','burun','diş','dil','kol','omuz','sırt','yüz',
  'saç','bel','diz','parmak','tırnak','kemik','ten','deri','kan','nefes',
  'ses','renk','mavi','kırmızı','sarı','yeşil','beyaz','siyah','mor','pembe',
  'turuncu','gri','kahve','altın','gümüş','bakır','demir','çelik','kaya',
  'toprak','kum','çamur','buz','ateş','rüzgar','yağmur','fırtına',
  'güneş','yıldız','gök','bulut','gökkuşağı','sabah','akşam','gece','gündüz',
  'hafta','yıl','mevsim','ilkbahar','yaz','sonbahar','kış','sıcak','soğuk','ılık',
  'kapalı','açık','büyük','küçük','uzun','kısa','ince','kalın','dolu','boş',
  'hızlı','yavaş','güzel','çirkin','iyi','kötü','doğru','yanlış','kolay','zor',
  'tatlı','ekşi','acı','tuzlu','sert','yumuşak','parlak','karanlık',
  'oval','kare','daire','üçgen','yedi','sekiz','dokuz','yarım','çeyrek',
  'ekmek','çay','kahve','süt','yumurta','sebze','meyve','elma','armut',
  'portakal','limon','üzüm','domates','patates','soğan','sarımsak','biber',
  'mercimek','pirinç','makarna','çorba','pilav','börek','baklava','simit',
  'tuz','şeker','yağ','sirke','reçel','bal','peynir','yoğurt',
  'nehir','ırmak','orman','çiçek','kök','dal','gövde','tohum','bitki','çalı','ot',
  'fare','tavşan','tilki','kurt','ayı','aslan','kaplan','fil','deve','maymun',
  'güvercin','serçe','kurbağa','ahtapot','kelebek','karınca','sinek',
  'cadde','park','okul','hastane','dükkan','market','banka','otel','restoran',
  'gömlek','pantolon','etek','elbise','ceket','kazak','tişört','çorap','çizme',
  'ayakkabı','terlik','sandalet','kemer','şapka','eldiven','çanta',
  'masa','sıra','saat','radyo','televizyon','internet','bilgisayar','program',
  'uygulama','film','konser','tiyatro','sinema','sergi','festival',
  'arı','kovan','bal','petek','kelebek','papatya','lale','zambak','gül','çiçek',
  'merdiven','kapı','pencere','duvar','tavan','çatı','mutfak','banyo','yatak',
  'sandalye','koltuk','dolap','çekmece','halı','perde','lamba','ayna',
  'çatal','kaşık','bıçak','tabak','bardak','tencere','tava',
  'futbol','basketbol','tenis','satranç','yüzme','koşu','dans','müzik',
  'resim','heykel','fotoğraf','bisiklet','motor','tren','gemi',
  'kardeş','akraba','dost','arkadaş','öğretmen','doktor','polis','asker',
  'şehir','köy','mahalle','sokak','ilçe','ülke','dünya','kıta','okyanus',
];

var TR_POOL = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'.split('');
var POOL_WEIGHTS = { A:8,B:3,C:4,Ç:5,D:4,E:9,F:2,G:4,Ğ:2,H:3,I:5,İ:8,J:1,K:6,L:5,M:5,N:6,O:4,Ö:2,P:2,R:6,S:6,Ş:4,T:6,U:4,Ü:2,V:2,Y:4,Z:3 };

function pickLetters(n) {
  var letters = [];
  for (var k in POOL_WEIGHTS) { for (var i=0;i<POOL_WEIGHTS[k];i++) letters.push(k); }
  // Ensure at least 4 vowels in the selection
  var vowels = ['A','E','I','İ','O','Ö','U','Ü'];
  var result = [];
  var pool = letters.slice();
  // First pick vowels until we have 4
  var vowelPool = pool.filter(function(l){ return vowels.indexOf(l)!==-1; });
  for (var v=0;v<4 && vowelPool.length>0;v++) {
    var vi = Math.floor(Math.random()*vowelPool.length);
    var vl = vowelPool[vi];
    result.push(vl);
    var pi = pool.indexOf(vl); pool.splice(pi,1);
    vowelPool.splice(vi,1);
  }
  // Fill rest randomly
  for (var j=result.length;j<n;j++) {
    var idx = Math.floor(Math.random()*pool.length);
    result.push(pool[idx]);
    pool.splice(idx,1);
  }
  // Shuffle result
  for (var s=result.length-1;s>0;s--){
    var r=Math.floor(Math.random()*(s+1));
    var tmp=result[s];result[s]=result[r];result[r]=tmp;
  }
  return result;
}

function canMakeWord(word, letters) {
  var pool = letters.map(function(l){ return turkishLower(l); });
  var chars = turkishLower(word).split('');
  for (var i=0;i<chars.length;i++) {
    var c = chars[i];
    var pos = pool.indexOf(c);
    if (pos===-1 && c==='i') pos = pool.indexOf('ı');
    if (pos===-1 && c==='ı') pos = pool.indexOf('i');
    if (pos===-1) return false;
    pool.splice(pos,1);
  }
  return true;
}

function KelimeAvciGame({ game, onGameEnd, soundOn }) {
  var TOTAL_TIME = 90;
  var s1=useState(TOTAL_TIME); var timeLeft=s1[0]; var setTimeLeft=s1[1];
  var s2=useState(0); var score=s2[0]; var setScore=s2[1];
  var s3=useState(function(){ return pickLetters(12); }); var letters=s3[0];
  var s4=useState(''); var input=s4[0]; var setInput=s4[1];
  var s5=useState([]); var found=s5[0]; var setFound=s5[1];
  var s6=useState(null); var msg=s6[0]; var setMsg=s6[1];
  var s7=useState(false); var done=s7[0]; var setDone=s7[1];
  var s8=useState([]); var usedTiles=s8[0]; var setUsedTiles=s8[1];
  var inputRef=useRef(null);

  useEffect(function(){
    if(done)return;
    var t=setInterval(function(){
      setTimeLeft(function(p){ if(p<=1){clearInterval(t);setDone(true);return 0;} return p-1; });
    },1000);
    return function(){clearInterval(t);};
  },[done]);

  function handleTileClick(letter, tileIdx) {
    if(done) return;
    setInput(function(v){ return v + turkishLower(letter); });
    setUsedTiles(function(u){ return u.concat([tileIdx]); });
  }

  function handleClearInput() {
    setInput('');
    setUsedTiles([]);
  }

  function handleDeleteLast() {
    setInput(function(v){ return v.slice(0,-1); });
    setUsedTiles(function(u){ return u.slice(0,-1); });
  }

  function handleSubmit(e) {
    e&&e.preventDefault();
    var rawInput = input.trim();
    if(!rawInput) return;
    var word = turkishLower(rawInput);
    if(word.length<3){ setMsg('⚠️ En az 3 harf!'); setTimeout(function(){setMsg(null);},1200); handleClearInput(); return; }
    if(found.indexOf(word)!==-1){ setMsg('✋ Zaten bulundu!'); setTimeout(function(){setMsg(null);},1200); handleClearInput(); return; }
    if(!canMakeWord(word, letters)){ setMsg('❌ Bu harfler yok!'); setTimeout(function(){setMsg(null);},1200); handleClearInput(); return; }
    var wordNorm = word.replace(/ı/g,'i');
    var inList = TR_WORDS.some(function(w){ return turkishLower(w).replace(/ı/g,'i') === wordNorm; });
    if(!inList){ setMsg('🤔 Geçersiz kelime!'); setTimeout(function(){setMsg(null);},1200); handleClearInput(); return; }
    var pts = word.length*10;
    setFound(function(f){ return f.concat([word]); });
    setScore(function(s){ return s+pts; });
    setMsg('✅ +'+pts+' puan!');
    if(soundOn) playSound('correct');
    playHaptic('correct');
    setTimeout(function(){setMsg(null);},900);
    handleClearInput();
  }

  if(done){
    var rank = score>=200?'win':score>=80?'draw':'loss';
    return (
      <div style={{maxWidth:400,margin:'0 auto',padding:'40px 20px',textAlign:'center'}}>
        <div style={{fontSize:64,marginBottom:12}}>{score>=200?'🦅':score>=80?'🦉':'🐦'}</div>
        <h2 style={{fontSize:28,fontWeight:800,marginBottom:8}}>{score>=200?'Kelime Ustası!':score>=80?'Fena Değil!':'Devam Et!'}</h2>
        <div style={{fontSize:48,fontWeight:900,color:'#863bff',marginBottom:4}}>{score}</div>
        <div style={{color:'var(--text-secondary)',fontSize:15,marginBottom:16}}>puan · {found.length} kelime bulundu</div>
        {found.length>0&&<div style={{background:'var(--surface-hover)',borderRadius:12,padding:'12px 16px',marginBottom:20,maxHeight:120,overflowY:'auto',textAlign:'left'}}>
          <div style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',marginBottom:6}}>Bulunan kelimeler:</div>
          <div style={{fontSize:13,lineHeight:1.8}}>{found.join(', ')}</div>
        </div>}
        <button onClick={function(){onGameEnd(rank);}} style={{display:'block',width:'100%',padding:14,borderRadius:12,background:'linear-gradient(135deg,#863bff,#5b21b6)',color:'#fff',border:'none',fontWeight:700,fontSize:15,cursor:'pointer'}}>Bitir</button>
      </div>
    );
  }

  return (
    <div style={{maxWidth:440,margin:'0 auto',padding:'20px 16px'}}>
      {/* Header stats */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={{fontWeight:800,fontSize:30,color:timeLeft<=15?'#EF4444':'var(--text)',fontVariantNumeric:'tabular-nums'}}>{timeLeft}s</div>
        <div style={{textAlign:'center'}}><div style={{fontWeight:800,fontSize:22,color:'#0F766E'}}>{score}</div><div style={{fontSize:11,color:'var(--text-secondary)'}}>puan</div></div>
        <div style={{fontSize:14,color:'var(--text-secondary)',fontWeight:600}}>{found.length} kelime</div>
      </div>
      {/* Letter tiles — clickable */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:6,marginBottom:14}}>
        {letters.map(function(l,i){
          var isUsed = usedTiles.indexOf(i)!==-1;
          return (
            <button key={i} onClick={function(){ if(!isUsed) handleTileClick(l,i); }}
              disabled={isUsed}
              style={{height:44,display:'flex',alignItems:'center',justifyContent:'center',
                background:isUsed?'var(--surface-hover)':'var(--surface)',
                border:isUsed?'2px solid transparent':'2px solid #0F766E',
                borderRadius:10,fontWeight:800,fontSize:17,cursor:isUsed?'default':'pointer',
                color:isUsed?'var(--text-secondary)':'var(--text)',
                opacity:isUsed?0.35:1,
                transition:'all 0.1s',
                textDecoration:isUsed?'line-through':'none'
              }}>
              {l}
            </button>
          );
        })}
      </div>
      {/* Word assembly bar */}
      <div style={{background:'var(--surface)',border:'2px solid var(--border)',borderRadius:14,padding:'10px 14px',marginBottom:10,minHeight:48,display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
        <div style={{fontSize:18,fontWeight:700,letterSpacing:2,flex:1,color:input?'var(--text)':'var(--text-secondary)'}}>
          {input || <span style={{fontWeight:400,fontSize:14}}>Harf seç veya yaz...</span>}
        </div>
        {input&&(
          <div style={{display:'flex',gap:6}}>
            <button onClick={handleDeleteLast} style={{width:32,height:32,borderRadius:8,background:'var(--surface-hover)',border:'1px solid var(--border)',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>⌫</button>
            <button onClick={handleClearInput} style={{width:32,height:32,borderRadius:8,background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',cursor:'pointer',fontSize:14,fontWeight:700,color:'#EF4444',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
          </div>
        )}
      </div>
      {/* Submit + keyboard input */}
      <form onSubmit={handleSubmit} style={{display:'flex',gap:8,marginBottom:10}}>
        <input ref={inputRef} value={input} onChange={function(e){setInput(e.target.value);setUsedTiles([]);}}
          placeholder="Ya da klavyeyle yaz..."
          style={{flex:1,padding:'10px 14px',borderRadius:12,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:14,fontFamily:'inherit',outline:'none'}}
        />
        <button type="submit" style={{padding:'10px 18px',borderRadius:12,background:'linear-gradient(135deg,#0F766E,#2DD4BF)',color:'#fff',border:'none',fontWeight:800,fontSize:15,cursor:'pointer'}}>GİR</button>
      </form>
      {msg&&<div style={{textAlign:'center',fontSize:14,fontWeight:700,padding:'8px',borderRadius:10,background:'var(--surface-hover)',marginBottom:8,animation:'fadeUp 0.2s ease'}}>{msg}</div>}
      {found.length>0&&<div style={{fontSize:12,color:'var(--text-secondary)',textAlign:'center',marginTop:4}}>{found.slice(-5).join(' · ')}</div>}
    </div>
  );
}

// ============================================================
// EMOJI MUZAYEDE GAME
// ============================================================
var EMOJI_SORULAR = [
  { emoji:'🌹🔫', answer:'gülüm', hint:'Bir şarkı' },
  { emoji:'🐺🔴', answer:'kurtlar vadisi', hint:'Dizi/Film' },
  { emoji:'⭐🌊🌊', answer:'yıldız deniz', hint:'Şarkı' },
  { emoji:'🏠❤️', answer:'ev sevgisi', hint:'Deyim' },
  { emoji:'🐦🆓', answer:'kuş gibi özgür', hint:'Deyim' },
  { emoji:'🌙☀️', answer:'gece gündüz', hint:'Deyim' },
  { emoji:'💎🙌', answer:'elmas eller', hint:'Deyim' },
  { emoji:'🐍🪴', answer:'yılan hikayesi', hint:'Deyim' },
  { emoji:'👁️🗡️', answer:'göz kırpmak', hint:'Deyim' },
  { emoji:'🌹🌹🌹', answer:'güller', hint:'Şarkı / Dizi' },
  { emoji:'🔥💃', answer:'ateşli dans', hint:'İfade' },
  { emoji:'🎭🌃', answer:'gece maskesi', hint:'Film' },
  { emoji:'🦁👑', answer:'aslan kral', hint:'Film' },
  { emoji:'🌊🏃', answer:'dalgaları aş', hint:'İfade' },
  { emoji:'🌙⭐🌙', answer:'hilal', hint:'Sembol' },
  { emoji:'🎵❤️', answer:'aşk şarkısı', hint:'İfade' },
  { emoji:'🏔️⛅', answer:'dağ başını duman almış', hint:'Marş' },
  { emoji:'🐺🌕', answer:'kurt ay', hint:'Türk kültürü' },
  { emoji:'🌺🌸🌼', answer:'çiçek bahçesi', hint:'İfade' },
  { emoji:'🗡️⚖️', answer:'kılıç kalkan', hint:'Sembol' },
  { emoji:'🇹🇷❤️', answer:'türkiye sevgisi', hint:'Vatanseverlik' },
  { emoji:'☕📖', answer:'kahve kitap', hint:'Kültürel alışkanlık' },
  { emoji:'🌙⭐', answer:'ay yıldız', hint:'Türk bayrağı sembolü' },
  { emoji:'🎭🎪', answer:'tiyatro gösterisi', hint:'Sanat' },
  { emoji:'🏆⚽', answer:'şampiyon oldu', hint:'Spor' },
  { emoji:'🐪🏜️', answer:'deve çölü', hint:'Hayvan ve doğa' },
  { emoji:'🧿💙', answer:'nazar boncuğu', hint:'Türk geleneksel koruması' },
  { emoji:'🌺🌿', answer:'çiçek bahçe', hint:'Doğa' },
  { emoji:'🦅🔝', answer:'kartal zirve', hint:'Güç sembolü' },
  { emoji:'🎵🌙', answer:'gece müziği', hint:'İfade' },
  { emoji:'🏛️📜', answer:'tarih belgesi', hint:'Kültür' },
  { emoji:'🌊🏄', answer:'dalgasörfü', hint:'Spor' },
  { emoji:'🎯🏹', answer:'ok yay hedef', hint:'Geleneksel spor' },
  { emoji:'💫⭐✨', answer:'yıldızlar parlar', hint:'Doğa' },
  { emoji:'🦁🐯', answer:'aslan kaplan', hint:'Yabani hayvanlar' },
  { emoji:'🌋🔥', answer:'yanardağ ateşi', hint:'Doğa olayı' },
  { emoji:'🎪🎠', answer:'lunapark atlıkarınca', hint:'Eğlence' },
  { emoji:'🏔️❄️', answer:'karlı dağ', hint:'Doğa' },
  { emoji:'🌊💙🐬', answer:'deniz delfin', hint:'Deniz canlısı' },
  { emoji:'🎶🎸', answer:'müzik gitar', hint:'Enstrüman' },
];

function shuffle(arr) {
  var a=arr.slice();
  for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}
  return a;
}

function normalizeAnswer(s) {
  return s.toLowerCase()
    .replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ş/g,'s')
    .replace(/ç/g,'c').replace(/ö/g,'o').replace(/ü/g,'u')
    .replace(/\s+/g,' ').trim();
}

function EmojiMuzayedeGame({ game, onGameEnd, soundOn }) {
  var TOTAL_Q = 8;
  var Q_TIME = 15;
  var s1=useState(function(){ return shuffle(EMOJI_SORULAR).slice(0,TOTAL_Q); }); var questions=s1[0];
  var s2=useState(0); var qIdx=s2[0]; var setQIdx=s2[1];
  var s3=useState(Q_TIME); var timeLeft=s3[0]; var setTimeLeft=s3[1];
  var s4=useState(0); var score=s4[0]; var setScore=s4[1];
  var s5=useState(''); var input=s5[0]; var setInput=s5[1];
  var s6=useState(null); var feedback=s6[0]; var setFeedback=s6[1];
  var s7=useState(false); var done=s7[0]; var setDone=s7[1];
  var s8=useState(false); var showHint=s8[0]; var setShowHint=s8[1];
  var inputRef=useRef(null);
  var timeRef=useRef(timeLeft); timeRef.current=timeLeft;

  var q = questions[qIdx];

  useEffect(function(){
    if(done||feedback)return;
    var t=setInterval(function(){
      setTimeLeft(function(p){
        if(p<=1){
          clearInterval(t);
          advance(false);
          return Q_TIME;
        }
        return p-1;
      });
    },1000);
    return function(){clearInterval(t);};
  },[qIdx,done,!!feedback]);

  useEffect(function(){ if(inputRef.current&&!done&&!feedback)inputRef.current.focus(); },[qIdx,feedback]);

  function advance(correct) {
    var nextIdx = qIdx+1;
    if(correct) setScore(function(s){ return s + Math.ceil((timeRef.current/Q_TIME)*100); });
    setFeedback(correct?'correct':'wrong');
    setTimeout(function(){
      setFeedback(null);
      setInput('');
      setShowHint(false);
      if(nextIdx>=TOTAL_Q){ setDone(true); }
      else { setQIdx(nextIdx); setTimeLeft(Q_TIME); }
    },1100);
  }

  function handleSubmit(e) {
    e&&e.preventDefault();
    if(!input.trim()||feedback)return;
    var guess=normalizeAnswer(input);
    var ans=normalizeAnswer(q.answer);
    var correct = guess===ans || ans.indexOf(guess)!==-1 || (guess.length>4&&ans.indexOf(guess.substring(0,4))!==-1);
    advance(correct);
  }

  if(done){
    var maxScore=TOTAL_Q*100;
    var rank=score>=Math.ceil(maxScore*0.7)?'win':score>=Math.ceil(maxScore*0.4)?'draw':'loss';
    return (
      <div style={{maxWidth:400,margin:'0 auto',padding:'40px 20px',textAlign:'center'}}>
        <div style={{fontSize:64,marginBottom:12}}>{score>=Math.ceil(maxScore*0.7)?'🎭':score>=Math.ceil(maxScore*0.4)?'🤔':'😅'}</div>
        <h2 style={{fontSize:28,fontWeight:800,marginBottom:8}}>{score>=Math.ceil(maxScore*0.7)?'Mükemmel!':score>=Math.ceil(maxScore*0.4)?'İyi Oyun!':'Devam Et!'}</h2>
        <div style={{fontSize:48,fontWeight:900,color:'#863bff',marginBottom:4}}>{score}</div>
        <div style={{color:'var(--text-secondary)',fontSize:15,marginBottom:24}}>puan / {maxScore} maksimum</div>
        <button onClick={function(){onGameEnd(rank);}} style={{display:'block',width:'100%',padding:14,borderRadius:12,background:'linear-gradient(135deg,#863bff,#5b21b6)',color:'#fff',border:'none',fontWeight:700,fontSize:15,cursor:'pointer'}}>Bitir</button>
      </div>
    );
  }

  return (
    <div style={{maxWidth:400,margin:'0 auto',padding:'24px 20px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{fontWeight:800,fontSize:32,color:timeLeft<=5?'#EF4444':'var(--text)',fontVariantNumeric:'tabular-nums'}}>{timeLeft}s</div>
        <div style={{fontSize:13,color:'var(--text-secondary)',fontWeight:600}}>{qIdx+1} / {TOTAL_Q}</div>
        <div style={{fontWeight:800,fontSize:22,color:'#863bff'}}>{score}</div>
      </div>
      <div style={{textAlign:'center',padding:'32px 16px',background:feedback==='correct'?'rgba(52,211,153,0.1)':feedback==='wrong'?'rgba(248,113,113,0.1)':'var(--surface)',borderRadius:20,border:'2px solid '+(feedback==='correct'?'#34D399':feedback==='wrong'?'#F87171':'var(--border)'),marginBottom:18,transition:'all 0.2s'}}>
        <div style={{fontSize:52,letterSpacing:6,marginBottom:12}}>{q.emoji}</div>
        <div style={{fontSize:12,color:'var(--text-secondary)',fontWeight:600}}>{q.hint}</div>
        {showHint&&<div style={{fontSize:12,color:'#a855f7',marginTop:6}}>İpucu: {q.answer.charAt(0).toUpperCase()}...</div>}
      </div>
      {feedback ? (
        <div style={{textAlign:'center',fontSize:18,fontWeight:800,padding:16,borderRadius:12,background:feedback==='correct'?'rgba(52,211,153,0.15)':'rgba(248,113,113,0.15)',color:feedback==='correct'?'#34D399':'#F87171'}}>
          {feedback==='correct'?'✅ Doğru! +'+Math.ceil((timeLeft/Q_TIME)*100)+'p':'❌ '+q.answer}
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:10}}>
          <input ref={inputRef} value={input} onChange={function(e){setInput(e.target.value);}}
            placeholder="Cevabını yaz..."
            style={{padding:'14px 16px',borderRadius:12,border:'2px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:16,fontFamily:'inherit',outline:'none',textAlign:'center'}}
          />
          <div style={{display:'flex',gap:10}}>
            <button type="button" onClick={function(){setShowHint(true);}} style={{flex:1,padding:12,borderRadius:12,background:'var(--surface-hover)',color:'var(--text-secondary)',border:'1px solid var(--border)',fontWeight:600,fontSize:14,cursor:'pointer'}}>💡 İpucu</button>
            <button type="submit" style={{flex:2,padding:12,borderRadius:12,background:'linear-gradient(135deg,#863bff,#5b21b6)',color:'#fff',border:'none',fontWeight:700,fontSize:15,cursor:'pointer'}}>Cevapla →</button>
          </div>
        </form>
      )}
    </div>
  );
}

// ============================================================
// HIZ CARPIM GAME
// ============================================================
function genCarpimProblem(level) {
  var m = [5,9,12,15,20][Math.min(level||0,4)];
  var a = Math.floor(Math.random()*m)+2;
  var b = Math.floor(Math.random()*m)+2;
  return { a:a, b:b, answer:a*b };
}

function HizCarpimGame({ game, players, onGameEnd, soundOn }) {
  var TOTAL_TIME = 60;
  var s1=useState(TOTAL_TIME); var timeLeft=s1[0]; var setTimeLeft=s1[1];
  var s2=useState(0); var score=s2[0]; var setScore=s2[1];
  var s3=useState(function(){return genCarpimProblem(0);}); var problem=s3[0]; var setProblem=s3[1];
  var s4=useState(''); var input=s4[0]; var setInput=s4[1];
  var s5=useState(null); var flash=s5[0]; var setFlash=s5[1];
  var s6=useState(false); var done=s6[0]; var setDone=s6[1];
  var s7=useState(0); var streak=s7[0]; var setStreak=s7[1];
  var s8=useState(0); var best=s8[0]; var setBest=s8[1];
  var inputRef=useRef(null);
  var scoreRef=useRef(0); scoreRef.current=score;

  useEffect(function(){
    if(done)return;
    var t=setInterval(function(){
      setTimeLeft(function(p){ if(p<=1){clearInterval(t);setDone(true);return 0;} return p-1; });
    },1000);
    return function(){clearInterval(t);};
  },[done]);

  useEffect(function(){ if(inputRef.current&&!done)inputRef.current.focus(); });

  function handleChange(e){
    var val=e.target.value.replace(/[^0-9]/g,'');
    setInput(val);
    if(problem&&val!==''&&parseInt(val)===problem.answer){
      var ns=scoreRef.current+1;
      setScore(ns);
      setStreak(function(s){ var n=s+1; setBest(function(b){return n>b?n:b;}); return n; });
      setFlash('ok');
      setProblem(genCarpimProblem(Math.floor(ns/5)));
      setInput('');
      setTimeout(function(){setFlash(null);},280);
    }
  }

  function handleKeyDown(e){
    if(e.key==='Enter'&&input!==''&&problem&&parseInt(input)!==problem.answer){
      setFlash('err'); setStreak(0); setInput('');
      setTimeout(function(){setFlash(null);},280);
    }
  }

  if(done){
    var medal=score>=20?'🚀':score>=12?'🎯':score>=6?'💪':'🌱';
    var resultStr=score>=12?'win':score>=6?'draw':'loss';
    return (
      <div style={{maxWidth:400,margin:'0 auto',padding:'40px 20px',textAlign:'center'}}>
        <div style={{fontSize:64,marginBottom:12}}>{medal}</div>
        <h2 style={{fontSize:28,fontWeight:800,marginBottom:8}}>{score>=20?'Mükemmel!':score>=12?'Harika!':score>=6?'İyi Oyun!':'Devam Et!'}</h2>
        <div style={{fontSize:48,fontWeight:900,color:'#863bff',marginBottom:4}}>{score}</div>
        <div style={{color:'var(--text-secondary)',fontSize:15,marginBottom:best>=3?4:24}}>doğru cevap / 60 saniye</div>
        {best>=3&&<div style={{color:'#F59E0B',fontWeight:700,fontSize:14,marginBottom:20}}>🔥 En uzun seri: {best}</div>}
        <div style={{display:'flex',gap:12,marginTop:8}}>
          <button onClick={function(){onGameEnd(resultStr);}} style={{flex:1,padding:14,borderRadius:12,background:'linear-gradient(135deg,#863bff,#5b21b6)',color:'#fff',border:'none',fontWeight:700,fontSize:15,cursor:'pointer'}}>Bitir</button>
          <button onClick={function(){setScore(0);setTimeLeft(TOTAL_TIME);setDone(false);setInput('');setStreak(0);setBest(0);setProblem(genCarpimProblem(0));}} style={{flex:1,padding:14,borderRadius:12,background:'var(--surface-hover)',color:'var(--text)',border:'1px solid var(--border)',fontWeight:700,fontSize:15,cursor:'pointer'}}>Tekrar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{maxWidth:400,margin:'0 auto',padding:'24px 20px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:28}}>
        <div style={{fontWeight:800,fontSize:32,color:timeLeft<=10?'#EF4444':'var(--text)',transition:'color 0.3s',fontVariantNumeric:'tabular-nums'}}>{timeLeft}s</div>
        <div style={{textAlign:'center'}}><div style={{fontWeight:800,fontSize:24,color:'#863bff'}}>{score}</div><div style={{fontSize:11,color:'var(--text-secondary)'}}>doğru</div></div>
        <div style={{minWidth:60,textAlign:'right'}}>{streak>=3&&<div style={{fontWeight:700,fontSize:14,color:'#F59E0B'}}>🔥 {streak}</div>}</div>
      </div>
      <div style={{textAlign:'center',padding:'36px 20px',background:flash==='ok'?'rgba(52,211,153,0.12)':flash==='err'?'rgba(248,113,113,0.12)':'var(--surface)',borderRadius:20,border:'2px solid '+(flash==='ok'?'#34D399':flash==='err'?'#F87171':'var(--border)'),marginBottom:20,transition:'all 0.15s'}}>
        <div style={{fontSize:44,fontWeight:900,fontVariantNumeric:'tabular-nums',letterSpacing:'-0.02em'}}>{problem.a} × {problem.b} = ?</div>
      </div>
      <input ref={inputRef} type="number" inputMode="numeric" value={input} onChange={handleChange} onKeyDown={handleKeyDown} placeholder="Cevabı yaz..." style={{width:'100%',padding:'16px 20px',fontSize:24,fontWeight:700,textAlign:'center',borderRadius:14,border:'2px solid var(--border)',background:'var(--surface)',color:'var(--text)',outline:'none',fontVariantNumeric:'tabular-nums',boxSizing:'border-box'}}/>
      <div style={{fontSize:12,color:'var(--text-muted)',textAlign:'center',marginTop:8}}>Doğru cevabı yazınca otomatik geçer · Enter = yanlışı sil</div>
    </div>
  );
}

// ============================================================
// TARIH MI EFSANE MI? GAME
// ============================================================
var TARIH_QUESTIONS = [
  { text:"Türkiye, dünya fındık üretiminin %70'ini karşılar.", answer:true, exp:"Doğru! Türkiye dünyada lider." },
  { text:"Atatürk soyadını 1934'te Soyadı Kanunu ile aldı.", answer:true, exp:"Doğru! Meclis tarafından verildi." },
  { text:"Pamukkale travertenlerinde doğal sıcak su vardır.", answer:true, exp:"Doğru! 35-36°C termal su." },
  { text:"Türkiye kişi başı çay tüketiminde dünya birincisidir.", answer:true, exp:"Doğru! Yılda kişi başı ~3,5 kg." },
  { text:"Truva Savaşı Çanakkale yakınlarında geçer.", answer:true, exp:"Doğru! Hisarlık antik Truva'dır." },
  { text:"İstanbul fethindeki topların her biri 500 ton ağırlığındaydı.", answer:false, exp:"Yanlış. Devasa ama çok daha hafifti." },
  { text:"Türkçe ve Japonca aynı dil ailesinden gelir.", answer:false, exp:"Yanlış. Türkçe Türk, Japonca Japonik dil ailesinden." },
  { text:"Kapadokya peri bacaları volkanik tüf kayasından oluşur.", answer:true, exp:"Doğru! Milyonlarca yıl önceki volkanik aktivite." },
  { text:"Türkiye yüzölçümü ile Fransa'dan büyüktür.", answer:true, exp:"Doğru! 783K km² vs 644K km²." },
  { text:"Manisa Mesir Macunu Festivali UNESCO listesindedir.", answer:true, exp:"Doğru! Somut Olmayan Kültürel Miras." },
  { text:"İznik, Bizans döneminde kısa süre başkentlik yapmıştır.", answer:true, exp:"Doğru! Nikaia adıyla 4. yüzyılda merkez oldu." },
  { text:"Türkiye 2022 FIFA Dünya Kupası'na katıldı.", answer:false, exp:"Yanlış. Eleme turunda elenip katılamadı." },
  { text:"Sümela Manastırı Trabzon'da yer alır.", answer:true, exp:"Doğru! Dağın dikey kayalığına inşa edilmiş." },
  { text:"'Teşekkür' kelimesi Arapça kökenlidir.", answer:true, exp:"Doğru! Arapça 'şükür' kökünden gelir." },
  { text:"Türkiye 2022'de BM'e resmi adını 'Türkiye' olarak tescil ettirdi.", answer:true, exp:"Doğru! Daha önce İngilizce'de Turkey geçiyordu." },
  { text:"Ankara, Osmanlı döneminde de başkentlik yapmıştır.", answer:false, exp:"Yanlış. Osmanlı başkenti İstanbul'du." },
  { text:"Türk kahvesi UNESCO Somut Olmayan Kültürel Miras listesindedir.", answer:true, exp:"Doğru! 2013'te listeye alındı." },
  { text:"Efes Antik Kenti İzmir iline bağlıdır.", answer:true, exp:"Doğru! Selçuk ilçesinde yer alır." },
  { text:"Göbeklitepe, dünyanın bilinen en eski tapınak kompleksidir.", answer:true, exp:"Doğru! MÖ 10.000 — Şanlıurfa'da." },
  { text:"Türkiye Avrupa Birliği'ne resmi aday ülke statüsündedir.", answer:true, exp:"Doğru! 1999'dan beri resmi aday." },
];

function TarihEfsaneGame({ game, players, onGameEnd, soundOn }) {
  var TOTAL_Q=10; var QTIME=10;
  var s1=useState(function(){var arr=[...TARIH_QUESTIONS];for(var i=arr.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=arr[i];arr[i]=arr[j];arr[j]=t;}return arr.slice(0,TOTAL_Q);}); var questions=s1[0];
  var s2=useState(0); var qIdx=s2[0]; var setQIdx=s2[1];
  var s3=useState(0); var score=s3[0]; var setScore=s3[1];
  var s4=useState(false); var done=s4[0]; var setDone=s4[1];
  var s5=useState(null); var chosen=s5[0]; var setChosen=s5[1];
  var s6=useState(false); var revealed=s6[0]; var setRevealed=s6[1];
  var s7=useState(QTIME); var timeLeft=s7[0]; var setTimeLeft=s7[1];
  var q=questions[qIdx];

  useEffect(function(){
    if(done||revealed)return;
    var t=setInterval(function(){
      setTimeLeft(function(p){ if(p<=1){clearInterval(t);setRevealed(true);return 0;} return p-1; });
    },1000);
    return function(){clearInterval(t);};
  },[qIdx,done,revealed]);

  function handleAnswer(ans){
    if(revealed||chosen!==null)return;
    setChosen(ans); setRevealed(true);
    if(ans===q.answer) setScore(function(s){return s+1+Math.floor(timeLeft/3);});
  }

  function nextQ(){
    if(qIdx+1>=TOTAL_Q){setDone(true);}
    else{setQIdx(function(i){return i+1;});setChosen(null);setRevealed(false);setTimeLeft(QTIME);}
  }

  if(done){
    var max=TOTAL_Q*(1+Math.floor(QTIME/3));
    var pct=Math.round((score/max)*100);
    var medal=pct>=80?'🏆':pct>=50?'🎯':'📚';
    var result=pct>=60?'win':pct>=35?'draw':'loss';
    return (
      <div style={{maxWidth:420,margin:'0 auto',padding:'40px 20px',textAlign:'center'}}>
        <div style={{fontSize:64,marginBottom:12}}>{medal}</div>
        <h2 style={{fontSize:26,fontWeight:800,marginBottom:8}}>{pct>=80?'Tarih Dehası!':pct>=50?'Harika Bilgi!':'Daha Çok Oku!'}</h2>
        <div style={{fontSize:44,fontWeight:900,color:'#863bff',marginBottom:4}}>{score}</div>
        <div style={{color:'var(--text-secondary)',fontSize:15,marginBottom:24}}>puan · {TOTAL_Q} soru</div>
        <button onClick={function(){onGameEnd(result);}} style={{width:'100%',padding:14,borderRadius:12,background:'linear-gradient(135deg,#863bff,#5b21b6)',color:'#fff',border:'none',fontWeight:700,fontSize:16,cursor:'pointer'}}>Bitir</button>
      </div>
    );
  }

  return (
    <div style={{maxWidth:420,margin:'0 auto',padding:'20px 20px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <div style={{fontSize:12,color:'var(--text-secondary)',fontWeight:600}}>{qIdx+1}/{TOTAL_Q}</div>
        <div style={{fontWeight:800,fontSize:20,color:timeLeft<=3?'#EF4444':'var(--text)',fontVariantNumeric:'tabular-nums'}}>{timeLeft}s</div>
        <div style={{fontWeight:700,fontSize:14,color:'#863bff'}}>⭐ {score}</div>
      </div>
      <div style={{height:4,background:'var(--border)',borderRadius:999,marginBottom:20,overflow:'hidden'}}>
        <div style={{width:`${(timeLeft/QTIME)*100}%`,height:'100%',background:timeLeft<=3?'#EF4444':'#863bff',borderRadius:999,transition:'width 1s linear, background 0.3s'}}/>
      </div>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:'24px 20px',marginBottom:20,fontSize:16,fontWeight:600,lineHeight:1.5,textAlign:'center',minHeight:80}}>
        {q.text}
      </div>
      {!revealed?(
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <button onClick={function(){handleAnswer(true);}} style={{padding:'20px 16px',borderRadius:14,border:'2px solid #22c55e',background:'rgba(34,197,94,0.08)',color:'#22c55e',fontWeight:800,fontSize:17,cursor:'pointer'}}>✅ Tarih</button>
          <button onClick={function(){handleAnswer(false);}} style={{padding:'20px 16px',borderRadius:14,border:'2px solid #ef4444',background:'rgba(239,68,68,0.08)',color:'#ef4444',fontWeight:800,fontSize:17,cursor:'pointer'}}>❌ Efsane</button>
        </div>
      ):(
        <div>
          <div style={{padding:'14px 18px',borderRadius:14,background:chosen===q.answer?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',border:'1px solid '+(chosen===q.answer?'#22c55e':'#ef4444'),marginBottom:10,fontWeight:700,fontSize:15,color:chosen===q.answer?'#22c55e':'#ef4444',textAlign:'center'}}>
            {chosen===null?'⏱ Süre doldu!':chosen===q.answer?'✅ Doğru!':'❌ Yanlış'}
          </div>
          <div style={{padding:'12px 16px',borderRadius:12,background:'var(--surface-hover)',border:'1px solid var(--border)',marginBottom:14,fontSize:13,color:'var(--text-secondary)',lineHeight:1.5}}>{q.exp}</div>
          <button onClick={nextQ} style={{width:'100%',padding:14,borderRadius:12,background:'linear-gradient(135deg,#863bff,#5b21b6)',color:'#fff',border:'none',fontWeight:700,fontSize:15,cursor:'pointer'}}>
            {qIdx+1>=TOTAL_Q?'Sonuçları Gör':'Sonraki Soru →'}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [user, setUser] = useState(() => { try { const s = localStorage.getItem('oyunclub_user'); return s ? JSON.parse(s) : null; } catch { return null; } });
  const [page, setPage] = useState(() => { try { return localStorage.getItem('oyunclub_user') ? 'lobby' : 'login'; } catch { return 'login'; } });
  const [selectedGame, setSelectedGame] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [toast, setToast] = useState({ message: '', visible: false });
  const [soundOn, setSoundOn] = useState(() => { try { const s = localStorage.getItem('oyunclub_sound'); return s !== null ? s === 'true' : true; } catch { return true; } });
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('oyunclub_dark') === 'true'; } catch { return false; } });
  const [showAd, setShowAd] = useState(false);
  const [pendingGame, setPendingGame] = useState(null);
  const adGameCountRef = useRef(0);
  const [showHelp, setShowHelp] = useState(false);
  const [userAvatar, setUserAvatar] = useState(() => { try { return localStorage.getItem('oyunclub_avatar') || ''; } catch { return ''; } });
  const EMPTY_STATS = { xox:{played:0,wins:0,losses:0}, minesweeper:{played:0,wins:0,losses:0}, rps:{played:0,wins:0,losses:0}, memory:{played:0,wins:0,losses:0}, snake:{played:0,wins:0,losses:0}, '2048':{played:0,wins:0,losses:0}, wordle:{played:0,wins:0,losses:0}, connectfour:{played:0,wins:0,losses:0}, dama:{played:0,wins:0,losses:0}, sudoku:{played:0,wins:0,losses:0}, gomoku:{played:0,wins:0,losses:0}, reaction:{played:0,wins:0,losses:0}, mathduel:{played:0,wins:0,losses:0}, cardbattle:{played:0,wins:0,losses:0}, memorybattle:{played:0,wins:0,losses:0}, wordrace:{played:0,wins:0,losses:0}, mangala:{played:0,wins:0,losses:0}, simon:{played:0,wins:0,losses:0}, lightsout:{played:0,wins:0,losses:0}, brickbreaker:{played:0,wins:0,losses:0}, nim:{played:0,wins:0,losses:0}, hizcarpim:{played:0,wins:0,losses:0}, tarihefsan:{played:0,wins:0,losses:0}, kelimeav:{played:0,wins:0,losses:0}, emojimuz:{played:0,wins:0,losses:0}, tavla:{played:0,wins:0,losses:0}, kelimezinciri:{played:0,wins:0,losses:0}, deyimtamamla:{played:0,wins:0,losses:0}, sorugecesi:{played:0,wins:0,losses:0}, adamasmaca:{played:0,wins:0,losses:0}, stroop:{played:0,wins:0,losses:0} };
  const PROG_DEFAULTS = { xp: 0, level: 1, streak: { count: 0, lastPlayDate: null }, badges: {}, currentWinStreak: 0, bestWinStreak: 0, dailyStats: { date: null, played: 0, wins: 0 }, streakFreeze: { count: 1, weekUsed: null }, season: { num: 0, xp: 0, month: null } };
  const [stats, setStats] = useState(() => { try { const s = localStorage.getItem('oyunclub_stats'); if (s) { const p = JSON.parse(s); return { ...PROG_DEFAULTS, history: [], ...p, games: { ...EMPTY_STATS, ...(p.games || {}) } }; } } catch {} return { games: EMPTY_STATS, history: [], ...PROG_DEFAULTS }; });

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get('room');
    if (roomCode) {
      window.history.replaceState({}, '', window.location.pathname);
      setRoomId(roomCode);
      setPage('multiplayer');
    }
  }, [user]);

  useEffect(() => { if (user) localStorage.setItem('oyunclub_user', JSON.stringify(user)); else localStorage.removeItem('oyunclub_user'); }, [user]);
  useEffect(() => { localStorage.setItem('oyunclub_stats', JSON.stringify(stats)); }, [stats]);
  useEffect(() => { localStorage.setItem('oyunclub_dark', dark); }, [dark]);
  useEffect(() => { localStorage.setItem('oyunclub_sound', soundOn); }, [soundOn]);

  const [shareResult, setShareResult] = useState(null);
  const [floatingXP, setFloatingXP] = useState(null);
  const [profileInitialTab, setProfileInitialTab] = useState('profil');
  var sock = useSocket(user ? user.name : 'Oyuncu');

  const showToast = (msg) => {
    setToast({ message: msg, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  };

  const handleGameEnd = (result, opts) => {
    if (!selectedGame) return;
    const difficulty = (opts && opts.difficulty) || null;
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const gid = selectedGame.id;

    // Haptic feedback
    if (result === 'win') playHaptic('win');
    else if (result === 'loss') playHaptic('wrong');
    else playHaptic('tap');

    setStats((prev) => {
      const gs = { ...(prev.games?.[gid] || { played: 0, wins: 0, losses: 0 }) };
      gs.played++;
      if (result === 'win') gs.wins++;
      else if (result === 'loss') gs.losses++;

      const wsNow = result === 'win' ? (prev.currentWinStreak || 0) + 1 : 0;
      const bestWs = Math.max(prev.bestWinStreak || 0, wsNow);
      const xpGain = calcXpGain(result, wsNow, difficulty);
      const newXp = (prev.xp || 0) + xpGain;
      const newLevel = getLevelInfo(newXp).level;

      // Streak with freeze auto-apply
      const prevS = prev.streak || { count: 0, lastPlayDate: null };
      const prevFreeze = prev.streakFreeze || { count: 1, weekUsed: null };
      let newStreak = { ...prevS };
      let newFreeze = { ...prevFreeze };
      if (prevS.lastPlayDate !== today) {
        const isConsecutive = prevS.lastPlayDate === yesterday;
        if (!isConsecutive && prevS.lastPlayDate !== null) {
          // Streak would break — auto-apply freeze if available
          const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          const weekKey = weekStart.toDateString();
          if ((prevFreeze.count || 0) > 0 && prevFreeze.weekUsed !== weekKey) {
            newStreak.count = (prevS.count || 0) + 1;
            newStreak.lastPlayDate = today;
            newFreeze = { count: (prevFreeze.count || 1) - 1, weekUsed: weekKey };
            setTimeout(() => showToast('🛡️ Seri kalkanı kullanıldı! Serin korundu.'), 600);
          } else {
            newStreak.count = 1;
            newStreak.lastPlayDate = today;
          }
        } else {
          newStreak.count = isConsecutive ? (prevS.count || 0) + 1 : 1;
          newStreak.lastPlayDate = today;
        }
      }

      // Recharge freeze weekly
      const weekStart2 = new Date(); weekStart2.setDate(weekStart2.getDate() - weekStart2.getDay());
      const weekKey2 = weekStart2.toDateString();
      if (newFreeze.weekUsed !== weekKey2 && newFreeze.count === 0) {
        newFreeze = { count: 1, weekUsed: null };
      }

      const prevDs = prev.dailyStats || { date: null, played: 0, wins: 0 };
      const newDs = prevDs.date === today
        ? { ...prevDs, played: prevDs.played + 1, wins: prevDs.wins + (result === 'win' ? 1 : 0) }
        : { date: today, played: 1, wins: result === 'win' ? 1 : 0 };

      // Season XP — monthly reset
      const curMonth = new Date().toISOString().slice(0,7); // "2026-07"
      const prevSeason = prev.season || { num: 0, xp: 0, month: null };
      let newSeason;
      if (prevSeason.month === curMonth) {
        newSeason = { ...prevSeason, xp: (prevSeason.xp || 0) + xpGain };
      } else {
        newSeason = { num: (prevSeason.num || 0) + 1, xp: xpGain, month: curMonth };
      }

      const draft = {
        ...prev,
        games: { ...prev.games, [gid]: gs },
        history: [...(prev.history || []).slice(-100), { gameId: gid, result }],
        xp: newXp,
        level: newLevel,
        streak: newStreak,
        streakFreeze: newFreeze,
        currentWinStreak: wsNow,
        bestWinStreak: bestWs,
        badges: prev.badges || {},
        dailyStats: newDs,
        season: newSeason,
      };

      const nb = checkNewBadges(draft);
      if (nb.length) {
        const bm = { ...draft.badges };
        nb.forEach(b => { bm[b.id] = true; });
        draft.badges = bm;
        setTimeout(() => showToast(`🏅 Yeni rozet: ${nb[0].icon} ${nb[0].name}`), 2000);
      }
      if (newLevel > (prev.level || 1)) {
        const lvl = XP_LEVELS.find(l => l.level === newLevel);
        setTimeout(() => showToast(`${lvl?.icon || '⬆️'} Seviye ${newLevel}: ${lvl?.name}!`), 1200);
      }
      setTimeout(() => showToast(`+${xpGain} XP${wsNow >= 3 ? ' 🔥 Seri!' : ''}`), 400);

      return draft;
    });

    const xpGain = calcXpGain(result, stats.currentWinStreak || 0, difficulty);
    const gameName = selectedGame.name;
    const gameToReplay = selectedGame;
    // Hemen lobby'ye geç — oyun ekranı kapansın, çift çağrı önlensin
    setPage('lobby');
    setSelectedGame(null);
    setTimeout(() => {
      setShareResult({ gameName, result, xpGain, game: gameToReplay });
      setFloatingXP(xpGain);
    }, 400);
  };

  const handleLogin = (userData) => {
    setUser(userData);
    setPage('lobby');
    // Welcome bonus for brand-new users (no existing stats)
    try {
      const existing = localStorage.getItem('oyunclub_stats');
      if (!existing) {
        const welcomeXp = 50;
        setStats((prev) => {
          const newBadges = { ...prev.badges, welcome: true };
          return { ...prev, xp: (prev.xp || 0) + welcomeXp, badges: newBadges };
        });
        setTimeout(() => showToast('🎉 Hoş geldin! +50 XP ve Hoş Geldin rozeti kazandın!'), 800);
      }
    } catch(e) {}
  };
  const launchGame = (game) => {
    const fullGame = GAMES.find(g => g.id === game.id) || game;
    setSelectedGame(fullGame);
    const id = generateRoomId();
    setRoomId(id);
    setPlayers([user.name]);
    setPage('game');
  };
  const handleSelectGame = (game) => {
    adGameCountRef.current += 1;
    const shouldShowAd = adGameCountRef.current === 1 || adGameCountRef.current % AD_INTERVAL === 1;
    if (shouldShowAd) {
      setPendingGame(game);
      setShowAd(true);
    } else {
      launchGame(game);
    }
  };
  const handleGoOnline = (gameId) => {
    const fullGame = GAMES.find(g => g.id === gameId);
    if (fullGame) setSelectedGame(fullGame);
    setPage('multiplayer');
  };
  const handleStartGame = () => {
    if (selectedGame.players > 1 && players.length < selectedGame.players)
      setPlayers((p) => [...p, 'Bot 🤖']);
    setPage('game');
  };
  const handleCopyLink = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(roomId);
    showToast(`Oda kodu kopyalandı: ${roomId}`);
  };
  const handleJoinRoom = (code) => {
    setPage('multiplayer');
    setRoomId(code);
  };
  const handleBack = () => {
    if (page === 'game') {
      // Only go to room for online multiplayer setup, not local 2-player games
      if (selectedGame?.online && players.length > 1 && page !== 'game') setPage('room');
      else {
        setPage('lobby');
        setSelectedGame(null);
      }
    } else if (page === 'room') {
      setPage('lobby');
      setSelectedGame(null);
    } else setPage('lobby');
  };
  const handleHome = () => {
    setPage('lobby');
    setSelectedGame(null);
  };

  if (page === 'login' || !user)
    return (
      <>
        <GlobalStyle dark={dark} />
        <LoginPage
          onLogin={handleLogin}
          dark={dark}
          onToggleDark={() => setDark((d) => !d)}
        />
      </>
    );

  const renderGame = () => {
    switch (selectedGame?.id) {
      case 'xox':
        return (
          <XOXGame
            game={selectedGame}
            players={players}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
            onGoOnline={() => handleGoOnline('xox')}
          />
        );
      case 'minesweeper':
        return (
          <MinesweeperGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
            dark={dark}
          />
        );
      case 'rps':
        return (
          <RPSGame
            game={selectedGame}
            players={players}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
            onGoOnline={() => handleGoOnline('rps')}
          />
        );
      case 'memory':
        return (
          <MemoryGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'snake':
        return (
          <SnakeGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
            dark={dark}
          />
        );
      case '2048':
        return (
          <Game2048
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'wordle':
        return (
          <WordleGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'connectfour':
        return (
          <ConnectFourGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
            onGoOnline={() => handleGoOnline('connectfour')}
          />
        );
      case 'dama':
        return (
          <DamaGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'sudoku':
        return (
          <SudokuGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'gomoku':
        return (
          <GomokuGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
            onGoOnline={() => handleGoOnline('gomoku')}
          />
        );
      case 'reaction':
        return (
          <ReactionGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
            onGoOnline={() => handleGoOnline('reaction')}
          />
        );
      case 'mathduel':
        return (
          <MathDuelGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
            onGoOnline={() => handleGoOnline('mathduel')}
          />
        );
      case 'cardbattle':
        return (
          <CardBattleGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
            onGoOnline={() => handleGoOnline('cardbattle')}
          />
        );
      case 'memorybattle':
        return (
          <MemoryBattleGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
            onGoOnline={() => handleGoOnline('memorybattle')}
          />
        );
      case 'wordrace':
        return (
          <WordRaceGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
            onGoOnline={() => handleGoOnline('wordrace')}
          />
        );
      case 'mangala':
        return (
          <MangalaGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'simon':
        return (
          <SimonGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'lightsout':
        return (
          <LightsOutGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'brickbreaker':
        return (
          <BrickBreakerGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'nim':
        return (
          <NimGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'hizcarpim':
        return (
          <HizCarpimGame
            game={selectedGame}
            players={players}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'tarihefsan':
        return (
          <TarihEfsaneGame
            game={selectedGame}
            players={players}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'kelimeav':
        return (
          <KelimeAvciGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'emojimuz':
        return (
          <EmojiMuzayedeGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'tavla':
        return (
          <TavlaGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'kelimezinciri':
        return (
          <KelimeZinciriGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'deyimtamamla':
        return (
          <DeyimTamamlaGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'sorugecesi':
        return (
          <SoruGecesiGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'adamasmaca':
        return (
          <AdamAsmacaGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      case 'stroop':
        return (
          <StroopTestiGame
            game={selectedGame}
            onGameEnd={handleGameEnd}
            soundOn={soundOn}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <GlobalStyle dark={dark} />
      {floatingXP && <FloatingXP xp={floatingXP} onDone={() => setFloatingXP(null)} />}

      {/* Friend Toast */}
      {sock && sock.friendToast && (
        <div style={{ position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 9000, background: 'linear-gradient(135deg,#1e1b4b,#312e81)', color: '#fff', borderRadius: 14, padding: '12px 20px', fontSize: 14, fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', border: '1px solid rgba(134,59,255,0.4)', maxWidth: 320, textAlign: 'center', animation: 'fadeUp 0.3s ease', whiteSpace: 'nowrap' }}>
          {sock.friendToast}
        </div>
      )}

      {/* Game Invite Modal */}
      {sock && sock.gameInvite && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 32, maxWidth: 320, width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', border: '1px solid var(--border)', animation: 'fadeUp 0.3s ease' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎮</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Oyun Daveti!</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
              <strong style={{ color: 'var(--text)' }}>{sock.gameInvite.fromName}</strong> seni bir oyuna bekliyor
              {sock.gameInvite.gameId && <span> — <strong>{sock.gameInvite.gameId}</strong></span>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { sock.clearGameInvite(); }}
                style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                Reddet
              </button>
              <button onClick={() => {
                const invite = sock.gameInvite;
                sock.clearGameInvite();
                if (invite.roomId) {
                  window.location.hash = '#room=' + invite.roomId;
                  window.location.reload();
                }
              }}
                style={{ flex: 2, padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#863bff,#5b21b6)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                ✓ Kabul Et
              </button>
            </div>
          </div>
        </div>
      )}

      {shareResult && (
        <ShareResultOverlay
          gameName={shareResult.gameName}
          result={shareResult.result}
          xpGain={shareResult.xpGain}
          onClose={() => setShareResult(null)}
          onReplay={shareResult.game ? () => { setShareResult(null); handleSelectGame(shareResult.game); } : undefined}
          stats={stats}
        />
      )}
      {showAd && pendingGame && (
        <AdOverlay onClose={() => {
          setShowAd(false);
          launchGame(pendingGame);
          setPendingGame(null);
        }} />
      )}
      {showHelp && selectedGame && (
        <HelpModal gameId={selectedGame.id} onClose={() => setShowHelp(false)} />
      )}
      {page === 'game' && selectedGame && GAME_HELP[selectedGame.id] && (
        <button
          onClick={() => setShowHelp(true)}
          style={{
            position: 'fixed', bottom: 80, right: 16, zIndex: 500,
            width: 44, height: 44, borderRadius: '50%',
            background: 'linear-gradient(135deg,#863bff,#5b21b6)',
            color: '#fff', fontSize: 20, fontWeight: 800,
            border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(134,59,255,0.5)',
          }}
        >?</button>
      )}
      <div
        className={user && !['login', 'game'].includes(page) ? 'main-content' : ''}
        style={{
          minHeight: '100vh',
          background: 'var(--bg)',
          transition: 'background 0.3s ease',
        }}
      >
        <Header
          user={user}
          onBack={handleBack}
          showBack={
            !['lobby', 'profile', 'leaderboard', 'multiplayer'].includes(page)
          }
          onProfile={() => setPage('profile')}
          onProfileTab={(tab) => { setProfileInitialTab(tab); setPage('profile'); }}
          onLeaderboard={() => setPage('leaderboard')}
          onMultiplayer={() => setPage('multiplayer')}
          onHome={handleHome}
          dark={dark}
          onToggleDark={() => setDark((d) => !d)}
        />
        {user && !['login', 'game'].includes(page) && (
          <BottomNav
            page={page}
            onLobby={() => setPage('lobby')}
            onMultiplayer={() => setPage('multiplayer')}
            onLeaderboard={() => setPage('leaderboard')}
            onProfile={() => setPage('profile')}
            onFriends={() => { setProfileInitialTab('arkadaşlar'); setPage('profile'); }}
            friendRequestCount={sock ? (sock.friendRequests || []).length : 0}
          />
        )}
        {page === 'lobby' && (
          <Lobby
            onSelectGame={handleSelectGame}
            onJoinRoom={handleJoinRoom}
            onMultiplayer={() => setPage('multiplayer')}
            user={user}
            stats={stats}
            sock={sock}
            onGoFriends={() => { setProfileInitialTab('arkadaşlar'); setPage('profile'); }}
          />
        )}
        {page === 'profile' && (
          <ProfilePage
            user={user}
            stats={stats}
            userAvatar={userAvatar}
            initialTab={profileInitialTab}
            sock={sock}
            onAvatarChange={(e) => { setUserAvatar(e); try { localStorage.setItem('oyunclub_avatar', e); } catch {} }}
            onLogout={() => {
              setUser(null);
              setPage('login');
              setSelectedGame(null);
              setRoomId(null);
              localStorage.removeItem('oyunclub_user');
            }}
            soundOn={soundOn}
            onToggleSound={() => { setSoundOn((s) => !s); try { localStorage.setItem('oyunclub_sound', String(!soundOn)); } catch {} }}
            dark={dark}
            onToggleDark={() => setDark((d) => !d)}
            onRenameUser={(newName) => {
              const updated = { ...user, name: newName };
              setUser(updated);
              try { localStorage.setItem('oyunclub_user', JSON.stringify(updated)); } catch {}
            }}
            onResetStats={() => {
              const empty = { games: Object.fromEntries(Object.keys(stats.games).map((k) => [k, { played: 0, wins: 0, losses: 0 }])), history: [] };
              setStats(empty);
              try { localStorage.removeItem('oyunclub_stats'); } catch {}
            }}
          />
        )}
        {page === 'leaderboard' && (
          <LeaderboardPage user={user} stats={stats} />
        )}
        {/* MultiplayerLobby her zaman mount'lu — odanın kapanmaması için */}
        <div style={{ display: page === 'multiplayer' ? 'block' : 'none' }}>
          <MultiplayerLobby
            initialCode={roomId}
            initialGame={selectedGame?.id}
            userName={user ? user.name : ''}
            onSelectGame={handleSelectGame}
            active={page === 'multiplayer'}
            sock={sock}
          />
        </div>
        {page === 'room' && selectedGame && (
          <RoomLobby
            game={selectedGame}
            roomId={roomId}
            players={players}
            onStart={handleStartGame}
            onCopyLink={handleCopyLink}
          />
        )}
        {page === 'game' && selectedGame && renderGame()}
      </div>
      <Toast message={toast.message} visible={toast.visible} />
      <SoundToggle
        soundOn={soundOn}
        onToggle={() => {
          setSoundOn((s) => !s);
          playSound('click');
        }}
      />
    </>
  );
}
