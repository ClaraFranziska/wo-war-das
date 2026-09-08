const photoBase = 'https://raw.githubusercontent.com/ClaraFranziska/wo-war-das/main/Fotos/';
const rounds = [
  { solution: { month: 7, year: 2017, lat: 52.4876, lng: 13.4218, place: 'Hasenheide 10, Berlin' }, photo: `${photoBase}IMG_3564.JPG` },
  { solution: { month: 6, year: 2026, lat: 52.4887, lng: 13.4288, place: 'Lenaustraße 10, Berlin' }, photo: `${photoBase}image.JPG` },
  { solution: { month: 7, year: 2024, lat: 42.80593, lng: 13.88372, place: '42.80593° N, 13.88372° O' }, photo: `${photoBase}IMG_2287.JPG` },
  { solution: { month: 7, year: 2026, lat: 52.5147, lng: 13.2395, place: 'Olympiastadion Berlin' }, photo: `${photoBase}e47d3fe2-3add-4a13-9565-724239dd4b26.JPG` },
  { solution: { month: 9, year: 2024, lat: 54.53244, lng: 11.07387, place: '54.53244° N, 11.07387° O' }, photo: `${photoBase}IMG_3574.JPG` }
];
const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const isHost = new URLSearchParams(window.location.search).has('host');
let roundIndex = 0;
let guessMap;
let resultMap;
let marker;
let chosenPoint = null;
let timerId;
let seconds = 60;
const $ = id => document.getElementById(id);

document.body.classList.toggle('player-mode', !isHost);
document.body.classList.toggle('host-mode', isHost);
$('roomLabel').textContent = isHost ? 'Beamer · Host-Ansicht' : 'Warteraum · HOCHZEIT';
$('phaseLabel').textContent = `Runde 1 von ${rounds.length}`;

function fillDates() {
  if ($('guessMonth').options.length) return;
  months.forEach((month, index) => $('guessMonth').add(new Option(month, index + 1)));
  for (let year = 2017; year <= 2026; year++) $('guessYear').add(new Option(year, year));
  $('guessMonth').value = 7;
  $('guessYear').value = 2024;
}

function initMap() {
  if (guessMap) return;
  guessMap = L.map('map', { zoomControl: false }).setView([51.2, 10.4], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(guessMap);
  guessMap.on('click', event => {
    chosenPoint = event.latlng;
    if (marker) marker.remove();
    marker = L.marker(chosenPoint).addTo(guessMap);
    $('mapHint').textContent = 'Ort gesetzt. Du kannst ihn noch verschieben.';
    $('submitGuess').disabled = false;
  });
}

function startTimer() {
  clearInterval(timerId);
  seconds = 60;
  $('timer').textContent = '01:00';
  timerId = setInterval(() => {
    seconds -= 1;
    $('timer').textContent = `00:${String(seconds).padStart(2, '0')}`;
    if (seconds <= 0) {
      clearInterval(timerId);
      $('submitGuess').disabled = true;
      $('mapHint').textContent = 'Die Zeit ist abgelaufen. Warte auf die Auflösung.';
      if (isHost && window.hostEndRound) window.hostEndRound();
    }
  }, 1000);
}

function showWaitingRoom() {
  $('joinScreen').classList.add('hidden');
  $('gameScreen').classList.remove('hidden');
  $('guessView').classList.add('hidden');
  $('resultsView').classList.add('hidden');
  $('gameTitle').textContent = 'Warte auf den Host';
  $('timer').textContent = '—';
}

function showGuessRound(index) {
  roundIndex = index;
  $('joinScreen').classList.add('hidden');
  $('gameScreen').classList.remove('hidden');
  $('guessView').classList.remove('hidden');
  $('resultsView').classList.add('hidden');
  $('gameTitle').textContent = 'Wo und wann ist dieses Foto entstanden?';
  $('phaseLabel').textContent = `Runde ${roundIndex + 1} von ${rounds.length}`;
  $('roundNumber').textContent = roundIndex + 1;
  $('roundPhoto').src = rounds[roundIndex].photo;
  chosenPoint = null;
  if (marker) marker.remove();
  marker = null;
  $('mapHint').textContent = 'Tippe auf die Karte, um deinen Ort zu setzen.';
  $('submitGuess').disabled = true;
  if (!isHost) {
    fillDates();
    initMap();
    setTimeout(() => guessMap.invalidateSize(), 0);
  }
  startTimer();
}

function showResults(guesses = []) {
  clearInterval(timerId);
  $('guessView').classList.add('hidden');
  $('resultsView').classList.remove('hidden');
  $('gameTitle').textContent = 'Die Tipps sind da';
  $('timer').textContent = 'AUFLÖSUNG';
  renderResults(guesses);
}

function renderResults(guesses) {
  const solution = rounds[roundIndex].solution;
  $('solutionTitle').textContent = `${months[solution.month - 1]} ${solution.year} · ${solution.place}`;
  if (resultMap) resultMap.remove();
  resultMap = L.map('resultMap', { zoomControl: false }).setView([solution.lat, solution.lng], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(resultMap);
  L.marker([solution.lat, solution.lng]).addTo(resultMap).bindPopup('Richtiger Ort').openPopup();
  guesses.forEach(guess => L.circleMarker([guess.latitude, guess.longitude], { radius: 7, color: guess.team === 'braut' ? '#47715c' : '#de725f', fillOpacity: .8 }).addTo(resultMap));
  $('timeline').innerHTML = guesses.map(guess => `<div class="timeline-point ${guess.month === solution.month && guess.year === solution.year ? 'correct' : ''}"><small>${guess.month}/${guess.year}</small><i></i><small>${guess.name}</small></div>`).join('');
  $('scoreRows').innerHTML = guesses.map(guess => `<div class="score-row"><span>${guess.name}</span><span>${guess.team === 'braut' ? 'Braut' : 'Bräutigam'}</span><strong>${guess.points}</strong></div>`).join('') || '<p class="map-hint">Noch keine Tipps abgegeben.</p>';
  const bride = guesses.filter(guess => guess.team === 'braut');
  const groom = guesses.filter(guess => guess.team === 'braeutigam');
  $('brideScore').textContent = Math.round(bride.reduce((sum, guess) => sum + guess.points, 0) / (bride.length || 1)).toLocaleString('de-DE');
  $('groomScore').textContent = Math.round(groom.reduce((sum, guess) => sum + guess.points, 0) / (groom.length || 1)).toLocaleString('de-DE');
}

window.showResults = showResults;
window.showGuessRound = showGuessRound;
window.showWaitingRoom = showWaitingRoom;

if (isHost) {
  $('joinForm').classList.add('hidden');
  $('hostPanel').classList.remove('hidden');
  new QRCode($('hostQr'), { text: `${window.location.origin}${window.location.pathname}?room=HOCHZEIT`, width: 196, height: 196, colorDark: '#172523', colorLight: '#ffffff' });
  $('startGame').addEventListener('click', () => window.hostStartGame && window.hostStartGame());
} else {
  $('joinForm').addEventListener('submit', event => { event.preventDefault(); window.joinRealtimeRoom && window.joinRealtimeRoom(); });
}

$('submitGuess').addEventListener('click', () => window.saveRealtimeGuess && window.saveRealtimeGuess());
$('nextRound').addEventListener('click', () => window.hostNextRound && window.hostNextRound());
