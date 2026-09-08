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
  const created = await realtimeClient.from('games').insert({room_code: roomCode}).select().single();
  if (created.error) throw created.error;
  return created.data;
}

async function joinRealtimeRoom() {
  try {
    realtimeGame = await getOrCreateGame();
    const player = await realtimeClient.from('players').insert({
      game_id: realtimeGame.id,
      name: document.getElementById('playerName').value.trim(),
      team: document.querySelector('input[name="team"]:checked').value
    }).select().single();
    if (player.error) throw player.error;
    realtimePlayer = player.data;
    document.getElementById('roomLabel').textContent = `Raum ${roomCode}`;
    subscribeToRoom();
  } catch (error) {
    console.warn('Supabase ist noch nicht eingerichtet. Demo bleibt aktiv.', error.message);
  }
}

function subscribeToRoom() {
  realtimeChannel = realtimeClient.channel(`game-${realtimeGame.id}`)
    .on('postgres_changes', {event:'*', schema:'public', table:'games', filter:`id=eq.${realtimeGame.id}`}, payload => {
      realtimeGame = payload.new;
      if (realtimeGame.status === 'results' && !document.getElementById('resultsView').classList.contains('hidden')) return;
      if (realtimeGame.status === 'results') {
        document.getElementById('submitGuess').disabled = true;
        if (!realtimeIsHost && typeof window.showResults === 'function') window.showResults();
      }
    })
    .on('postgres_changes', {event:'INSERT', schema:'public', table:'guesses', filter:`game_id=eq.${realtimeGame.id}`}, () => {
      document.getElementById('mapHint').textContent = 'Dein Tipp wurde gespeichert. Warte auf die Auflösung.';
    })
    .subscribe();
}

async function saveRealtimeGuess() {
  if (!realtimeGame || !realtimePlayer || !chosenPoint) return;
  const solution = rounds[roundIndex].solution;
  const month = Number(document.getElementById('guessMonth').value);
  const year = Number(document.getElementById('guessYear').value);
  const points = Math.max(0, 1000 - Math.round(Math.abs(year - solution.year) * 80 + Math.abs(month - solution.month) * 25));
  const result = await realtimeClient.from('guesses').upsert({
    game_id: realtimeGame.id, player_id: realtimePlayer.id, round_index: roundIndex,
    month, year, latitude: chosenPoint.lat, longitude: chosenPoint.lng, points
  }, {onConflict:'game_id,player_id,round_index'});
  if (result.error) console.warn('Tipp konnte nicht gespeichert werden.', result.error.message);
  if (realtimeIsHost) {
    await realtimeClient.from('games').update({status:'results'}).eq('id', realtimeGame.id);
  }
}

document.getElementById('joinForm').addEventListener('submit', () => { joinRealtimeRoom(); });
document.getElementById('submitGuess').addEventListener('click', saveRealtimeGuess);
