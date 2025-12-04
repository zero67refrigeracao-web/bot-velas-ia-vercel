import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    const { velas, priceAction, timeframe, acertoMin } = req.body;

    if (!velas || velas.length < 3) {
      return res.status(400).json({
        erro: "Velas insuficientes",
        sinal: "NÃO OPERAR"
      });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // CHAMADA GPT REAL
    const resposta = await openai.chat.completions.create({
      model: "gpt-5.1-mini",
      messages: [
        {
          role: "system",
          content:
            "Você é um analista profissional de price action. Retorne APENAS JSON válido."
        },
        {
          role: "user",
          content: `
ANÁLISE DE VELAS:
${JSON.stringify(velas)}

PRICE ACTION TÉCNICO:
${JSON.stringify(priceAction)}

TIMEFRAME: ${timeframe}

RETORNE APENAS:
{
"sinal": "COMPRA|VENDA|NÃO OPERAR",
"motivo": "...",
"prob": "XX%"
}
`
        }
      ]
    });

    let saida = resposta.choices[0].message.content;

    try {
      saida = JSON.parse(saida);
    } catch (e) {
      // fallback para não quebrar resposta
      saida = {
        sinal: "NÃO OPERAR",
        motivo: "Falha ao interpretar JSON da IA",
        prob: "0%"
      };
    }

    // RETORNAR PARA EXTENSÃO
    return res.status(200).json(saida);

  } catch (err) {
    console.error("Erro backend IA:", err);
    return res.status(500).json({
      erro: "Falha no servidor",
      sinal: "NÃO OPERAR"
    });
  }
}
