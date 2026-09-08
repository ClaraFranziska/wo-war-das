const realtimeClient = window.supabase.createClient(window.supabaseConfig.url, window.supabaseConfig.publishableKey);
const roomCode = new URLSearchParams(window.location.search).get('room') || 'HOCHZEIT';
const realtimeIsHost = new URLSearchParams(window.location.search).has('host');
let realtimeGame = null;
let realtimePlayer = null;
let realtimeChannel = null;

async function getOrCreateGame() {
  const existing = await realtimeClient.from('games').select('*').eq('room_code', roomCode).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;
  const created = await realtimeClient.from('games').insert({ room_code: roomCode }).select().single();
  if (created.error) throw created.error;
  return created.data;
}

async function loadRoundGuesses(round) {
  const guesses = await realtimeClient.from('guesses').select('*').eq('game_id', realtimeGame.id).eq('round_index', round);
  const players = await realtimeClient.from('players').select('id,name,team').eq('game_id', realtimeGame.id);
  if (guesses.error || players.error) return [];
  const playerById = Object.fromEntries(players.data.map(player => [player.id, player]));
  return guesses.data.map(guess => ({ ...guess, ...playerById[guess.player_id] })).filter(guess => guess.name);
}

async function loadAllGuesses() {
  const guesses = await realtimeClient.from('guesses').select('*').eq('game_id', realtimeGame.id);
  const players = await realtimeClient.from('players').select('id,name,team').eq('game_id', realtimeGame.id);
  if (guesses.error || players.error) return [];
  const playerById = Object.fromEntries(players.data.map(player => [player.id, player]));
  return guesses.data.map(guess => ({ ...guess, ...playerById[guess.player_id] })).filter(guess => guess.name);
}

function subscribeToRoom() {
  realtimeChannel = realtimeClient.channel(`game-${realtimeGame.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${realtimeGame.id}` }, async payload => {
      realtimeGame = payload.new;
      if (realtimeGame.status === 'guessing') window.showGuessRound(realtimeGame.round_index, realtimeGame.started_at);
      if (realtimeGame.status === 'results') window.showResults(await loadRoundGuesses(realtimeGame.round_index), await loadAllGuesses());
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'guesses', filter: `game_id=eq.${realtimeGame.id}` }, () => {
      if (!realtimeIsHost) document.getElementById('mapHint').textContent = 'Tipp gespeichert. Warte auf die Auflösung.';
      if (realtimeIsHost) hostMaybeEndRound();
    })
    .subscribe();
}

async function joinRealtimeRoom() {
  try {
    realtimeGame = await getOrCreateGame();
    const player = await realtimeClient.from('players').insert({ game_id: realtimeGame.id, name: document.getElementById('playerName').value.trim(), team: document.querySelector('input[name="team"]:checked').value }).select().single();
    if (player.error) throw player.error;
    realtimePlayer = player.data;
    document.getElementById('roomLabel').textContent = `Warteraum · ${roomCode}`;
    subscribeToRoom();
    if (realtimeGame.status === 'guessing') window.showGuessRound(realtimeGame.round_index, realtimeGame.started_at); else window.showWaitingRoom();
  } catch (error) {
    document.getElementById('roomLabel').textContent = 'Verbindungsfehler';
    console.warn('Raum konnte nicht betreten werden.', error.message);
  }
}

async function hostStartGame() {
  realtimeGame = await getOrCreateGame();
  subscribeToRoom();
  await realtimeClient.from('games').update({ status: 'guessing', round_index: 0, started_at: new Date().toISOString() }).eq('id', realtimeGame.id);
}

async function hostEndRound() {
  if (realtimeGame) await realtimeClient.from('games').update({ status: 'results' }).eq('id', realtimeGame.id);
}

async function hostMaybeEndRound() {
  if (!realtimeGame || realtimeGame.status !== 'guessing') return;
  const players = await realtimeClient.from('players').select('id', { count: 'exact', head: true }).eq('game_id', realtimeGame.id);
  const guesses = await realtimeClient.from('guesses').select('id', { count: 'exact', head: true }).eq('game_id', realtimeGame.id).eq('round_index', realtimeGame.round_index);
  if (!players.error && !guesses.error && players.count > 0 && guesses.count >= players.count) await hostEndRound();
}

async function hostNextRound() {
  if (!realtimeGame || realtimeGame.round_index >= rounds.length - 1) return;
  await realtimeClient.from('games').update({ status: 'guessing', round_index: realtimeGame.round_index + 1, started_at: new Date().toISOString() }).eq('id', realtimeGame.id);
}

async function hostResetGame() {
  if (!realtimeGame || !window.confirm('Neues Spiel starten und alle bisherigen Tipps löschen?')) return;
  await realtimeClient.from('guesses').delete().eq('game_id', realtimeGame.id);
  await realtimeClient.from('players').delete().eq('game_id', realtimeGame.id);
  await realtimeClient.from('games').update({ status: 'lobby', round_index: 0, started_at: null }).eq('id', realtimeGame.id);
  window.location.reload();
}

async function saveRealtimeGuess() {
  if (!realtimeGame || !realtimePlayer || !chosenPoint) return;
  const solution = rounds[roundIndex].solution;
  const month = Number(document.getElementById('guessMonth').value);
  const year = Number(document.getElementById('guessYear').value);
  const points = Math.max(0, 1000 - Math.round(Math.abs(year - solution.year) * 80 + Math.abs(month - solution.month) * 25));
  const result = await realtimeClient.from('guesses').upsert({ game_id: realtimeGame.id, player_id: realtimePlayer.id, round_index: roundIndex, month, year, latitude: chosenPoint.lat, longitude: chosenPoint.lng, points }, { onConflict: 'game_id,player_id,round_index' });
  if (result.error) document.getElementById('mapHint').textContent = 'Tipp konnte nicht gespeichert werden.';
  else { document.getElementById('submitGuess').disabled = true; document.getElementById('mapHint').textContent = 'Tipp gespeichert. Warte auf die Auflösung.'; }
}

window.joinRealtimeRoom = joinRealtimeRoom;
window.hostStartGame = hostStartGame;
window.hostEndRound = hostEndRound;
window.hostNextRound = hostNextRound;
window.hostResetGame = hostResetGame;
window.saveRealtimeGuess = saveRealtimeGuess;
