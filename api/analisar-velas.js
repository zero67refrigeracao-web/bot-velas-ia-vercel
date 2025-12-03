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
  // Usamos lista na KV (Redis)
  await kv.lpush(HISTORY_KEY, JSON.stringify(entry));
  // Mantém apenas os 500 últimos
  await kv.ltrim(HISTORY_KEY, 0, 499);
}

async function chamarOpenAI(velas, config) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurada nas variáveis de ambiente da Vercel');
  }

  const resumoVelas = JSON.stringify(velas).slice(0, 4000);

  const prompt = `
Você é um bot profissional de análise de velas para opções binárias.
Use price action simples, leitura de tendência, força das velas e contexto.
O usuário deseja um alvo aproximado de acerto de ${config.acerto}%,
com até ${config.camadas} camadas de proteção e ${config.analises} análises por entrada.

Retorne APENAS um JSON VÁLIDO no seguinte formato:

{
  "acao": "compra" | "venda" | "nao_operar",
  "confianca": 0-100,
  "comentario": "explicação curta em português",
  "segundosAntesEntrada": 5-20
}

NUNCA retorne texto fora do JSON.

Velas (mais antiga primeiro, mais recente por último):
${resumoVelas}
  `.trim();

  const body = {
    model: 'gpt-4.1-mini',
    messages: [
      {
        role: 'system',
        content: 'Você é um especialista em price action, foco em opções binárias e digitais. Responda sempre em português do Brasil.'
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
  const choice = data.choices && data.choices[0];
  const content = (choice && choice.message && choice.message.content) || '';

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    parsed = {
      acao: 'nao_operar',
      confianca: 0,
      comentario: 'Falha ao interpretar JSON da IA. Conteúdo bruto: ' + String(content).slice(0, 200),
      segundosAntesEntrada: 10
    };
  }

  if (!parsed.acao) parsed.acao = 'nao_operar';
  if (typeof parsed.confianca !== 'number') parsed.confianca = 0;
  if (!parsed.comentario) parsed.comentario = '';
  if (!parsed.segundosAntesEntrada) parsed.segundosAntesEntrada = 10;

  return parsed;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST em /api/analisar-velas' });
  }

  let body = req.body;
  if (!body) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try {
      body = JSON.parse(raw);
    } catch (e) {
      body = {};
    }
  }

  const velas = Array.isArray(body.velas) ? body.velas : [];
  if (!velas.length) {
    return res.status(400).json({ error: "Envie um array 'velas' com dados." });
  }

  const configReq = body.config || {};
  const configAtual = await loadConfig();
  const config = {
    ...configAtual,
    ...configReq
  };

  try {
    const sinal = await chamarOpenAI(velas, config);

    config.stats = config.stats || { totalSinais: 0 };
    config.stats.totalSinais += 1;
    await saveConfig(config);

    await registrarHistorico({
      data: new Date().toISOString(),
      velas,
      configUsado: config,
      sinal
    });

    return res.status(200).json({ ok: true, sinal, configAtual: config });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Erro ao chamar IA',
      detalhe: err.message || String(err)
    });
  }
};
