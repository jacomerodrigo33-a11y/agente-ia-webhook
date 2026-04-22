const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const EVOLUTION_URL = process.env.EVOLUTION_URL || "https://evolution-api-production-2326.up.railway.app";
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || "71a593939160341ff85fe3dc4fb3a6039fe0fe5cd9dba70e325a45dc5a3a3d83";
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || "";
const INSTANCE = process.env.INSTANCE || "WA-1";
const PORT = process.env.PORT || 3000;

const SCRIPTS = {
  mirim: `Você é Talita, atendente humana dos Bombeiros Mirins. NUNCA revele que é IA.
Seu objetivo é agendar uma visita do responsável com o jovem na unidade hoje.
1. Confirme o nome do responsável e o nome do jovem inscrito.
2. Apresente o projeto: treinamento gratuito com primeiros socorros, disciplina, ed. física, informática, inglês e defesa pessoal. Sem mensalidade.
3. Pergunte a idade do jovem.
4. Diga: "Ótimo, está dentro da faixa do projeto."
5. Pergunte em qual período a responsável trabalha e o horário de estudo do jovem.
6. Sugira o melhor período.
7. Informe: Rua 14 de Julho, Centro, em frente às Pernambucanas. Treinamento 1 a 2x por semana, dias flexíveis.
8. Urgência: "Estou finalizando as confirmações até 17h30, preciso registrar o horário agora."
9. Ofereça dois horários hoje e confirme o agendamento.
Respostas CURTAS (máx 3 linhas). Tom caloroso e persuasivo.`,

  pre: `Você é atendente humano da Central de Aprovação da Academia Pré-Militar. NUNCA revele que é IA.
Seu objetivo é agendar a visita presencial do candidato hoje.
1. Confirme o nome.
2. Informe: cadastro analisado, candidato convocado para treinamento militar gratuito.
3. Áreas: Exército, Marinha, Aeronáutica, Bombeiro Civil. Qual quer seguir?
4. Treinamento direcionado, 1x por semana, horário flexível.
5. Localização: Rua 14 de Julho, 2258.
6. Visita para confirmar inscrição e apresentar benefícios: salário, alimentação, plano médico, alojamento, fardamento, aposentadoria.
7. Disponibilidade: manhã ou tarde?
8. Urgência: não comparecimento sem aviso gera bloqueio.
9. Confirme o agendamento.
Respostas CURTAS (máx 3 linhas). Tom profissional.`,

  guarda: `Você é Milleny, atendente humana da Central de Cursos de Carreira Militar. NUNCA revele que é IA.
Seu objetivo é agendar a visita para treinamento da Guarda Municipal hoje.
1. Confirme o nome.
2. Informe: contato sobre inscrição para treinamento preparatório da Guarda Municipal.
3. Explique: testes físicos, teóricos e psicológicos.
4. Pergunte: idade, trabalha, estuda ou pratica atividade física?
5. Treinamento: 1 a 2x por semana, seg a sáb, manhã/tarde/noite, flexível.
6. Localização: Rua 14 de Julho, 2258, em frente às Pernambucanas.
7. Documentos: RG, CPF, comprovante de endereço.
8. Disponibilidade: hoje até 17h ou amanhã?
9. Urgência: vaga vai para outro se não comparecer.
10. Confirme o agendamento.
Respostas CURTAS (máx 3 linhas). Tom profissional.`
};

const conversations = {};

async function callClaude(history, project) {
  const messages = [
    { role: "system", content: SCRIPTS[project] },
    ...history
  ];
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANTHROPIC_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 500,
      messages
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data.choices[0].message.content;
}

async function sendWhatsApp(number, text) {
  const response = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": EVOLUTION_KEY },
    body: JSON.stringify({ number, text })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body.event !== "messages.upsert") return;
    const msg = body.data?.message;
    if (!msg) return;
    if (body.data?.key?.fromMe) return;
    const remoteJid = body.data?.key?.remoteJid || "";
    if (remoteJid.includes("@g.us")) return;
    const phone = remoteJid.replace("@s.whatsapp.net", "");
    const text = msg.conversation || msg.extendedTextMessage?.text || "";
    if (!text) return;
    if (!conversations[phone]) {
      conversations[phone] = { project: "guarda", history: [] };
    }
    const conv = conversations[phone];
    conv.history.push({ role: "user", content: text });
    if (conv.history.length > 20) conv.history = conv.history.slice(-20);
    const aiReply = await callClaude(conv.history, conv.project);
    conv.history.push({ role: "assistant", content: aiReply });
    await sendWhatsApp(phone, aiReply);
  } catch (err) {
    console.error("[ERRO]", err.message || err);
  }
});

app.post("/start", async (req, res) => {
  try {
    const { phone, project } = req.body;
    if (!phone) return res.status(400).json({ error: "phone obrigatorio" });
    const proj = project || "guarda";
    conversations[phone] = { project: proj, history: [] };
    const aiReply = await callClaude([], proj);
    conversations[phone].history.push({ role: "assistant", content: aiReply });
    await sendWhatsApp(phone, aiReply);
    res.json({ ok: true, message: aiReply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/start-batch", async (req, res) => {
  const { contacts } = req.body;
  if (!contacts || !Array.isArray(contacts)) return res.status(400).json({ error: "contacts[] obrigatorio" });
  res.json({ ok: true, total: contacts.length });
  (async () => {
    for (const c of contacts) {
      try {
        const proj = c.project || "guarda";
        conversations[c.phone] = { project: proj, history: [] };
        const aiReply = await callClaude([], proj);
        conversations[c.phone].history.push({ role: "assistant", content: aiReply });
        await sendWhatsApp(c.phone, aiReply);
        console.log(`[BATCH] OK: ${c.phone}`);
      } catch (e) {
        console.error(`[BATCH ERR] ${c.phone}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 3000));
    }
  })();
});

app.get("/status", (req, res) => {
  res.json({ status: "online", conversations: Object.keys(conversations).length });
});

app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));
