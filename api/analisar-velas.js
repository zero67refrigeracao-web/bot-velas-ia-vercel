const { kv } = require('@vercel/kv');

const CONFIG_KEY = 'bot-velas:config';
const HISTORY_KEY = 'bot-velas:historico';

function defaultConfig() {
  return {
    timeframe: 'M1',
    acerto: 80,
    camadas: 3,
    analises: 5,
    modo: 'manual',
    stats: {
      totalSinais: 0
    }
  };
}

async function loadConfig() {
  const cfg = await kv.get(CONFIG_KEY);
  if (!cfg) return defaultConfig();
  return { ...defaultConfig(), ...cfg };
}

async function saveConfig(config) {
  await kv.set(CONFIG_KEY, config);
}

async function registrarHistorico(entry) {
  await kv.lpush(HISTORY_KEY, JSON.stringify(entry));
  await kv.ltrim(HISTORY_KEY, 0, 499);
}

async function chamarOpenAI(velas, config) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurada nas variáveis de ambiente da Vercel');
  }

  const resumoVelas = JSON.stringify(velas).slice(0, 4000);

  const prompt = `
Você é um bot profissional de análise de velas para opções binárias.
Use price action, tendência, força das velas e contexto.
O usuário deseja um alvo de acerto de ${config.acerto}% e até ${config.camadas} camadas de proteção.

Retorne APENAS um JSON VÁLIDO:

{
  "acao": "compra" | "venda" | "nao_operar",
  "confianca": 0-100,
  "comentario": "comentário curto",
  "segundosAntesEntrada": 5-20
}

Velas:
${resumoVelas}
  `.trim();
  const body = {
    model: 'gpt-4.1-mini',
    messages: [
      {
        role: 'system',
        content: 'Você é um especialista em price action e análise de velas.'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.4
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error('Erro HTTP da OpenAI: ' + response.status + ' - ' + txt);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content || '';

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    parsed = {
      acao: 'nao_operar',
      confianca: 0,
      comentario: 'Falha ao interpretar JSON.',
      segundosAntesEntrada: 10
    };
  }

  return parsed;
} // FIM DA PARTE 2
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST em /api/analisar-velas' });
  }

  // Leitura correta do body (POST)
  let body = req.body;
  if (!body || Object.keys(body).length === 0) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try {
      body = JSON.parse(raw);
    } catch {
      body = {};
    }
  }

  // Se não vier velas, cria exemplo padrão
  let velas = Array.isArray(body.velas) ? body.velas : [];
  if (!velas.length) {
    velas = [
      { open: 1.1670, close: 1.1672, high: 1.1673, low: 1.1668, time: Date.now() }
    ];
  }

  const configReq = body.config || {};
  const configAtual = await loadConfig();
  const config = { ...configAtual, ...configReq };

  try {
    const sinalIA = await chamarOpenAI(velas, config);

    config.stats.totalSinais += 1;
    await saveConfig(config);

    await registrarHistorico({
      data: new Date().toISOString(),
      velas,
      configUsado: config,
      sinal: sinalIA
    });

    return res.status(200).json({
      ok: true,
      acao: sinalIA.acao || "nao_operar",
      confianca: sinalIA.confianca || 0,
      comentario: sinalIA.comentario || "",
      segundos: sinalIA.segundosAntesEntrada || 10
    });

  } catch (err) {
    console.error("ERRO API:", err);
    return res.status(500).json({
      error: 'Erro ao chamar IA',
      detalhe: err.message || String(err)
    });
  }
};
