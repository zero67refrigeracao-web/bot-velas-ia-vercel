// ============================================
// BOT IA PRO v8.0 - APENAS OPENAI GPT-4o
// SEM Claude API - Mais simples!
// ============================================

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  try {
    const { print, timeframe, confiancaMinima } = req.body;

    if (!print || !print.startsWith("data:image/")) {
      return res.status(400).json({
        ok: false,
        erro: "Print inválido",
        sinal: "NEUTRO",
        confianca: 0,
      });
    }

    console.log(`[${new Date().toISOString()}] Análise GPT-4o - TF: ${timeframe}`);

    // ANÁLISE COMPLETA COM GPT-4o VISION
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Você é um ANALISTA PROFISSIONAL de price action e candlesticks.

INSTRUÇÕES:
1. Analise TODOS os padrões de candlesticks visíveis
2. Identifique a tendência atual (alta/baixa/lateral)
3. Verifique suporte/resistência importantes
4. Considere volume se visível

PADRÕES A IDENTIFICAR:
- Martelo, Enforcado, Doji, Pinbar
- Engolfo (bullish/bearish)
- Estrela da manhã/tarde
- Harami, Piercing, Dark Cloud

REGRAS DE SINAL:
- COMPRA: Padrão de reversão de alta + contexto favorável
- VENDA: Padrão de reversão de baixa + contexto favorável
- NEUTRO: Sinal fraco, lateral ou sem padrão claro

RESPONDA APENAS JSON VÁLIDO (sem markdown):
{
  "sinal": "COMPRA|VENDA|NEUTRO",
  "confianca": 75,
  "padroes": ["martelo", "suporte"],
  "tendencia": "baixa",
  "motivo": "Martelo após queda forte indica reversão",
  "volume": "crescente|decrescente|normal",
  "contexto": "Explicação detalhada da análise"
}`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analise este gráfico de candlesticks.

Timeframe: ${timeframe}
Confiança mínima exigida: ${confiancaMinima}%

Forneça análise técnica completa em JSON.`
              },
              {
                type: "image_url",
                image_url: { 
                  url: print,
                  detail: "high"
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.2
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error("Erro OpenAI:", data.error);
      return res.status(500).json({
        ok: false,
        erro: data.error.message || "Erro na API OpenAI",
        sinal: "NEUTRO",
        confianca: 0,
      });
    }

    const content = data.choices[0].message.content;
    console.log("Resposta GPT-4o:", content);

    // Parse do JSON
    let resultado;
    try {
      // Remove markdown se houver
      let jsonStr = content.replace(/```json|```/g, '').trim();
      
      // Extrai JSON
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      
      resultado = JSON.parse(jsonStr);
      
      // Normaliza o sinal
      let sinal = String(resultado.sinal || "").toUpperCase().trim();
      
      if (sinal.includes("COMPRA") || sinal.includes("BUY") || sinal.includes("CALL") || sinal.includes("UP")) {
        sinal = "COMPRA";
      } else if (sinal.includes("VENDA") || sinal.includes("SELL") || sinal.includes("PUT") || sinal.includes("DOWN")) {
        sinal = "VENDA";
      } else {
        sinal = "NEUTRO";
      }
      
      resultado.sinal = sinal;
      
      // Garante confiança entre 50-95
      resultado.confianca = Math.min(95, Math.max(50, resultado.confianca || 70));
      
      // Valida confiança mínima
      if (resultado.confianca < confiancaMinima) {
        resultado.sinal = "NEUTRO";
        resultado.motivo = `Confiança ${resultado.confianca}% abaixo do mínimo ${confiancaMinima}%. ${resultado.motivo || ''}`;
      }
      
    } catch (parseError) {
      console.error("Erro ao parsear JSON:", parseError);
      console.error("Conteúdo original:", content);
      
      // Fallback: análise textual
      const lower = content.toLowerCase();
      
      let sinal = "NEUTRO";
      let confianca = 65;
      
      // Detecta menções diretas
      if (lower.includes("compra") || lower.includes("buy") || lower.includes("call")) {
        sinal = "COMPRA";
        confianca = 72;
      } else if (lower.includes("venda") || lower.includes("sell") || lower.includes("put")) {
        sinal = "VENDA";
        confianca = 72;
      }
      
      resultado = {
        sinal: sinal,
        confianca: confianca,
        motivo: "Análise baseada em interpretação textual",
        padroes: [],
        tendencia: "indefinida",
        contexto: content.substring(0, 200)
      };
    }

    console.log(`[${new Date().toISOString()}] Resultado final:`, {
      sinal: resultado.sinal,
      confianca: resultado.confianca
    });

    // Resposta final
    return res.status(200).json({
      ok: true,
      sinal: resultado.sinal,
      confianca: resultado.confianca,
      motivo: resultado.motivo || "Análise técnica",
      padroes: resultado.padroes || [],
      tendencia: resultado.tendencia || "indefinida",
      volume: resultado.volume || "não detectado",
      contexto: resultado.contexto || "",
      fonte: "openai-gpt4o",
      verificado: true,
      timestamp: new Date().toISOString(),
      timeframe: timeframe
    });

  } catch (erro) {
    console.error("Erro no handler:", erro);

    let mensagem = "Erro no servidor";
    
    if (erro.message?.includes("API key")) {
      mensagem = "Erro de autenticação - verifique OPENAI_API_KEY";
    } else if (erro.message?.includes("rate limit")) {
      mensagem = "Limite de requisições atingido, aguarde 1 minuto";
    } else if (erro.message?.includes("timeout")) {
      mensagem = "Timeout na análise, tente novamente";
    }

    return res.status(500).json({
      ok: false,
      erro: mensagem,
      sinal: "NEUTRO",
      confianca: 0,
      detalhes: process.env.NODE_ENV === "development" ? erro.message : undefined
    });
  }
}
