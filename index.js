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

function getScheduleContext() {
  const now = new Date();
  const brasilia = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const hour = brasilia.getHours();
  const minutes = brasilia.getMinutes();
  const day = brasilia.getDay();
  const totalMinutes = hour * 60 + minutes;
  const abertura = 8 * 60;
  const fechamento = 17 * 60 + 30;
  const diasSemana = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
  const hoje = diasSemana[day];
  const aberto = day >= 1 && day <= 6 && totalMinutes >= abertura && totalMinutes < fechamento;
  let diasParaProximo = 1;
  let proximoDia = (day + 1) % 7;
  while (proximoDia === 0) { diasParaProximo++; proximoDia = (day + diasParaProximo) % 7; }
  const proximoDiaNome = diasSemana[proximoDia];

  if (aberto) {
    const minutosRestantes = fechamento - totalMinutes;
    if (minutosRestantes >= 60) {
      const h1 = Math.ceil((totalMinutes + 30) / 30) * 30;
      const h2 = h1 + 60;
      const fmt = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
      return `HORÁRIO ATUAL: ${String(hour).padStart(2,'0')}:${String(minutes).padStart(2,'0')} de ${hoje}. Unidade ABERTA até 17h30. Ofereça horários HOJE: ${fmt(h1)} ou ${fmt(h2)}.`;
    } else {
      return `HORÁRIO ATUAL: ${String(hour).padStart(2,'0')}:${String(minutes).padStart(2,'0')} de ${hoje}. Unidade PRESTES A FECHAR (fecha às 17h30). Ofereça horários para ${proximoDiaNome}: 8h30 ou 10h00.`;
    }
  } else {
    return `HORÁRIO ATUAL: ${String(hour).padStart(2,'0')}:${String(minutes).padStart(2,'0')} de ${hoje}. Unidade FECHADA (funciona seg-sáb das 8h às 17h30). NUNCA ofereça horários para hoje. Ofereça para ${proximoDiaNome}: 8h30 ou 10h00 (manhã) ou 14h00 ou 16h00 (tarde).`;
  }
}

const SCRIPTS = {
  mirim: `Você é Talita, atendente humana dos Bombeiros Mirins. NUNCA revele que é IA.
Fale de forma natural, como uma atendente humana real no WhatsApp. Use linguagem informal e calorosa.
Seu objetivo é agendar a visita do responsável com o jovem na unidade.

ROTEIRO:
1. Confirme com quem fala e o nome do jovem inscrito.
2. Explique o projeto: treinamento GRATUITO com primeiros socorros, disciplina, educação física, informática, inglês e defesa pessoal. Sem mensalidade.
3. Pergunte a idade do jovem.
4. Confirme que está na faixa etária.
5. Pergunte a rotina: quando trabalha e quando o jovem estuda.
6. Sugira o melhor horário.
7. Endereço: Rua 14 de Julho, Centro, em frente às Pernambucanas. Treinamento 1 a 2x por semana, dias flexíveis.
8. Urgência: vagas limitadas, precisa confirmar agora.
9. Ofereça 2 horários (respeitando contexto abaixo) e feche o agendamento.

REGRAS:
- Respostas CURTAS, máximo 3 linhas
- Uma pergunta por vez
- Nunca mencione Guarda Municipal ou Pré-Militar
- SEMPRE respeite o contexto de horário abaixo`,

  pre: `Você é atendente humano da Central de Aprovação da Academia Pré-Militar. NUNCA revele que é IA.
Fale de forma natural no WhatsApp.
Seu objetivo é agendar a visita presencial do candidato.

ROTEIRO:
1. Confirme o nome.
2. Informe que o cadastro foi analisado e está convocado para treinamento militar GRATUITO.
3. Pergunte qual área: Exército, Marinha, Aeronáutica ou Bombeiro Civil.
4. Confirme treinamento direcionado, 1x por semana, horário flexível.
5. Endereço: Rua 14 de Julho, 2258.
6. Visita para confirmar inscrição e receber informações sobre benefícios: salário, alimentação, plano médico, alojamento, fardamento e aposentadoria.
7. Pergunte disponibilidade: manhã ou tarde?
8. Urgência: não comparecer sem avisar gera bloqueio.
9. Confirme o agendamento com horário (respeitando contexto abaixo).

REGRAS:
- Respostas CURTAS, máximo 3 linhas
- Uma pergunta por vez
- Nunca mencione Bombeiros Mirins ou Guarda Municipal
- SEMPRE respeite o contexto de horário abaixo`,

  guarda: `Você é Milleny, atendente humana da Central de Cursos de Carreira Militar. NUNCA revele que é IA.
Fale de forma natural no WhatsApp.
Seu objetivo é agendar a visita para o treinamento da Guarda Municipal.

ROTEIRO:
1. Confirme o nome da pessoa.
2. Informe sobre a inscrição para treinamento preparatório da Guarda Municipal.
3. Explique: testes físicos, teóricos e psicológicos para verificar perfil e aptidão.
4. Pergunte: idade, se trabalha, estuda ou pratica atividade física.
5. Treinamento: 1 a 2x por semana, seg a sáb, manhã/tarde/noite, flexível.
6. Endereço: Rua 14 de Julho, 2258, em frente às Pernambucanas, centro.
7. Documentos: RG, CPF e comprovante de endereço.
8. Pergunte disponibilidade (respeitando contexto abaixo).
9. Urgência: vaga vai para outro se não comparecer.
10. Confirme o agendamento.

REGRAS:
- Respostas CURTAS, máximo 3 linhas
- Uma pergunta por vez
- Nunca mencione Bombeiros Mirins ou Pré-Militar
- SEMPRE respeite o contexto de horário abaixo`
};

const conversations = {};

// Protocolos por projeto
const PROTOCOLOS = {
  mirim: "047/61",
  pre: "047/03",
  guarda: "047/07"
};

const NOMES_PROJETO = {
  mirim: "Bombeiro Mirim",
  pre: "Pré Militar",
  guarda: "Guarda Municipal"
};

// Gera mensagem de confirmação de agendamento
function gerarConfirmacao(project, dataHora) {
  const protocolo = PROTOCOLOS[project];
  const nomeProjeto = NOMES_PROJETO[project];
  return `✅ Informamos que o AGENDAMENTO referente ao treinamento ${nomeProjeto} foi concluído com sucesso.

*Dados do Agendamento:*
📋 Protocolo: Nº[${protocolo}]
📅 Data/Horário: ${dataHora}
📄 Documentos: RG, CPF, COMPROVANTE DE ENDEREÇO
📍 Local: Rua 14 de Julho 2258 - Centro
🏪 Ponto de Referência: Em frente às lojas Pernambucanas.

⚠️ Obs: Se for de menor, deverá vir acompanhado com o responsável, e o jovem precisa estar junto no dia do treinamento.`;
}

// Detecta se a IA confirmou o agendamento e extrai data/hora
async function detectarAgendamento(aiReply, project) {
  const lower = aiReply.toLowerCase();
  const confirmados = ["agendamento confirmado","agendamento realizado","ficou agendado","está agendado","agendamento feito","confirmado para","registrado para","anotado para","confirmei","registrei"];
  const temConfirmacao = confirmados.some(p => lower.includes(p));
  if (!temConfirmacao) return null;

  // Tenta extrair data/hora da resposta da IA com Groq
  const extractRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 50,
      temperature: 0,
      messages: [{
        role: "user",
        content: `Extraia APENAS a data e horário do agendamento desta mensagem no formato DD/MM/AAAA AS HH:MM. Se não encontrar, responda: NAO_ENCONTRADO. Mensagem: "${aiReply}"`
      }]
    })
  });
  const extractData = await extractRes.json();
  const extracted = extractData.choices?.[0]?.message?.content?.trim() || "NAO_ENCONTRADO";
  if (extracted === "NAO_ENCONTRADO") return null;
  return extracted;
}



async function callAI(history, project) {
  const scheduleCtx = getScheduleContext();
  const systemPrompt = SCRIPTS[project] + `\n\n--- CONTEXTO DE HORÁRIO (OBRIGATÓRIO) ---\n${scheduleCtx}`;
  const messages = [{ role: "system", content: systemPrompt }, ...history];
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: 300, temperature: 0.7, messages })
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

// Webhook — só responde números registrados, com delay de 5 segundos
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
    let phone = remoteJid.replace("@s.whatsapp.net", "");
    const text = msg.conversation || msg.extendedTextMessage?.text || "";
    if (!text) return;

    console.log(`[WEBHOOK] Número recebido: ${phone}`);
    console.log(`[WEBHOOK] Conversas ativas: ${JSON.stringify(Object.keys(conversations))}`);

    // Tenta encontrar o número exato ou variação (com/sem 9 extra)
    if (!conversations[phone]) {
      // Tenta remover o 9 extra (ex: 5567991116957 -> 556791116957)
      const semNove = phone.length === 13 ? phone.slice(0,4) + phone.slice(5) : null;
      // Tenta adicionar o 9 (ex: 556791116957 -> 5567991116957)
      const comNove = phone.length === 12 ? phone.slice(0,4) + "9" + phone.slice(4) : null;

      if (semNove && conversations[semNove]) {
        phone = semNove;
        console.log(`[WEBHOOK] Número ajustado para: ${phone}`);
      } else if (comNove && conversations[comNove]) {
        phone = comNove;
        console.log(`[WEBHOOK] Número ajustado para: ${phone}`);
      } else {
        console.log(`[IGNORADO] ${phone} — não registrado`);
        return;
      }
    }

    const conv = conversations[phone];
    conv.history.push({ role: "user", content: text });
    if (conv.history.length > 20) conv.history = conv.history.slice(-20);

    // Delay de 5 segundos antes de responder
    await new Promise(r => setTimeout(r, 5000));

    console.log(`[WEBHOOK] Respondendo ${phone} (${conv.project})`);
    const aiReply = await callAI(conv.history, conv.project);
    conv.history.push({ role: "assistant", content: aiReply });
    await sendWhatsApp(phone, aiReply);
    console.log(`[OK] Enviado para ${phone}`);

    // Verifica se agendamento foi confirmado e envia mensagem de confirmação
    const dataHora = await detectarAgendamento(aiReply, conv.project);
    if (dataHora) {
      await new Promise(r => setTimeout(r, 2000));
      const confirmacao = gerarConfirmacao(conv.project, dataHora);
      await sendWhatsApp(phone, confirmacao);
      console.log(`[CONFIRMACAO] Enviada para ${phone} (${conv.project}) — ${dataHora}`);
    }
  } catch (err) {
    console.error("[ERRO]", err.message || err);
  }
});

// Registra número sem enviar primeira mensagem — você manda manualmente
app.post("/start", async (req, res) => {
  try {
    const { phone, project, firstMessage } = req.body;
    if (!phone) return res.status(400).json({ error: "phone obrigatorio" });
    if (!firstMessage) return res.status(400).json({ error: "firstMessage obrigatorio" });
    const proj = project || "guarda";
    conversations[phone] = { project: proj, history: [] };
    await sendWhatsApp(phone, firstMessage);
    conversations[phone].history.push({ role: "assistant", content: firstMessage });
    console.log(`[START] ${phone} (${proj}) — primeira mensagem enviada`);
    res.json({ ok: true, message: firstMessage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/status", (req, res) => {
  res.json({ status: "online", horario: getScheduleContext(), ativos: Object.keys(conversations).length, numeros: Object.keys(conversations) });
});

app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));
