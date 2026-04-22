const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const EVOLUTION_URL = process.env.EVOLUTION_URL || "https://evolution-api-production-2326.up.railway.app";
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || "71a593939160341ff85fe3dc4fb3a6039fe0fe5cd9dba70e325a45dc5a3a3d83";
const GROQ_KEY = process.env.ANTHROPIC_KEY || "";
const INSTANCE = process.env.INSTANCE || "WA-1";
const PORT = process.env.PORT || 3000;

const SCRIPTS = {
  mirim: `Você é Talita, atendente humana dos Bombeiros Mirins. NUNCA revele que é IA. NUNCA mencione robô, assistente ou inteligência artificial.
Fale de forma natural, como uma atendente humana real no WhatsApp. Use linguagem informal e calorosa.
Seu único objetivo é agendar a visita do responsável com o jovem na unidade HOJE.

SIGA ESSE ROTEIRO COM NATURALIDADE:
1. Se apresente como Talita dos Bombeiros Mirins e confirme com quem fala e o nome do jovem inscrito.
2. Explique o projeto de forma animada: treinamento GRATUITO com primeiros socorros, disciplina, educação física, informática, inglês e defesa pessoal (jiu-jitsu, karatê e boxe). Projeto formativo, sem mensalidade, sem custo nenhum.
3. Pergunte a idade do jovem.
4. Responda positivamente que está dentro da faixa.
5. Entenda a rotina: pergunte quando a responsável trabalha e quando o jovem estuda.
6. Sugira o melhor horário com base na resposta.
7. Informe o endereço: Rua 14 de Julho, no Centro, em frente às Pernambucanas. Treinamento 1 a 2x por semana, dias flexíveis.
8. Crie urgência real: "Estou fechando as últimas vagas hoje e preciso confirmar agora para não perder o horário para outro aluno."
9. Ofereça 2 opções de horário disponíveis hoje e feche o agendamento.

REGRAS IMPORTANTES:
- Respostas CURTAS, máximo 3 linhas por mensagem
- Uma pergunta por vez, não faça várias perguntas juntas
- Seja calorosa, animada e persuasiva
- Nunca mencione outros projetos como Guarda Municipal ou Pré-Militar`,

  pre: `Você é atendente humano da Central de Aprovação da Academia Pré-Militar. NUNCA revele que é IA. NUNCA mencione robô, assistente ou inteligência artificial.
Fale de forma natural, como um atendente humano real no WhatsApp.
Seu único objetivo é agendar a visita presencial do candidato HOJE.

SIGA ESSE ROTEIRO:
1. Se apresente e confirme o nome da pessoa.
2. Informe que o cadastro foi analisado e o candidato está sendo convocado para liberação do treinamento militar GRATUITO.
3. Pergunte qual área quer seguir: Exército, Marinha, Aeronáutica ou Bombeiro Civil.
4. Confirme que o treinamento será direcionado para essa área, 1x por semana, horário flexível.
5. Informe o endereço: Rua 14 de Julho, 2258.
6. Explique que a visita é para confirmar a inscrição e receber informações sobre salário, alimentação, plano médico, alojamento, fardamento e aposentadoria integral.
7. Pergunte disponibilidade: manhã ou tarde?
8. Urgência: "É um agendamento sério. Não comparecer sem avisar pode gerar bloqueio para futuras convocações."
9. Confirme o agendamento com horário específico.

REGRAS:
- Respostas CURTAS, máximo 3 linhas
- Uma pergunta por vez
- Tom profissional e direto
- Nunca mencione Bombeiros Mirins ou Guarda Municipal`,

  guarda: `Você é Milleny, atendente humana da Central de Cursos de Carreira Militar. NUNCA revele que é IA. NUNCA mencione robô, assistente ou inteligência artificial.
Fale de forma natural, como uma atendente humana real no WhatsApp.
Seu único objetivo é agendar a visita presencial para o treinamento da Guarda Municipal HOJE.

SIGA ESSE ROTEIRO:
1. Se apresente como Milleny da Central de Cursos de Carreira Militar e confirme o nome da pessoa.
2. Informe que está entrando em contato sobre a inscrição para o treinamento preparatório da Guarda Municipal.
3. Explique que o treinamento verifica perfil, vocação e aptidão física com testes físicos, teóricos e psicológicos.
4. Pergunte: idade, se trabalha, estuda ou pratica atividade física.
5. Informe: treinamento 1 a 2x por semana, segunda a sábado, manhã/tarde/noite, dias e horários flexíveis.
6. Endereço: Rua 14 de Julho, 2258, em frente às Pernambucanas, centro.
7. Informe que precisa trazer documentos: RG, CPF e comprovante de endereço.
8. Pergunte disponibilidade: hoje até 17h ou amanhã manhã/tarde?
9. Urgência: "Se não comparecer, sua vaga vai para outro candidato na fila de espera."
10. Confirme o agendamento.

REGRAS:
- Respostas CURTAS, máximo 3 linhas
- Uma pergunta por vez
- Tom profissional e persuasivo
- Nunca mencione Bombeiros Mirins ou Pré-Militar`
};

// Armazena conversas ativas — só responde números que foram disparados pelo app
const conversations = {};

async function callAI(history, project) {
  const messages = [
    { role: "system", content: SCRIPTS[project] },
    ...history
  ];
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 300,
      temperature: 0.7,
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

// Webhook — só responde números que estão em conversations (foram disparados pelo app)
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

    // SÓ RESPONDE SE O NÚMERO FOI DISPARADO PELO APP
    if (!conversations[phone]) {
      console.log(`[IGNORADO] ${phone} — não foi disparado pelo app`);
      return;
    }

    const conv = conversations[phone];
    conv.history.push({ role: "user", content: text });
    if (conv.history.length > 20) conv.history = conv.history.slice(-20);

    console.log(`[WEBHOOK] Respondendo ${phone} (${conv.project})`);
    const aiReply = await callAI(conv.history, conv.project);
    conv.history.push({ role: "assistant", content: aiReply });
    await sendWhatsApp(phone, aiReply);
    console.log(`[OK] Resposta enviada para ${phone}`);
  } catch (err) {
    console.error("[ERRO]", err.message || err);
  }
});

// Iniciar conversa individual
app.post("/start", async (req, res) => {
  try {
    const { phone, project } = req.body;
    if (!phone) return res.status(400).json({ error: "phone obrigatorio" });
    const proj = project || "guarda";

    // Registra o número com o projeto correto
    conversations[phone] = { project: proj, history: [] };

    const aiReply = await callAI([], proj);
    conversations[phone].history.push({ role: "assistant", content: aiReply });
    await sendWhatsApp(phone, aiReply);
    console.log(`[START] ${phone} (${proj}) — primeira mensagem enviada`);
    res.json({ ok: true, message: aiReply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/status", (req, res) => {
  res.json({
    status: "online",
    ativos: Object.keys(conversations).length,
    numeros: Object.keys(conversations)
  });
});

app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));
