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
Use price action, tendência, leitura de velas e fluxo.

Retorne APENAS um JSON válido neste formato:

{
  "acao": "compra" | "venda" | "nao_operar",
  "confianca": 0-100,
  "comentario": "frase curta",
  "segundosAntesEntrada": 5-20
}

Velas:
${resumoVelas}
  `.trim();

  const body = {
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: 'Você é especialista em price action.' },
      { role: '
