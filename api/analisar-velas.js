// API SEM BANCO, APENAS OPENAI
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST em /api/analisar-velas' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY não configurada na Vercel.' });
  }

  // LER BODY (caso req.body venha vazio)
  let body = req.body;
  if (!body || Object.keys(body).length === 0) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try { body = JSON.parse(raw); }
    catch { body = {}; }
  }

  // PEGAR VELAS DO BODY
  let velas = Array.isArray(body.velas) ? body.velas : [];

  // fallback
  if (!velas.length) {
    velas = [
      { open: 1.1000, close: 1.1015, high: 1.1021, low: 1.0997 },
      { open: 1.1015, close: 1.1002, high: 1.1032, low: 1.0990 }
    ];
  }

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Você é um analista de velas extremamente preciso."
          },
          {
            role: "user",
            content: `Analise essas velas: ${JSON.stringify(velas)}`
          }
        ]
      })
    });

    const json = await r.json();

    return res.status(200).json({
      ok: true,
      resposta: json
    });

  } catch (err) {
    return res.status(500).json({
      error: "Erro na IA",
      detalhe: String(err)
    });
  }
};
