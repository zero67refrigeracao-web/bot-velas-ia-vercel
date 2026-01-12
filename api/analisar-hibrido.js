import Anthropic from "@anthropic-ai/sdk";

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

    const base64Image = print.split(",")[1];

    if (!base64Image) {
      return res.status(400).json({
        ok: false,
        erro: "Formato de imagem inválido",
        sinal: "NEUTRO",
      });
    }

    // FASE 1: CLAUDE VISION
    console.log(`[${new Date().toISOString()}] Fase 1: Claude Vision`);

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const promptClaude = `Você é um analista PROFISSIONAL de price action.

ANÁLISE VISUAL:
1. Identifique TODOS os padrões de candlesticks visíveis:
   - Martelo, Enforcado, Doji, Pinbar
   - Engolfo (bullish/bearish)
   - Estrela da manhã/tarde

2. Tendência atual (últimas 10-15 velas):
   - ALTA: maioria verde, topos ascendentes
   - BAIXA: maioria vermelha, fundos descendentes
   - LATERAL: sem direção clara

3. Suporte/Resistência:
   - Preço em nível importante?
   - Rejeição (pavios longos)?

4. Volume (se visível)

REGRAS DE SINAL:
- COMPRA: Reversão de alta + tendência anterior de baixa
- VENDA: Reversão de baixa + tendência anterior de alta
- NEUTRO: Lateral, sinais mistos

Timeframe: ${timeframe}
Confiança mínima: ${confiancaMinima}%

RESPONDA APENAS JSON:
{
  "sinal": "COMPRA|VENDA|NEUTRO",
  "confianca": 75,
  "padroes": ["martelo", "suporte"],
  "tendencia": "baixa",
  "motivo": "Martelo após queda forte",
  "volume": "crescente",
  "contexto": "Possível reversão para alta"
}`;

    const respostaClaude = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: base64Image,
              },
            },
            {
              type: "text",
              text: promptClaude,
            },
          ],
        },
      ],
    });

    let resultadoClaude;
    const textoClaude = respostaClaude.content[0].text;

    try {
      const jsonMatch = textoClaude.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        resultadoClaude = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("JSON não encontrado");
      }
    } catch (e) {
      console.error("Erro parse Claude:", e);
      return res.status(200).json({
        ok: true,
        sinal: "NEUTRO",
        confianca: 0,
        motivo: "Erro ao processar análise visual",
        fonte: "claude-erro",
      });
    }

    console.log("Claude:", resultadoClaude);

    // Se confiança muito baixa, retorna direto
    if (resultadoClaude.confianca < confiancaMinima - 10) {
      return res.status(200).json({
        ok: true,
        ...resultadoClaude,
        fonte: "claude-only",
        verificado: false,
      });
    }

    // FASE 2: GPT-4o CONFIRMAÇÃO
    console.log(`[${new Date().toISOString()}] Fase 2: GPT-4o confirmação`);

    const promptGPT = `Você é um trader experiente validando uma análise.

ANÁLISE PRÉVIA (Claude):
- Sinal: ${resultadoClaude.sinal}
- Confiança: ${resultadoClaude.confianca}%
- Padrões: ${resultadoClaude.padroes?.join(", ")}
- Tendência: ${resultadoClaude.tendencia}
- Motivo: ${resultadoClaude.motivo}

SUA TAREFA:
1. Confirme se concorda
2. Verifique sinais contraditórios
3. Ajuste a confiança se necessário

RESPONDA JSON:
{
  "concorda": true/false,
  "confiancaAjustada": 80,
  "observacoes": "Confirmo padrão, mas volume baixo",
  "sinaisContradicao": [],
  "recomendacao": "MANTER|AUMENTAR|DIMINUIR"
}`;

    const respostaGPT = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "Você valida análises técnicas. Responda APENAS JSON válido.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: promptGPT },
                { type: "image_url", image_url: { url: print } },
              ],
            },
          ],
          max_tokens: 300,
          temperature: 0.2,
        }),
      }
    );

    const dataGPT = await respostaGPT.json();

    let resultadoGPT;
    try {
      const textoGPT = dataGPT.choices[0].message.content;
      const jsonMatchGPT = textoGPT
        .replace(/```json|```/g, "")
        .match(/\{[\s\S]*\}/);
      if (jsonMatchGPT) {
        resultadoGPT = JSON.parse(jsonMatchGPT[0]);
      } else {
        throw new Error("JSON GPT não encontrado");
      }
    } catch (e) {
      console.error("Erro parse GPT:", e);
      return res.status(200).json({
        ok: true,
        ...resultadoClaude,
        fonte: "claude-only",
        verificado: false,
        avisoGPT: "Falha na confirmação",
      });
    }

    console.log("GPT confirmação:", resultadoGPT);

    // FASE 3: DECISÃO FINAL
    let sinalFinal = resultadoClaude.sinal;
    let confiancaFinal = resultadoClaude.confianca;

    if (!resultadoGPT.concorda) {
      confiancaFinal = Math.max(
        confiancaFinal - 15,
        resultadoGPT.confiancaAjustada || 60
      );
    } else {
      confiancaFinal = resultadoGPT.confiancaAjustada || confiancaFinal;
    }

    if (confiancaFinal < confiancaMinima) {
      sinalFinal = "NEUTRO";
    }

    if (resultadoGPT.recomendacao === "DIMINUIR") {
      sinalFinal = "NEUTRO";
      confiancaFinal = Math.max(confiancaFinal - 10, 50);
    }

    console.log(`[${new Date().toISOString()}] FINAL:`, {
      sinal: sinalFinal,
      confianca: confiancaFinal,
    });

    return res.status(200).json({
      ok: true,
      sinal: sinalFinal,
      confianca: confiancaFinal,
      motivo: resultadoClaude.motivo,
      padroes: resultadoClaude.padroes,
      tendencia: resultadoClaude.tendencia,
      volume: resultadoClaude.volume,
      contexto: resultadoClaude.contexto,
      verificacao: {
        gptConcorda: resultadoGPT.concorda,
        observacoesGPT: resultadoGPT.observacoes,
        sinaisContradicao: resultadoGPT.sinaisContradicao || [],
      },
      fonte: "hibrido",
      verificado: true,
      timestamp: new Date().toISOString(),
    });
  } catch (erro) {
    console.error("Erro handler:", erro);

    let mensagem = "Erro no servidor";
    if (erro.message?.includes("API key")) {
      mensagem = "Erro de autenticação";
    } else if (erro.message?.includes("rate limit")) {
      mensagem = "Limite de requisições atingido";
    }

    return res.status(500).json({
      ok: false,
      erro: mensagem,
      sinal: "NEUTRO",
      confianca: 0,
    });
  }
}
