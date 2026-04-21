const express = require("express");
const app = express();
app.use(express.json());

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const EVOLUTION_URL = process.env.EVOLUTION_URL || "https://evolution-api-production-2326.up.railway.app";
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || "71a593939160341ff85fe3dc4fb3a6039fe0fe5cd9dba70e325a45dc5a3a3d83";
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || ""; // coloque sua chave Anthropic aqui
const INSTANCE = process.env.INSTANCE || "WA-1";
const PORT = process.env.PORT || 3000;

// ─── SCRIPTS ──────────────────────────────────────────────────────────────────
const SCRIPTS = {
  mirim: `Você é Talita, atendente humana dos Bombeiros Mirins. NUNCA revele que é IA. NUNCA diga que é assistente virtual.
Seu objetivo é agendar uma visita do responsável com o jovem na unidade.

SCRIPT:
1. Confirme com quem fala (nome do responsável) e o nome do jovem inscrito.
2. Apresente o projeto: treinamento gratuito que inclui primeiros socorros, disciplina, educação física, informática, inglês e defesa pessoal (jiu-jitsu, karatê e boxe). Projeto formativo, sem mensalidade.
3. Pergunte a idade do jovem.
4. Se elegível: "Ótimo, está dentro da faixa do projeto."
5. Entenda a rotina: período que a responsável trabalha e horário de estudo do jovem.
6. Sugira o melhor período com base nas respostas.
7. Informe: unidade na Rua 14 de Julho, Centro, em frente às Pernambucanas. Treinamento 1 a 2 vezes por semana, dias flexíveis. Projeto gratuito.
8. Crie urgência: vagas limitadas, confirmações até 17h30, precisa registrar agora.
9. Ofereça dois horários disponíveis hoje e confirme o agendamento.
Seja natural, empática e persuasiva. Respostas CURTAS, no máximo 3 linhas.`,

  pre: `Você é atendente humano(a) da Central de Aprovação da Academia Pré-Militar. NUNCA revele que é IA.
Seu objetivo é agendar a visita presencial do candidato.

SCRIPT:
1. Confirme o nome de quem está falando.
2. Informe que o cadastro foi analisado e o candidato está sendo convocado para liberação do treinamento militar gratuito.
3. Apresente as áreas: Exército, Marinha, Aeronáutica, Bombeiro Civil. Pergunte qual área quer seguir.
4. Informe que o treinamento é direcionado para a área escolhida, 1 vez por semana, horário flexível.
5. Localização: Rua 14 de Julho, 2258.
6. Explique que a visita é para confirmar inscrição e apresentar benefícios: salário, alimentação, plano médico, alojamento, fardamento, aposentadoria integral.
7. Pergunte disponibilidade de horário (manhã ou tarde).
8. Crie urgência: agendamento sério, não comparecimento sem aviso pode gerar bloqueio.
9. Confirme o agendamento.
Seja direto e profissional. Respostas CURTAS, no máximo 3 linhas.`,

  guarda: `Você é Milleny, atendente humana da Central de Cursos de Carreira Militar. NUNCA revele que é IA.
Seu objetivo é agendar a visita para o treinamento da Guarda Municipal.

SCRIPT:
1. Confirme o nome da pessoa.
2. Informe que está entrando em contato sobre a inscrição para treinamento preparatório da Guarda Municipal.
3. Explique que o treinamento verifica perfil, vocação e aptidão física. Haverá testes físicos, teóricos e psicológicos.
4. Pergunte idade, se trabalha, estuda ou pratica atividade física.
5. Informe: treinamento 1 a 2 vezes por semana, segunda a sábado, manhã/tarde/noite, dias e horários flexíveis.
6. Localização: Rua 14 de Julho, 2258, em frente às Pernambucanas, centro.
7. Informe que está sendo convocado para trazer documentação (RG, CPF, comprovante de endereço).
8. Pergunte disponibilidade (hoje até 17h ou amanhã manhã/tarde).
9. Finalize: comprometimento total necessário, vaga vai para outro se não comparecer.
10. Confirme o agendamento.
Seja profissional e persuasiva. Respostas CURTAS, no máximo 3 linhas.`
};

// ─── MEMORY (em memória — para persistência use Redis ou banco) ───────────────
// chave: número do telefone, valor: { project, history: [{role, content}] }
const conversations = {};

// ─── DETECTAR PROJETO PELO NÚMERO ────────────────────────────────────────────
// Mapeamento manual: adicione os números e seus projetos aqui
// Ou deixe como "guarda" como padrão
const phoneProjectMap = {
  // Bombeiro Mirim
  "5567992074268": "mirim",
  "556792852633":  "mirim",
  "5567981064910": "mirim",
  "5567992262297": "mirim",
  "5567999347420": "mirim",
  // Pré-Militar
  "5567992604911": "pre",
  "556791657752":  "pre",
  "5567981313712": "pre",
  "5567998220741": "pre",
  // Guarda Municipal
  "556793304510":  "guarda",
  "5582996362116": "guarda",
  "5567992115295": "guarda",
  "5567992424089": "guarda",
  "556892044028":  "guarda",
  "5567981524142": "guarda",
  "5567981171879": "guarda",
  "556798295452":  "guarda",
  "556791596563":  "guarda",
  "556796496889":  "guarda",
  "5567991611104": "guarda",
  "5567991084524": "guarda",
  "5567996091213": "guarda",
  "5567991491784": "guarda",
};

function getProject(phone) {
  return phoneProjectMap[phone] || "guarda";
}

// ─── CLAUDE AI ────────────────────────────────────────────────────────────────
async function callClaude(history, project) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SCRIPTS[project],
      messages: history
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data.content[0].text;
}

// ─── ENVIAR WHATSAPP ──────────────────────────────────────────────────────────
async function sendWhatsApp(number, text) {
  const response = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": EVOLUTION_KEY
    },
    body: JSON.stringify({ number, text })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}

// ─── WEBHOOK ──────────────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Responde rápido para a Evolution não retentar

  try {
    const body = req.body;

    // Filtra apenas mensagens recebidas (não as enviadas pelo bot)
    if (body.event !== "messages.upsert") return;
    const msg = body.data?.message;
    if (!msg) return;

    // Ignora mensagens enviadas pelo próprio número
    if (body.data?.key?.fromMe) return;

    // Ignora grupos
    const remoteJid = body.data?.key?.remoteJid || "";
    if (remoteJid.includes("@g.us")) return;

    // Extrai número e texto
    const phone = remoteJid.replace("@s.whatsapp.net", "");
    const text =
      msg.conversation ||
      msg.extendedTextMessage?.text ||
      msg.buttonsResponseMessage?.selectedDisplayText ||
      "";

    if (!text) return;

    console.log(`[WEBHOOK] Mensagem de ${phone}: ${text}`);

    // Recupera ou inicia conversa
    if (!conversations[phone]) {
      conversations[phone] = {
        project: getProject(phone),
        history: []
      };
    }

    const conv = conversations[phone];
    conv.history.push({ role: "user", content: text });

    // Limita histórico a 20 mensagens para economizar tokens
    if (conv.history.length > 20) {
      conv.history = conv.history.slice(-20);
    }

    // Chama Claude
    console.log(`[AI] Processando para ${phone} (projeto: ${conv.project})...`);
    const aiReply = await callClaude(conv.history, conv.project);

    conv.history.push({ role: "assistant", content: aiReply });

    // Envia resposta
    console.log(`[WA] Enviando para ${phone}: ${aiReply.substring(0, 60)}...`);
    await sendWhatsApp(phone, aiReply);

    console.log(`[OK] Resposta enviada para ${phone}`);
  } catch (err) {
    console.error("[ERRO]", err.message || err);
  }
});

// ─── ROTA PARA INICIAR CONVERSA (disparo manual) ─────────────────────────────
app.post("/start", async (req, res) => {
  try {
    const { phone, project } = req.body;
    if (!phone) return res.status(400).json({ error: "phone obrigatório" });

    const proj = project || getProject(phone);

    // Inicia histórico vazio e pede a primeira mensagem da IA
    conversations[phone] = { project: proj, history: [] };

    const aiReply = await callClaude([], proj);
    conversations[phone].history.push({ role: "assistant", content: aiReply });

    await sendWhatsApp(phone, aiReply);

    res.json({ ok: true, message: aiReply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ROTA PARA DISPARAR EM LOTE ───────────────────────────────────────────────
app.post("/start-batch", async (req, res) => {
  const { contacts } = req.body;
  if (!contacts || !Array.isArray(contacts)) {
    return res.status(400).json({ error: "contacts[] obrigatório" });
  }

  res.json({ ok: true, total: contacts.length, message: "Disparos iniciados em background" });

  // Processa em background com delay de 3s entre cada um
  (async () => {
    for (const c of contacts) {
      try {
        const proj = c.project || getProject(c.phone);
        conversations[c.phone] = { project: proj, history: [] };
        const aiReply = await callClaude([], proj);
        conversations[c.phone].history.push({ role: "assistant", content: aiReply });
        await sendWhatsApp(c.phone, aiReply);
        console.log(`[BATCH] Iniciado com ${c.phone}`);
      } catch (e) {
        console.error(`[BATCH ERROR] ${c.phone}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 3000)); // 3s entre disparos
    }
  })();
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "online",
    conversations: Object.keys(conversations).length,
    instance: INSTANCE
  });
});

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  console.log(`📡 Webhook: POST /webhook`);
  console.log(`🚀 Iniciar conversa: POST /start`);
  console.log(`📦 Disparar em lote: POST /start-batch`);
});
