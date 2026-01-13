// ============================================
// BOT IA PRO - BACKEND COMPLETO
// Análise de candlesticks com OpenAI
// ============================================

import OpenAI from "openai";

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only POST
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  try {
    const { velas, priceAction, timeframe, acertoMin } = req.body;

    // Validação
    if (!velas || velas.length < 3) {
      return res.status(400).json({
        erro: "Velas insuficientes",
        sinal: "NÃO OPERAR",
        confianca: 0
      });
    }

    // Inicializar OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    console.log(`[${new Date().toISOString()}] Análise - TF: ${timeframe}, Velas: ${velas.length}`);

    // CHAMADA GPT
    const resposta = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Você é um analista profissional de price action. Retorne APENAS JSON válido."
        },
        {
          role: "user",
          content: `
ANÁLISE DE VELAS:
${JSON.stringify(velas)}

PRICE ACTION TÉCNICO:
${JSON.stringify(priceAction)}

TIMEFRAME: ${timeframe}

Analise os padrões de candlestick e retorne:

RETORNE APENAS:
{
  "sinal": "COMPRA|VENDA|NÃO OPERAR",
  "motivo": "...",
  "prob": "XX%"
}
`
        }
      ],
      max_tokens: 200,
      temperature: 0.15
    });

    let saida = resposta.choices[0].message.content;

    try {
      // Remove markdown
      saida = saida.replace(/```json|```/g, '').trim();
      
      // Extrai JSON
      const jsonMatch = saida.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        saida = jsonMatch[0];
      }
      
      saida = JSON.parse(saida);
      
      // Normaliza sinal
      if (saida.sinal) {
        const sinalUpper = String(saida.sinal).toUpperCase();
        if (sinalUpper.includes('COMPRA') || sinalUpper.includes('BUY')) {
          saida.sinal = 'COMPRA';
        } else if (sinalUpper.includes('VENDA') || sinalUpper.includes('SELL')) {
          saida.sinal = 'VENDA';
        } else {
          saida.sinal = 'NÃO OPERAR';
        }
      }
      
      // Garante prob como string
      if (saida.prob && !saida.prob.includes('%')) {
        saida.prob = saida.prob + '%';
      }
      
    } catch (e) {
      console.error("Erro parse JSON:", e);
      saida = {
        sinal: "NÃO OPERAR",
        motivo: "Falha ao interpretar JSON da IA",
        prob: "0%"
      };
    }

    console.log(`[${new Date().toISOString()}] Resultado:`, saida);

    // Retornar
    return res.status(200).json({
      ok: true,
      ...saida,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("Erro backend:", err);
    
    let mensagem = "Falha no servidor";
    if (err.message?.includes('API key')) {
      mensagem = "Erro de autenticação - configure OPENAI_API_KEY";
    } else if (err.message?.includes('rate limit')) {
      mensagem = "Limite de requisições atingido";
    }
    
    return res.status(500).json({
      erro: mensagem,
      sinal: "NÃO OPERAR",
      confianca: 0
    });
  }
}
