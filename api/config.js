const { kv } = require('@vercel/kv');

const CONFIG_KEY = 'bot-velas:config';

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

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const config = await loadConfig();
    return res.status(200).json(config);
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (!body) {
      // fallback simples, caso body não venha parseado
      let raw = '';
      for await (const chunk of req) raw += chunk;
      try {
        body = JSON.parse(raw);
      } catch (e) {
        body = {};
      }
    }

    const atual = await loadConfig();

    const novo = {
      ...atual,
      timeframe: body.timeframe || atual.timeframe,
      acerto: Number(body.acerto || atual.acerto),
      camadas: Number(body.camadas || atual.camadas),
      analises: Number(body.analises || atual.analises),
      modo: body.modo || atual.modo,
      stats: atual.stats || { totalSinais: 0 }
    };

    await saveConfig(novo);
    return res.status(200).json({ ok: true, config: novo });
  }

  return res.status(405).json({ error: 'Método não suportado' });
};
