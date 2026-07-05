import { useState, useEffect, useCallback, useRef } from 'react';

var BACKEND_URL = 'https://oyun-club-backend-production.up.railway.app';
 
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
          socket.on('friend_request_received', function(data) {
            setFriendRequests(function(prev) { return prev.concat([data]); });
            setFriendToast('🤝 ' + data.fromName + ' arkadaşlık isteği gönderdi!');
            setTimeout(function(){ setFriendToast(null); }, 4000);
          });
          socket.on('friend_accepted', function(data) {
            setFriendList(function(prev) { return prev.concat([{userId:data.userId,name:data.name,online:true}]); });
            setFriendToast('✅ ' + data.name + ' arkadaşlık isteğini kabul etti!');
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
        setFriendRequests(res.requests || []);
      }
      if (cb) cb(res);
    });
  }, []);

  var sendFriendRequest = useCallback(function(toUserId, cb) {
    if (!socketRef.current) return;
    socketRef.current.emit('friend_request', { toUserId }, cb || function(){});
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

  var sock = useSocket(username);

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
    ['ENTER','Z','X','C','V','B','N','M','Ö','Ç','⌫'],
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
    if (k === 'ENTER') { submitGuess(); return; }
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
    if (selected === null || won) return;
    const idx = selected;
    if (initial[idx] !== 0) return;
    const nv = [...values];
    nv[idx] = num;
    if (soundOn) playSound('place');
    setValues(nv);
    const errs = checkErrors(nv);
    setErrors(errs);
    if (nv.every((v, i) => v === sol[i])) {
      setWon(true);
      if (soundOn) playSound('win');
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
  };

  const selR = selected !== null ? Math.floor(selected/9) : -1;
  const selC = selected !== null ? selected%9 : -1;
  const selB = selected !== null ? getBoxIdx(selR, selC) : -1;

  return (
    <div style={{ maxWidth: 380, margin: '0 auto', padding: '16px 12px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 24 }}>🔲 Sudoku</h2>
        <Button onClick={restart} style={{ fontSize: 13, padding: '6px 12px' }}>Yeni</Button>
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
        <span style={{fontSize:13,color:'var(--text-secondary)'}}>Tur {round}/{MAX} · P1:{scores[0]} P2:{scores[1]}</span>
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
        <span style={{fontSize:13,color:'var(--text-secondary)'}}>Tur {ri+1}/{RACE_WORDS.length} · P1:{scores[0]} P2:{scores[1]}</span>
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
        P1: {hazne[0]} taş &nbsp;|&nbsp; P2: {hazne[1]} taş
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
// genre: 'strateji' | 'hız' | 'hafıza' | 'kelime'
const GAMES = [
  {
    id: 'xox',
    name: 'XOX',
    desc: 'Klasik Tic-Tac-Toe',
    icon: '✕○',
    players: 2,
    genre: 'strateji',
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
    genre: 'strateji',
    color: '#457B9D',
    bg: 'linear-gradient(135deg, #457B9D 0%, #48CAE4 100%)',
  },
  {
    id: 'sudoku',
    name: 'Sudoku',
    desc: 'Rakamları yerleştir',
    icon: '🔲',
    players: 1,
    genre: 'strateji',
    color: '#7C3AED',
    bg: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',
  },
  {
    id: 'dama',
    name: 'Dama',
    desc: 'Türk Dama - Bota karşı oyna',
    icon: '⚫',
    players: 1,
    genre: 'strateji',
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
    color: '#059669',
    bg: 'linear-gradient(135deg, #059669 0%, #34D399 100%)',
  },
  {
    id: '2048',
    name: '2048',
    desc: "Sayıları birleştir, 2048'e ulaş",
    icon: '🔢',
    players: 1,
    genre: 'strateji',
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
    color: '#538D4E',
    bg: 'linear-gradient(135deg, #538D4E 0%, #6AAF5E 100%)',
  },
  {
    id: 'mangala',
    name: 'Mangala',
    desc: 'Türklerin binlerce yıllık geleneksel taş oyunu',
    icon: '🪨',
    players: 2,
    local: true,
    genre: 'strateji',
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
    genre: 'strateji',
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
    genre: 'strateji',
    color: '#065F46',
    bg: 'linear-gradient(135deg, #065F46 0%, #6EE7B7 100%)',
  },
];

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
}) => (
  <header
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 20px',
      background: 'var(--header-bg)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      transition: 'background 0.3s ease',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
            padding: 4,
            color: 'var(--text)',
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
          fontSize: 20,
          letterSpacing: '-0.5px',
          cursor: 'pointer',
        }}
      >
        oyun<span style={{ color: '#E63946' }}>.</span>club
      </span>
    </div>
    {user && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={onToggleDark}
          title={dark ? 'Açık Mod' : 'Karanlık Mod'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            padding: '6px 10px',
            borderRadius: 8,
            transition: 'var(--transition)',
            color: 'var(--text)',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = 'var(--surface-hover)')
          }
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          {dark ? '☀️' : '🌙'}
        </button>
        <button
          onClick={onMultiplayer}
          title="Multiplayer"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            padding: '6px 10px',
            borderRadius: 8,
            transition: 'var(--transition)',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = 'var(--surface-hover)')
          }
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          🎮
        </button>
        <button
          onClick={onLeaderboard}
          title="Skor Tablosu"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            padding: '6px 10px',
            borderRadius: 8,
            transition: 'var(--transition)',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = 'var(--surface-hover)')
          }
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          🏆
        </button>
        <button
          onClick={onProfile}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 8px',
            borderRadius: 50,
            transition: 'var(--transition)',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = 'var(--surface-hover)')
          }
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          <Avatar name={user.name} size={32} />
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              maxWidth: 100,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user.name}
          </span>
        </button>
      </div>
    )}
  </header>
);

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

  const doSearch = () => {
    if (!searchQ.trim() || searchQ.trim().length < 2) return setSearchMsg('En az 2 karakter gir');
    setLoading(true); setSearchMsg('');
    sock.searchUser(searchQ.trim(), (res) => {
      setLoading(false);
      setSearchResults((res?.results || []).filter(u => u.userId !== myUserId));
      if (!res?.results?.length) setSearchMsg('Kullanıcı bulunamadı');
    });
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

const ProfilePage = ({ user, stats, onLogout, userAvatar, onAvatarChange, sock }) => {
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const totalGames = Object.values(stats.games).reduce(
    (a, g) => a + g.played,
    0
  );
  const totalWins = Object.values(stats.games).reduce((a, g) => a + g.wins, 0);
  const winRate =
    totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;
  const rank = getRank(totalWins);

  return (
    <div
      style={{
        maxWidth: 520,
        margin: '0 auto',
        padding: '32px 20px',
        animation: 'fadeUp 0.4s ease',
      }}
    >
      <Card
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
      </Card>

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

      {sock && sock.myUserId && (
        <Card style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Arkadaşlar
          </div>
          <FriendPanel sock={sock} myUserId={sock.myUserId} />
        </Card>
      )}

      <Button variant="danger" onClick={onLogout} style={{ width: '100%' }}>
        Çıkış Yap
      </Button>
    </div>
  );
};

// ============================================================
// LEADERBOARD PAGE (per-game)
// ============================================================
const FAKE_LB = {};

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
    {
      name: user.name,
      played: userGameStats.played,
      wins: userGameStats.wins,
      avatar: 2,
    },
  ].sort((a, b) => b.wins - a.wins);
  const userRank = allPlayers.findIndex((p) => p.name === user.name) + 1;

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
              {userGameStats.played} oyun • {userGameStats.wins}G /{' '}
              {userGameStats.losses}M
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
            #{userRank}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>sıralama</div>
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
// LOBBY
// ============================================================
const GAME_ICONS_MAP = {
  xox: '❌⭕', rps: '✊✋✌️', connectfour: '🔵', gomoku: '⚫',
  reaction: '⚡', mathduel: '🧮', cardbattle: '🃏', memorybattle: '🧠', wordrace: '🔤'
};

const Lobby = ({ onSelectGame, onJoinRoom, user, stats }) => {
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [publicRooms, setPublicRooms] = useState([]);
  const [filterPlayers, setFilterPlayers] = useState('all');
  const [filterGenre, setFilterGenre] = useState('all');

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

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px' }}>
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
          <span style={{padding:'2px 10px',borderRadius:20,background:'rgba(134,59,255,0.12)',color:'#863bff',fontWeight:600,fontSize:12}}>{getRank(totalWins).icon} {getRank(totalWins).label}</span>
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
          <div style={{ textAlign: 'center', padding: '18px 12px', background: 'var(--surface)', borderRadius: 12, border: '1px dashed var(--border)', color: 'var(--text-secondary)', fontSize: 13 }}>
            Şu an açık masa yok — Çok Oyunculu'dan masa oluşturabilirsin!
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {publicRooms.slice(0, 15).map(function(room) {
              const isFull = room.players >= room.maxPlayers;
              return (
                <div key={room.id} style={{ display: 'flex', flexDirection: 'column', padding: '12px 10px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', gap: 5, opacity: isFull ? 0.6 : 1 }}>
                  <div style={{ fontSize: 20, textAlign: 'center' }}>{GAME_ICONS_MAP[room.gameId] || '🎮'}</div>
                  <div style={{ fontWeight: 700, fontSize: 11, textAlign: 'center', lineHeight: 1.2 }}>{room.gameName}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', textAlign: 'center' }}>{room.hostName}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', textAlign: 'center' }}>
                    <span style={{ color: isFull ? '#ef4444' : '#22c55e', fontWeight: 600 }}>{room.players}</span>/{room.maxPlayers}
                  </div>
                  <button
                    onClick={function() { if (!isFull) onJoinRoom(room.id); }}
                    disabled={isFull}
                    style={{ padding: '7px 4px', borderRadius: 8, border: 'none', background: !isFull ? '#6366f1' : '#ccc', color: '#fff', fontWeight: 700, fontSize: 11, cursor: isFull ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                    {isFull ? 'Dolu' : 'Katıl →'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ marginBottom: 20 }}>
        {/* Player count filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tümü', count: GAMES.length },
            { key: 1, label: '👤 Tek Kişilik', count: GAMES.filter(g => g.players === 1).length },
            { key: 2, label: '👥 2 Kişilik', count: GAMES.filter(g => g.players === 2).length },
          ].map(function(f) {
            const active = filterPlayers === f.key;
            return (
              <button key={f.key} onClick={function() { setFilterPlayers(f.key); setFilterGenre('all'); }}
                style={{ padding: '7px 14px', borderRadius: 20, border: active ? 'none' : '1px solid var(--border)', background: active ? 'var(--accent)' : 'var(--surface)', color: active ? '#fff' : 'var(--text)', fontWeight: active ? 700 : 500, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s' }}>
                {f.label} <span style={{ opacity: 0.7, fontSize: 11 }}>{f.count}</span>
              </button>
            );
          })}
        </div>
        {/* Genre filter */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: '🎮 Hepsi' },
            { key: 'strateji', label: '♟️ Strateji' },
            { key: 'hız', label: '⚡ Hız' },
            { key: 'hafıza', label: '🧠 Hafıza' },
            { key: 'kelime', label: '🔤 Kelime' },
          ].map(function(f) {
            const active = filterGenre === f.key;
            return (
              <button key={f.key} onClick={function() { setFilterGenre(f.key); }}
                style={{ padding: '5px 12px', borderRadius: 16, border: active ? 'none' : '1px solid var(--border)', background: active ? '#6366f1' : 'var(--surface)', color: active ? '#fff' : 'var(--text-secondary)', fontWeight: active ? 700 : 400, fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s' }}>
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Game grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {GAMES.filter(function(g) {
          if (filterPlayers !== 'all' && g.players !== filterPlayers) return false;
          if (filterGenre !== 'all' && g.genre !== filterGenre) return false;
          return true;
        }).map(function(game, i) {
          const gs = stats.games[game.id];
          return (
            <Card
              key={game.id}
              onClick={() => onSelectGame(game)}
              hoverable
              style={{ padding: 0, overflow: 'hidden', animation: 'fadeUp 0.4s ease', animationDelay: `${i * 0.05}s`, animationFillMode: 'both' }}
            >
              <div style={{ background: game.bg, padding: '20px 16px', color: '#fff', position: 'relative', overflow: 'hidden', minHeight: 80 }}>
                <div style={{ position: 'absolute', right: -8, top: -8, fontSize: 64, opacity: 0.15, fontWeight: 800 }}>{game.icon}</div>
                <span style={{ fontSize: 28, display: 'block', marginBottom: 2 }}>{game.icon}</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  <span style={{ fontSize: 10, background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '2px 6px' }}>
                    {game.players === 1 ? '👤 Tek' : '👥 2 Kişi'}
                  </span>
                  <span style={{ fontSize: 10, background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '2px 6px', textTransform: 'capitalize' }}>
                    {game.genre === 'strateji' ? '♟️' : game.genre === 'hız' ? '⚡' : game.genre === 'hafıza' ? '🧠' : '🔤'} {game.genre}
                  </span>
                </div>
              </div>
              <div style={{ padding: '12px 14px' }}>
                <h3 style={{ fontFamily: "'Sora', sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{game.name}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: 0 }}>{game.desc}</p>
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

  // Simple bot: win > block > center > corner > random
  const botMove = useCallback((b) => {
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

  const applyMove = useCallback((nb, currentIsX) => {
    const r = checkWinner(nb);
    if (r) {
      setWinner(r.winner); setWinLine(r.line);
      if (r.winner === 'draw') { setScores(s=>({...s,draw:s.draw+1})); onGameEnd('draw'); }
      else if (r.winner === 'X') { setScores(s=>({...s,x:s.x+1})); onGameEnd('win'); if(soundOn)playSound('win'); setShowConfetti(true); setTimeout(()=>setShowConfetti(false),2000); }
      else { setScores(s=>({...s,o:s.o+1})); onGameEnd('loss'); if(soundOn)playSound('lose'); }
      return true;
    }
    return false;
  }, [checkWinner, onGameEnd, soundOn]);

  const handleClick = (i) => {
    if (!mode || board[i] || winner || botThinking) return;
    if (mode === 'bot' && !isX) return; // O = bot's turn
    if (soundOn) playSound('place');
    const nb = [...board]; nb[i] = isX ? 'X' : 'O';
    setBoard(nb);
    const finished = applyMove(nb, isX);
    if (!finished) {
      setIsX(!isX);
      if (mode === 'bot') {
        setBotThinking(true);
        setTimeout(() => {
          const bi = botMove(nb);
          if (bi !== undefined) {
            const nb2 = [...nb]; nb2[bi] = 'O';
            setBoard(nb2);
            applyMove(nb2, false);
            setIsX(true);
          }
          setBotThinking(false);
        }, 400);
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
        <button onClick={()=>setMode('bot')} style={{padding:'16px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#E63946,#F4845F)',color:'#FFF',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>🤖 Bota Karşı</button>
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

function AdOverlay({ onClose }) {
  const [seconds, setSeconds] = React.useState(5);
  const [adLoaded, setAdLoaded] = React.useState(false);
  const insRef = React.useRef(null);
  const canClose = seconds <= 0;

  React.useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  React.useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {}
    // Check if ad actually rendered after a short delay
    const check = setTimeout(() => {
      if (insRef.current && insRef.current.offsetHeight > 50) setAdLoaded(true);
    }, 2000);
    return () => clearTimeout(check);
  }, []);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '20px',
      WebkitOverflowScrolling: 'touch',
    }}>
      <div style={{
        background: '#1A1A2E', borderRadius: 20, padding: '24px 20px',
        maxWidth: 340, width: '100%', textAlign: 'center',
        boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
        border: '1px solid rgba(134,59,255,0.3)',
      }}>
        <div style={{ fontSize: 11, color: '#8B8BA3', marginBottom: 12, letterSpacing: 1.5, textTransform: 'uppercase' }}>Reklam Desteği</div>

        {adLoaded ? (
          <ins
            ref={insRef}
            className="adsbygoogle"
            style={{ display: 'block', minHeight: 250 }}
            data-ad-client={ADSENSE_CLIENT}
            data-ad-slot={ADSENSE_SLOT}
            data-ad-format="rectangle"
            data-full-width-responsive="false"
          />
        ) : (
          <div style={{
            minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg,#0F0F17,#1e1b4b)', borderRadius: 12, marginBottom: 4,
            flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontSize: 40 }}>🎮</div>
            <div style={{ fontSize: 15, color: '#E8E8ED', fontWeight: 700 }}>oyun.club</div>
            <div style={{ fontSize: 12, color: '#8B8BA3' }}>Reklam desteğin için teşekkürler!</div>
          </div>
        )}

        <div style={{ marginTop: 16, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {[...Array(5)].map((_,i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < (5 - seconds) ? '#863bff' : '#2A2A45', transition: 'background 0.4s' }} />
          ))}
        </div>

        <button
          onClick={canClose ? onClose : undefined}
          style={{
            padding: '13px 32px', borderRadius: 12, border: 'none',
            background: canClose ? 'linear-gradient(135deg,#863bff,#5b21b6)' : 'rgba(134,59,255,0.2)',
            color: canClose ? '#FFF' : '#8B8BA3', fontSize: 15, fontWeight: 700,
            cursor: canClose ? 'pointer' : 'default',
            transition: 'all 0.3s ease',
            width: '100%',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {canClose ? '▶ Oyuna Başla' : `${seconds} saniye...`}
        </button>
      </div>
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
  const EMPTY_STATS = { xox:{played:0,wins:0,losses:0}, minesweeper:{played:0,wins:0,losses:0}, rps:{played:0,wins:0,losses:0}, memory:{played:0,wins:0,losses:0}, snake:{played:0,wins:0,losses:0}, '2048':{played:0,wins:0,losses:0}, wordle:{played:0,wins:0,losses:0}, connectfour:{played:0,wins:0,losses:0}, dama:{played:0,wins:0,losses:0}, sudoku:{played:0,wins:0,losses:0}, gomoku:{played:0,wins:0,losses:0}, reaction:{played:0,wins:0,losses:0}, mathduel:{played:0,wins:0,losses:0}, cardbattle:{played:0,wins:0,losses:0}, memorybattle:{played:0,wins:0,losses:0}, wordrace:{played:0,wins:0,losses:0}, mangala:{played:0,wins:0,losses:0}, simon:{played:0,wins:0,losses:0}, lightsout:{played:0,wins:0,losses:0}, brickbreaker:{played:0,wins:0,losses:0}, nim:{played:0,wins:0,losses:0} };
  const [stats, setStats] = useState(() => { try { const s = localStorage.getItem('oyunclub_stats'); if (s) return JSON.parse(s); } catch {} return { games: EMPTY_STATS, history: [] }; });

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

  const showToast = (msg) => {
    setToast({ message: msg, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  };

  const handleGameEnd = (result) => {
    if (!selectedGame) return;
    setStats((prev) => {
      const gid = selectedGame.id;
      const gs = { ...(prev.games[gid] || { played: 0, wins: 0, losses: 0 }) };
      gs.played++;
      if (result === 'win') gs.wins++;
      else if (result === 'loss') gs.losses++;
      return {
        games: { ...prev.games, [gid]: gs },
        history: [...prev.history, { gameId: gid, result }],
      };
    });
  };

  const handleLogin = (userData) => {
    setUser(userData);
    setPage('lobby');
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
      default:
        return null;
    }
  };

  return (
    <>
      <GlobalStyle dark={dark} />
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
      {sock.gameInvite && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 600, background: 'linear-gradient(135deg,#863bff,#5b21b6)', color: '#fff', borderRadius: 16, padding: '16px 20px', boxShadow: '0 8px 32px rgba(134,59,255,0.4)', display: 'flex', alignItems: 'center', gap: 14, maxWidth: 340, width: 'calc(100vw - 40px)' }}>
          <div style={{ fontSize: 28 }}>🎮</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{sock.gameInvite.fromName} seni oyuna davet etti!</div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{GAMES.find(g => g.id === sock.gameInvite.gameId)?.name || 'Oyun'}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={() => { setRoomId(sock.gameInvite.roomId); setPage('multiplayer'); sock.clearGameInvite && sock.clearGameInvite(); }} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#fff', color: '#863bff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Katıl</button>
            <button onClick={() => sock.clearGameInvite && sock.clearGameInvite()} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Reddet</button>
          </div>
        </div>
      )}
      {sock.friendToast && (
        <div style={{ position: 'fixed', top: 70, right: 16, zIndex: 600, background: 'var(--surface)', color: 'var(--text)', borderRadius: 12, padding: '12px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '1px solid #863bff', fontSize: 13, fontWeight: 600, maxWidth: 260, animation: 'fadeUp 0.3s ease' }}>
          {sock.friendToast}
        </div>
      )}
      <div
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
          onLeaderboard={() => setPage('leaderboard')}
          onMultiplayer={() => setPage('multiplayer')}
          onHome={handleHome}
          dark={dark}
          onToggleDark={() => setDark((d) => !d)}
        />
        {page === 'lobby' && (
          <Lobby
            onSelectGame={handleSelectGame}
            onJoinRoom={handleJoinRoom}
            user={user}
            stats={stats}
          />
        )}
        {page === 'profile' && (
          <ProfilePage
            user={user}
            stats={stats}
            userAvatar={userAvatar}
            sock={sock}
            onAvatarChange={(e) => { setUserAvatar(e); try { localStorage.setItem('oyunclub_avatar', e); } catch {} }}
            onLogout={() => {
              setUser(null);
              setPage('login');
              setSelectedGame(null);
              setRoomId(null);
              localStorage.removeItem('oyunclub_user');
            }}
          />
        )}
        {page === 'leaderboard' && (
          <LeaderboardPage user={user} stats={stats} />
        )}
        {page === 'multiplayer' && (
          <MultiplayerLobby
            initialCode={roomId}
            initialGame={selectedGame?.id}
            userName={user ? user.name : ''}
            onSelectGame={handleSelectGame}
          />
        )}
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
