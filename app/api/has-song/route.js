import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const EXT = /\.(mp3|ogg|wav|m4a|aac|opus)$/i;

// Looks into  public/audio/  and tells the browser which real songs exist:
//   a file with "birthday" (or "bday") in its name -> plays in a loop as the party music for everybody
//   a file with "party", "dance" or "disco" in its name -> plays only for people standing on the dance floor
// If a kind is missing, the built-in synthesized music is used for it.
export function GET() {
  let files = [];
  try { files = fs.readdirSync(path.join(process.cwd(), 'public', 'audio')).filter((f) => EXT.test(f)); } catch { files = []; }
  const url = (f) => (f ? `/audio/${encodeURIComponent(f)}` : null);
  const party = files.find((f) => /party|dance|disco/i.test(f));
  const birthday = files.find((f) => /birthday|bday/i.test(f) && f !== party);
  return Response.json({ birthday: url(birthday), party: url(party), ok: !!party });
}
