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
      if (realtimeGame.status === 'guessing') {
        window.showGuessRound(realtimeGame.round_index, realtimeGame.started_at);
        if (realtimeIsHost) updateHostProgress(realtimeGame.round_index);
      }
      if (realtimeGame.status === 'results') window.showResults(await loadRoundGuesses(realtimeGame.round_index), await loadAllGuesses());
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'guesses', filter: `game_id=eq.${realtimeGame.id}` }, () => {
      if (!realtimeIsHost) document.getElementById('mapHint').textContent = 'Tipp gespeichert. Warte auf die Auflösung.';
      if (realtimeIsHost) updateHostProgress(realtimeGame.round_index);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${realtimeGame.id}` }, () => {
      updateLobbyPlayers();
      if (realtimeIsHost) updateHostProgress(realtimeGame.round_index);
    })
    .subscribe();
  if (realtimeIsHost) updateHostProgress();
}

async function joinRealtimeRoom() {
  try {
    realtimeGame = await getOrCreateGame();
    const player = await realtimeClient.from('players').insert({ game_id: realtimeGame.id, name: document.getElementById('playerName').value.trim(), team: document.querySelector('input[name="team"]:checked').value }).select().single();
    if (player.error) throw player.error;
    realtimePlayer = player.data;
    document.getElementById('roomLabel').textContent = `Warteraum · ${roomCode}`;
    subscribeToRoom();
    updateLobbyPlayers();
    window.setInterval(updateLobbyPlayers, 2000);
    if (realtimeGame.status === 'guessing') window.showGuessRound(realtimeGame.round_index, realtimeGame.started_at); else window.showWaitingRoom();
  } catch (error) {
    document.getElementById('roomLabel').textContent = 'Verbindungsfehler';
    console.warn('Raum konnte nicht betreten werden.', error.message);
  }
}

async function hostStartGame() {
  realtimeGame = await getOrCreateGame();
  if (!realtimeChannel) subscribeToRoom();
  const startedAt = new Date().toISOString();
  const result = await realtimeClient.from('games').update({ status: 'guessing', round_index: -1, started_at: startedAt }).eq('id', realtimeGame.id);
  if (!result.error) {
    realtimeGame = { ...realtimeGame, status: 'guessing', round_index: -1, started_at: startedAt };
    window.showGuessRound(-1, startedAt);
    updateHostProgress(-1);
  }
}

async function hostEndRound() {
  if (realtimeGame && realtimeGame.status === 'guessing') {
    const result = await realtimeClient.from('games').update({ status: 'results' }).eq('id', realtimeGame.id);
    if (!result.error) window.showResults(await loadRoundGuesses(realtimeGame.round_index), await loadAllGuesses());
  }
}

async function updateHostProgress(expectedRound = realtimeGame?.round_index) {
  if (!realtimeGame || realtimeGame.status !== 'guessing') return;
  const players = await realtimeClient.from('players').select('id', { count: 'exact', head: true }).eq('game_id', realtimeGame.id);
  const guesses = await realtimeClient.from('guesses').select('id', { count: 'exact', head: true }).eq('game_id', realtimeGame.id).eq('round_index', expectedRound);
  if (realtimeGame.round_index !== expectedRound) return;
  if (!players.error && !guesses.error) {
    document.getElementById('guessProgress').textContent = `${guesses.count || 0}/${players.count || 0}`;
  }
}

  async function updateLobbyPlayers() {
    if (!realtimeGame) return;
    const players = await realtimeClient.from('players').select('team').eq('game_id', realtimeGame.id);
    if (players.error) return;
    const brideCount = players.data.filter(player => player.team === 'braut').length;
    const groomCount = players.data.filter(player => player.team === 'braeutigam').length;
    if (document.getElementById('lobbyPlayerCount')) document.getElementById('lobbyPlayerCount').textContent = players.data.length;
    if (document.getElementById('lobbyTeamCount')) document.getElementById('lobbyTeamCount').textContent = `${brideCount} Team Braut · ${groomCount} Team Bräutigam`;
    if (document.getElementById('playerLobbyCount')) document.getElementById('playerLobbyCount').textContent = `${players.data.length} angemeldet`;
    if (document.getElementById('playerTeamCount')) document.getElementById('playerTeamCount').textContent = `${brideCount} Team Braut · ${groomCount} Team Bräutigam`;
  }

async function hostNextRound() {
  if (!realtimeGame || realtimeGame.round_index >= rounds.length - 1) return;
  const nextRound = realtimeGame.round_index + 1;
  const startedAt = new Date().toISOString();
  const result = await realtimeClient.from('games').update({ status: 'guessing', round_index: nextRound, started_at: startedAt }).eq('id', realtimeGame.id);
  if (!result.error) {
    realtimeGame = { ...realtimeGame, status: 'guessing', round_index: nextRound, started_at: startedAt };
    window.showGuessRound(nextRound, startedAt);
    updateHostProgress(nextRound);
  }
}

async function hostResetGame() {
  if (!window.confirm('Neues Spiel starten und alle bisherigen Gäste und Tipps löschen?')) return;
  const game = realtimeGame || await getOrCreateGame();
  const guesses = await realtimeClient.from('guesses').delete().eq('game_id', game.id);
  const players = await realtimeClient.from('players').delete().eq('game_id', game.id);
  const remainingPlayers = await realtimeClient.from('players').select('id', { count: 'exact', head: true }).eq('game_id', game.id);
  const reset = await realtimeClient.from('games').update({ status: 'lobby', round_index: 0, started_at: null }).eq('id', game.id);
  if (guesses.error || players.error || reset.error || remainingPlayers.error || (remainingPlayers.count || 0) > 0) {
    console.warn('Spiel konnte nicht vollständig zurückgesetzt werden.', guesses.error || players.error || reset.error);
    window.alert('Die alten Gäste konnten nicht gelöscht werden. Bitte zuerst das aktualisierte supabase-schema.sql in Supabase ausführen.');
    return;
  }
  window.location.reload();
}

function haversineDistanceKm(latitudeA, longitudeA, latitudeB, longitudeB) {
  const earthRadiusKm = 6371;
  const toRadians = degrees => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function getDistancePenalty(distanceKm) {
  if (distanceKm <= 1) return 0;
  if (distanceKm <= 10) return 100;
  if (distanceKm <= 50) return 200;
  if (distanceKm <= 150) return 300;
  if (distanceKm <= 300) return 400;
  if (distanceKm < 500) return 450;
  return 500;
}

async function saveRealtimeGuess() {
  if (!realtimeGame || !realtimePlayer || !chosenPoint) return;
  const solution = roundIndex < 0 ? practiceRound.solution : rounds[roundIndex].solution;
  const month = Number(document.getElementById('guessMonth').value);
  const year = Number(document.getElementById('guessYear').value);
  const timePenalty = Math.abs(year - solution.year) * 150 + Math.abs(month - solution.month) * 30;
  const distanceKm = haversineDistanceKm(chosenPoint.lat, chosenPoint.lng, solution.lat, solution.lng);
  const distancePenalty = getDistancePenalty(distanceKm);
  const timePoints = Math.max(0, 500 - timePenalty);
  const locationPoints = Math.max(0, 500 - distancePenalty);
  const points = timePoints + locationPoints;
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

if (realtimeIsHost) {
  getOrCreateGame().then(game => {
    realtimeGame = game;
    subscribeToRoom();
    updateLobbyPlayers();
    window.setInterval(updateLobbyPlayers, 2000);
  }).catch(error => console.warn('Host-Raum konnte nicht geladen werden.', error.message));
}
