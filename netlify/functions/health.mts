// Reports which integrations are switched on. Never returns secret values.
import { claudeConfigured } from './_lib/claude';
import { db } from './_lib/db';
import { json } from './_lib/http';

export default async () =>
  json(200, {
    ok: true,
    database: db() !== null,
    aiParse: claudeConfigured('parse'),
    aiWrite: claudeConfigured('write'),
  });
