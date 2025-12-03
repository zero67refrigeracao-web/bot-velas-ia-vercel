const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  res.status(200).json({
    ok: true,
    message: 'Backend de IA na Vercel funcionando.'
  });
};
