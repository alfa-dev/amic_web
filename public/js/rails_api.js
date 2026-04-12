function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

export async function createSession(robotName, emotionPoints, stamina) {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() },
    body: JSON.stringify({ session: { robot_name: robotName, emotion_start: emotionPoints, stamina_start: stamina } }),
  });
  const data = await res.json();
  return data.id;
}

export async function saveMessage(sessionId, role, content, emotionPoints, stamina) {
  await fetch(`/api/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() },
    body: JSON.stringify({ message: { role, content, emotion_points: emotionPoints, stamina } }),
  });
}

export async function updateSession(sessionId, emotionPoints, stamina) {
  await fetch(`/api/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() },
    body: JSON.stringify({ session: { emotion_end: emotionPoints, stamina_end: stamina, ended_at: new Date().toISOString() } }),
  });
}
