// Arquivo de teste SIMPLES para verificar se Vercel detecta /api/

export default function handler(req, res) {
  res.status(200).json({ 
    status: "ok",
    mensagem: "API funcionando!",
    timestamp: new Date().toISOString()
  });
}
